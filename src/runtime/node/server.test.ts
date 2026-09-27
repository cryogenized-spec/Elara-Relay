// @vitest-environment node
import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { RuntimeLog } from './diagnostics';
import type { NodePostgresResources } from './postgres-pool';
import {
  createProcessHost,
  runProductionServer,
  ServerStartupError,
  startProductionServer,
  type FatalCondition,
  type ProductionServer,
  type ProductionServerHost,
  type TerminationSignal,
} from './server';

const OWNER_ID = '50000000-0000-4000-8000-000000000001';
const DATABASE_PASSWORD = 'pooler-password';
const PUBLISHABLE_KEY = 'sb_publishable_example';

function serverEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: `postgresql://elara:${DATABASE_PASSWORD}@db.example.com:5432/elara?sslmode=require`,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    ELARA_ALLOWED_USER_IDS: OWNER_ID,
    ELARA_ALLOWED_ORIGINS: 'https://relay.example.com',
    ELARA_HOST: '127.0.0.1',
    PORT: '0',
    ELARA_SHUTDOWN_TIMEOUT_MS: '2000',
    ELARA_READINESS_TIMEOUT_MS: '500',
    ...overrides,
  };
}

interface FakeHost extends ProductionServerHost {
  readonly lines: readonly string[];
  emitSignal(signal: TerminationSignal): void;
  emitFatal(condition: FatalCondition, error: unknown): void;
}

function fakeHost(env: NodeJS.ProcessEnv): FakeHost {
  const lines: string[] = [];
  const signals = new Map<TerminationSignal, (signal: string) => void>();
  const fatals = new Map<FatalCondition, (error: unknown) => void>();
  // A platform may signal before the runtime registered its handlers, so the
  // fake buffers the event and replays it deterministically on registration.
  const pendingSignals: TerminationSignal[] = [];
  const pendingFatals: Array<[FatalCondition, unknown]> = [];
  const record =
    (level: string) =>
    (message: string): void => {
      lines.push(`${level} ${message}`);
    };
  const log: RuntimeLog = {
    info: record('info'),
    warn: record('warn'),
    fail: record('fail'),
  };

  return {
    env,
    log,
    lines,
    onSignal: (signal, handler) => {
      signals.set(signal, handler);
      for (const pending of [...pendingSignals]) {
        if (pending === signal) handler(signal);
      }
    },
    onFatal: (condition, handler) => {
      fatals.set(condition, handler);
      for (const [pending, error] of [...pendingFatals]) {
        if (pending === condition) handler(error);
      }
    },
    emitSignal: (signal) => {
      const handler = signals.get(signal);
      if (handler === undefined) pendingSignals.push(signal);
      else handler(signal);
    },
    emitFatal: (condition, error) => {
      const handler = fatals.get(condition);
      if (handler === undefined) pendingFatals.push([condition, error]);
      else handler(error);
    },
  };
}

interface FakeResources {
  readonly resources: NodePostgresResources;
  readonly state: { closed: boolean; closeCalls: number; wedgedCalls: number };
  wedge(): void;
}

