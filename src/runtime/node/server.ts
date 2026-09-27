import type { Server } from 'node:http';
import { SupabaseAuthVerifier } from '../../auth/supabase-auth-verifier';
import {
  createRuntimeLog,
  describeFailure,
  type RuntimeLog,
} from './diagnostics';
import { createNodeHttpServer } from './http-adapter';
import {
  createPersistentApiFromResources,
  resolveMemoryProvider,
  type PersistentApiRuntime,
} from './persistent-api';
import {
  createNodePostgresResources,
  type NodePostgresResources,
} from './postgres-pool';
import type { DatabaseRuntimeConfig } from './database-config';
import {
  createPostgresReadinessProbe,
  createReadinessGate,
  type ReadinessGate,
} from './readiness';
import {
  ConfigurationError,
  describeConfigurationProblems,
  readProductionRuntimeConfig,
  type ProductionRuntimeConfig,
} from './server-config';

/**
 * Production server runtime for the privileged Node/Hono Operations API.
 *
 * Startup order is part of the contract:
 *
 * 1. validate the complete configuration contract (no socket, no pool yet)
 * 2. construct the auth verifier, memory adapter, and PostgreSQL pool
 * 3. prove the database reachable within the readiness budget
 * 4. bind the HTTP socket and start serving
 *
 * Any failure in that sequence is deterministic: the process logs variable
 * names and fixed reasons, releases whatever it already opened, and exits
 * non-zero. Startup never creates or mutates schema — DDL stays in reviewed
 * migrations applied out of band.
 *
 * Shutdown is equally ordered: readiness flips to unavailable first so the
 * gateway stops routing, in-flight requests drain inside a deadline, then the
 * HTTP socket and the database pool are closed.
 */

export type TerminationSignal = 'SIGTERM' | 'SIGINT';
export type FatalCondition = 'uncaughtException' | 'unhandledRejection';

/** Process-facing surface the runtime needs, injectable for tests. */
export interface ProductionServerHost {
  readonly env: NodeJS.ProcessEnv;
  readonly log: RuntimeLog;
  onSignal(signal: TerminationSignal, handler: (signal: string) => void): void;
  onFatal(condition: FatalCondition, handler: (error: unknown) => void): void;
}

export interface BoundAddress {
  readonly host: string;
  readonly port: number;
}

export interface ProductionServer {
  readonly config: ProductionRuntimeConfig;
  readonly address: BoundAddress;
  readonly readiness: ReadinessGate;
  /** Idempotent; a second call escalates to forcing connections closed. */
  shutdown(reason: string): Promise<void>;
}

/**
 * Optional infrastructure seams.
 *
 * The default wiring is the production wiring; a test may substitute the
 * PostgreSQL resources so lifecycle behavior can be observed without a live
 * database. Nothing here can relax configuration, authentication, or
 * readiness rules.
 */
export interface ProductionServerDependencies {
  readonly createResources?:
    | ((config: DatabaseRuntimeConfig) => NodePostgresResources)
    | undefined;
}

/** Startup failure after configuration was read; carries the failed stage. */
export class ServerStartupError extends Error {
  public constructor(
    public readonly stage: 'configuration' | 'database' | 'transport',
    message: string,
  ) {
    super(message);
    this.name = 'ServerStartupError';
  }
}

/** Pool close gets the shutdown budget that HTTP draining left behind. */
const MINIMUM_DATABASE_CLOSE_MS = 500;

async function withDeadline(
  pending: Promise<void>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending.then(
        () => true,
        () => false,
      ),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function listen(
  server: Server,
  host: string,
  port: number,
): Promise<BoundAddress> {
  return new Promise<BoundAddress>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.removeListener('error', onError);
      reject(error);
    };
    server.once('error', onError);
    server.listen(port, host, () => {
      server.removeListener('error', onError);
      const bound = server.address();
      resolve(
        bound !== null && typeof bound === 'object'
          ? { host: bound.address, port: bound.port }
          : { host, port },
      );
    });
  });
}

async function closeQuietly(resources: NodePostgresResources): Promise<void> {
  try {
    await resources.close();
  } catch {
    // A pool that never connected can still reject on end(); startup is
    // already failing, and there is nothing left to release.
  }
}

function readConfig(host: ProductionServerHost): ProductionRuntimeConfig {
  try {
    return readProductionRuntimeConfig(host.env);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      host.log.fail(
        `configuration rejected (profile ${error.profile}, ${error.problems.length} problem(s))`,
      );
      for (const line of describeConfigurationProblems(error.problems)) {
        host.log.fail(`- ${line}`);
      }
    } else {
      host.log.fail(`configuration rejected: ${describeFailure(error)}`);
    }
    throw new ServerStartupError('configuration', 'configuration rejected');
  }
}

/**
 * Validate configuration, assemble the runtime, prove the database, and bind
 * the HTTP socket.
 *
 * @throws {ServerStartupError} with resources already released.
 */
export async function startProductionServer(
  host: ProductionServerHost,
  dependencies: ProductionServerDependencies = {},
): Promise<ProductionServer> {
  const { log } = host;
  const config = readConfig(host);
  const createResources =
    dependencies.createResources ?? createNodePostgresResources;

  log.info(
    `configuration accepted (profile ${config.profile}, listen ${config.server.host}:${config.server.port})`,
  );
  log.info(
    `trusted browser origins: ${config.allowedOrigins.join(', ')}`,
  );

  let resources: NodePostgresResources;
  try {
    resources = createResources(config.database);
  } catch (error) {
    log.fail(`postgres pool construction failed: ${describeFailure(error)}`);
    throw new ServerStartupError('database', 'postgres pool construction failed');
  }

  const readiness = createReadinessGate(
    createPostgresReadinessProbe(
      resources.rawPool,
      config.server.readinessTimeoutMs,
    ),
  );

  let runtime: PersistentApiRuntime;
  try {
    const authVerifier = new SupabaseAuthVerifier(config.auth);
    runtime = createPersistentApiFromResources(
      resources,
      authVerifier,
      config.allowedOrigins,
      resolveMemoryProvider(config.memory),
      readiness.probe,
    );
  } catch (error) {
    await closeQuietly(resources);
    log.fail(`runtime assembly failed: ${describeFailure(error)}`);
    throw new ServerStartupError(
      'configuration',
      'runtime assembly failed',
    );
  }

  // A wrong DATABASE_URL must fail here rather than produce an instance that
  // boots and then reports unavailable forever. The check is `select 1`:
  // startup proves reachability, it never inspects or mutates schema.
  if (!(await readiness.probe.check())) {
    await closeQuietly(resources);
    log.fail(
      'database readiness check failed at startup; refusing to serve traffic',
    );
    throw new ServerStartupError(
      'database',
      'database readiness check failed at startup',
    );
  }

  const server = createNodeHttpServer(runtime.app, {
    requestTimeoutMs: config.server.requestTimeoutMs,
    keepAliveTimeoutMs: config.server.keepAliveTimeoutMs,
    onTransportError: (error) => {
      log.warn(`transport failure: ${describeFailure(error)}`);
    },
  });

  let address: BoundAddress;
  try {
    address = await listen(server, config.server.host, config.server.port);
  } catch (error) {
    await closeQuietly(resources);
    log.fail(`http listen failed: ${describeFailure(error)}`);
    throw new ServerStartupError('transport', 'http listen failed');
  }

  log.info(`listening on ${address.host}:${address.port}`);

  let shutdownPromise: Promise<void> | null = null;

  const performShutdown = async (reason: string): Promise<void> => {
    const startedAt = Date.now();
    log.info(`shutdown started (${reason})`);

    // Flip the traffic switch before draining so the gateway stops routing
    // new work to an instance that is about to disappear.
    readiness.drain();

    // One close() with its completion callback, then drop sockets that are
    // doing nothing so only genuinely in-flight work is waited for.
    const closed = new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    server.closeIdleConnections();

    const drained = await withDeadline(
      closed,
      config.server.shutdownTimeoutMs,
    );
    if (!drained) {
      log.warn(
        'shutdown deadline exceeded; forcing remaining connections closed',
      );
      server.closeAllConnections();
    }

    const remaining = Math.max(
      MINIMUM_DATABASE_CLOSE_MS,
      config.server.shutdownTimeoutMs - (Date.now() - startedAt),
    );
    const released = await withDeadline(runtime.close(), remaining);
    if (!released) {
      log.warn('database pool did not release within the shutdown deadline');
    }

    log.info('shutdown complete');
  };

  return {
    config,
    address,
    readiness,
    shutdown(reason: string): Promise<void> {
      if (shutdownPromise === null) {
        shutdownPromise = performShutdown(reason);
        return shutdownPromise;
      }
      // A repeated signal escalates: stop waiting for stubborn clients.
      log.warn(`shutdown already in progress (${reason}); forcing connections closed`);
      server.closeAllConnections();
      return shutdownPromise;
    },
  };
}

/**
 * Run the server for the lifetime of the process and resolve with the exit
 * code the deployment platform should observe.
 *
 * `0` means a clean, fully drained shutdown. `1` means the process refused to
 * start or was torn down after a fatal condition.
 */
export async function runProductionServer(
  host: ProductionServerHost,
  dependencies: ProductionServerDependencies = {},
): Promise<number> {
  let server: ProductionServer;
  try {
    server = await startProductionServer(host, dependencies);
  } catch (error) {
    const stage =
      error instanceof ServerStartupError ? error.stage : 'configuration';
    host.log.fail(`startup aborted (${stage}); no traffic was served`);
    return 1;
  }

  return new Promise<number>((resolve) => {
    let settled = false;
    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      resolve(code);
    };

    const terminate = (reason: string, code: number): void => {
      server.shutdown(reason).then(
        () => finish(code),
        (error: unknown) => {
          host.log.fail(`shutdown failed: ${describeFailure(error)}`);
          finish(1);
        },
      );
    };

    host.onSignal('SIGTERM', (signal) => terminate(signal, 0));
    host.onSignal('SIGINT', (signal) => terminate(signal, 0));
    host.onFatal('uncaughtException', (error) => {
      host.log.fail(`uncaught exception: ${describeFailure(error)}`);
      terminate('uncaughtException', 1);
    });
    host.onFatal('unhandledRejection', (error) => {
      host.log.fail(`unhandled rejection: ${describeFailure(error)}`);
      terminate('unhandledRejection', 1);
    });
  });
}

/** Real process wiring; kept out of the testable runtime above. */
export function createProcessHost(): ProductionServerHost {
  const log = createRuntimeLog({
    stdout: (line) => {
      process.stdout.write(line);
    },
    stderr: (line) => {
      process.stderr.write(line);
    },
  });

  return {
    env: process.env,
    log,
    onSignal(signal, handler) {
      process.once(signal, () => handler(signal));
    },
    onFatal(condition, handler) {
      if (condition === 'uncaughtException') {
        process.once('uncaughtException', (error: unknown) => handler(error));
        return;
      }
      process.once('unhandledRejection', (reason: unknown) => handler(reason));
    },
  };
}