/** Poll until a condition holds, so lifecycle tests never race a socket. */
async function until(
  predicate: () => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('condition was not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * PostgreSQL stand-in.
 *
 * The production runtime only needs a bounded round trip for readiness and a
 * `close()` for teardown, so lifecycle behavior is provable without a live
 * database. The real database path is certified by the deployment gate and
 * the PostgreSQL integration suite.
 */
function fakeResources(reachable = true): FakeResources {
  const state = { closed: false, closeCalls: 0, wedgedCalls: 0 };
  let wedged = false;
  const resources = {
    sqlPool: {
      connect: () => Promise.reject(new Error('unused by lifecycle tests')),
    },
    rawPool: {
      ending: false,
      ended: false,
      query: () => {
        if (wedged) {
          state.wedgedCalls += 1;
          return new Promise(() => undefined);
        }
        return reachable
          ? Promise.resolve({ rows: [{ ready: 1 }], rowCount: 1 })
          : Promise.reject(
              new Error(`password authentication failed for user elara (${DATABASE_PASSWORD})`),
            );
      },
    },
    close: () => {
      state.closed = true;
      state.closeCalls += 1;
      return Promise.resolve();
    },
  };

  return {
    resources: resources as unknown as NodePostgresResources,
    state,
    wedge: () => {
      wedged = true;
    },
  };
}

async function start(
  env: NodeJS.ProcessEnv,
  fake: FakeResources,
  host: FakeHost = fakeHost(env),
): Promise<{ server: ProductionServer; host: FakeHost }> {
  const server = await startProductionServer(host, {
    createResources: () => fake.resources,
  });
  return { server, host };
}

function baseUrl(server: ProductionServer): string {
  return `http://127.0.0.1:${server.address.port}`;
}

describe('production server startup', () => {
  it('serves the health and readiness boundary behind the configured contract', async () => {
    const fake = fakeResources();
    const { server, host } = await start(serverEnv(), fake);

    try {
      expect(server.address.host).toBe('127.0.0.1');
      expect(server.address.port).toBeGreaterThan(0);
      expect(server.config.profile).toBe('production');

      const health = await fetch(`${baseUrl(server)}/health`);
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toMatchObject({
        service: 'elara-relay',
        status: 'ok',
        schemaVersion: 1,
      });

      const ready = await fetch(`${baseUrl(server)}/health/ready`);
      expect(ready.status).toBe(200);
      await expect(ready.json()).resolves.toMatchObject({
        service: 'elara-relay',
        status: 'ready',
        schemaVersion: 1,
        checks: { database: 'available', authentication: 'valid' },
      });
    } finally {
      await server.shutdown('test-teardown');
    }

    expect(fake.state.closed).toBe(true);
    expect(host.lines.join('\n')).toContain('listening on 127.0.0.1:');
  });

  it('keeps every domain route behind bearer verification', async () => {
    const fake = fakeResources();
    const { server } = await start(serverEnv(), fake);

    try {
      const anonymous = await fetch(
        `${baseUrl(server)}/today?asOf=2026-09-27T09:00:00.000Z`,
      );
      expect(anonymous.status).toBe(401);
      expect(anonymous.headers.get('www-authenticate')).toBe('Bearer');
      await expect(anonymous.json()).resolves.toEqual({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });

      // Authentication runs before the body is read, so an unauthenticated
      // oversized write is refused without buffering it.
      const heavy = await fetch(`${baseUrl(server)}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ padding: 'x'.repeat(200_000) }),
      });
      expect(heavy.status).toBe(401);
    } finally {
      await server.shutdown('test-teardown');
    }
  });

  it('keeps unknown endpoints behind the bearer boundary and honours trusted origins only', async () => {
    const fake = fakeResources();
    const { server } = await start(serverEnv(), fake);

    try {
      // The protected mount matches every path, so an unknown endpoint is
      // indistinguishable from a real one without a valid token: no route
      // inventory is disclosed to an anonymous caller.
      const unknown = await fetch(`${baseUrl(server)}/admin/secrets`);
      expect(unknown.status).toBe(401);
      await expect(unknown.json()).resolves.toEqual({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });

      const allowed = await fetch(`${baseUrl(server)}/work`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://relay.example.com',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization',
        },
      });
      expect(allowed.status).toBe(204);
      expect(allowed.headers.get('access-control-allow-origin')).toBe(
        'https://relay.example.com',
      );

      const denied = await fetch(`${baseUrl(server)}/work`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://attacker.example',
          'access-control-request-method': 'GET',
        },
      });
      expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      await server.shutdown('test-teardown');
    }
  });

  it('refuses to start when the configuration contract is incomplete', async () => {
    const host = fakeHost(
      (() => {
        const env = serverEnv();
        delete env['ELARA_HOST'];
        delete env['PORT'];
        delete env['ELARA_ALLOWED_ORIGINS'];
        return env;
      })(),
    );
    const fake = fakeResources();

    const code = await runProductionServer(host, {
      createResources: () => fake.resources,
    });

    expect(code).toBe(1);
    expect(fake.state.closeCalls).toBe(0);
    const rendered = host.lines.join('\n');
    expect(rendered).toContain('ELARA_HOST');
    expect(rendered).toContain('PORT');
    expect(rendered).toContain('ELARA_ALLOWED_ORIGINS');
    expect(rendered).toContain('startup aborted (configuration)');
    expect(rendered).not.toContain('listening on');
  });

  it('refuses to serve when the database is unreachable at startup', async () => {
    const host = fakeHost(serverEnv());
    const fake = fakeResources(false);

    const attempt = startProductionServer(host, {
      createResources: () => fake.resources,
    });
    await expect(attempt).rejects.toBeInstanceOf(ServerStartupError);
    await expect(attempt).rejects.toMatchObject({ stage: 'database' });

    expect(fake.state.closed).toBe(true);
    const rendered = host.lines.join('\n');
    expect(rendered).toContain('database readiness check failed at startup');
    expect(rendered).not.toContain('listening on');
    // The driver's rejection named the credential; the log must not carry it.
    expect(rendered).not.toContain(DATABASE_PASSWORD);
    expect(rendered).not.toContain(PUBLISHABLE_KEY);
  });

  it('reports a transport bind failure deterministically', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => {
      blocker.listen(0, '127.0.0.1', () => resolve());
    });
    const occupied = blocker.address();
    if (occupied === null || typeof occupied !== 'object') {
      throw new Error('blocker did not bind');
    }

    const host = fakeHost(serverEnv({ PORT: String(occupied.port) }));
    const fake = fakeResources();

    try {
      const attempt = startProductionServer(host, {
        createResources: () => fake.resources,
      });
      await expect(attempt).rejects.toBeInstanceOf(ServerStartupError);
      await expect(attempt).rejects.toMatchObject({ stage: 'transport' });

      const rendered = host.lines.join('\n');
      expect(rendered).toContain('http listen failed');
      expect(rendered).toContain('EADDRINUSE');
      expect(rendered).not.toContain(DATABASE_PASSWORD);
      expect(fake.state.closed).toBe(true);
    } finally {
      await new Promise<void>((resolve) => {
        blocker.close(() => resolve());
      });
    }
  });
});

describe('production server shutdown', () => {
  it('stops reporting readiness immediately and releases every resource', async () => {
    const fake = fakeResources();
    const { server, host } = await start(serverEnv(), fake);
    const url = baseUrl(server);

    expect((await fetch(`${url}/health/ready`)).status).toBe(200);

    server.readiness.drain();
    const draining = await fetch(`${url}/health/ready`);
    expect(draining.status).toBe(503);
    await expect(draining.json()).resolves.toMatchObject({
      service: 'elara-relay',
      status: 'not_ready',
      schemaVersion: 1,
      checks: { database: 'unavailable', authentication: 'valid' },
    });
    // Liveness stays honest while the instance drains.
    expect((await fetch(`${url}/health`)).status).toBe(200);

    await server.shutdown('SIGTERM');
    expect(fake.state.closeCalls).toBe(1);
    expect(host.lines.join('\n')).toContain('shutdown complete');

    await expect(fetch(`${url}/health`)).rejects.toThrow();
  });

  it('is idempotent and escalates when a signal repeats', async () => {
    const fake = fakeResources();
    const { server, host } = await start(serverEnv(), fake);

    const first = server.shutdown('SIGTERM');
    const second = server.shutdown('SIGTERM');
    await Promise.all([first, second]);

    expect(fake.state.closeCalls).toBe(1);
    expect(host.lines.join('\n')).toContain('shutdown already in progress');
  });

  it('forces connections closed when the drain deadline is exceeded', async () => {
    const fake = fakeResources();
    const { server, host } = await start(
      serverEnv({
        ELARA_SHUTDOWN_TIMEOUT_MS: '250',
        ELARA_READINESS_TIMEOUT_MS: '5000',
      }),
      fake,
    );
    const url = baseUrl(server);

    // Wedge the dependency so one request stays in flight past the deadline,
    // and wait until that request has actually reached the probe.
    fake.wedge();
    const inFlight = fetch(`${url}/health/ready`).then(
      (response) => response.status,
      () => 'reset',
    );
    await until(() => fake.state.wedgedCalls > 0);

    await server.shutdown('SIGTERM');
    expect(await inFlight).toBe('reset');
    expect(host.lines.join('\n')).toContain('shutdown deadline exceeded');
    expect(fake.state.closed).toBe(true);
  });

  it('exits zero on a termination signal and one on a fatal condition', async () => {
    const clean = fakeHost(serverEnv());
    const cleanFake = fakeResources();
    const cleanRun = runProductionServer(clean, {
      createResources: () => cleanFake.resources,
    });
    clean.emitSignal('SIGTERM');
    clean.emitSignal('SIGTERM');
    await expect(cleanRun).resolves.toBe(0);
    expect(cleanFake.state.closed).toBe(true);

    const fatal = fakeHost(serverEnv());
    const fatalFake = fakeResources();
    const fatalRun = runProductionServer(fatal, {
      createResources: () => fatalFake.resources,
    });
    fatal.emitFatal('uncaughtException', new Error('kernel panic'));
    await expect(fatalRun).resolves.toBe(1);
    expect(fatal.lines.join('\n')).toContain(
      'uncaught exception: kernel panic',
    );
    expect(fatalFake.state.closed).toBe(true);
  });

  it('never writes a credential value into the lifecycle log', async () => {
    const host = fakeHost(serverEnv());
    const fake = fakeResources();
    const run = runProductionServer(host, {
      createResources: () => fake.resources,
    });
    host.emitSignal('SIGTERM');
    await expect(run).resolves.toBe(0);

    const rendered = host.lines.join('\n');
    expect(rendered).not.toContain(DATABASE_PASSWORD);
    expect(rendered).not.toContain(PUBLISHABLE_KEY);
    expect(rendered).not.toContain('db.example.com');
    expect(rendered).toContain('configuration accepted (profile production');
    expect(rendered).toContain('trusted browser origins: https://relay.example.com');
  });
});

describe('process host wiring', () => {
  it('binds the runtime to the real process environment and log sinks', () => {
    const host = createProcessHost();
    expect(host.env).toBe(process.env);
    expect(typeof host.log.info).toBe('function');
    expect(typeof host.log.warn).toBe('function');
    expect(typeof host.log.fail).toBe('function');
    expect(typeof host.onSignal).toBe('function');
    expect(typeof host.onFatal).toBe('function');
  });
});
