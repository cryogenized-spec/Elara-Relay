import type { AuthVerifier } from '../../auth/auth-verifier';
import { SupabaseAuthVerifier } from '../../auth/supabase-auth-verifier';
import type { MemoryProvider } from '../../ai/memory-provider';
import { NullMemoryProvider } from '../../ai/memory-provider';
import { HindsightMemoryProvider } from '../../ai/hindsight-adapter';
import { OptionalMemoryProvider } from '../../ai/optional-memory';
import { createApi } from '../../api/app';
import { PostgresDomainStore } from '../../db/postgres/postgres-store';
import { DomainKernel } from '../../domain/kernel';
import {
  logSafely,
  type StructuredLogger,
} from '../../observability/logger';
import type {
  ApiHealthOptions,
  OptionalProviderHealthStatus,
  SchedulerHealthProbe,
} from '../../observability/health';
import {
  readAllowedOrigins,
  readAuthRuntimeConfig,
} from './auth-config';
import {
  readMemoryRuntimeConfig,
  type MemoryRuntimeConfig,
} from './memory-config';
import {
  createNodePostgresResourcesFromEnv,
  type NodePostgresResources,
} from './postgres-pool';
import {
  readRuntimeBuildInfo,
  type RuntimeBuildInfo,
} from './build-info';
import { stderrStructuredLogger } from './structured-logger';

export interface PersistentApiRuntime {
  app: ReturnType<typeof createApi>;
  memoryProvider: MemoryProvider;
  close(): Promise<void>;
}

export interface PersistentApiRuntimeOptions {
  readonly logger?: StructuredLogger;
  readonly buildInfo?: RuntimeBuildInfo;
  readonly schedulerProbe?: SchedulerHealthProbe;
}

/**
 * Resolve a MemoryProvider from a parsed memory config.
 *
 * Extracted so both env-based and resource-based assembly paths can
 * share the same provider resolution logic.
 */
export function resolveMemoryProvider(
  config: MemoryRuntimeConfig,
  logger: StructuredLogger = stderrStructuredLogger,
): MemoryProvider {
  if (config.provider === 'none') {
    return new NullMemoryProvider();
  }

  return new OptionalMemoryProvider(
    new HindsightMemoryProvider({
      url: config.url,
      apiKey: config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs,
    }),
    (operation, code) => {
      logSafely(logger, {
        event: 'optional_provider.failure',
        provider: 'memory',
        operation,
        code,
      });
    },
  );
}

async function checkPostgres(sqlPool: NodePostgresResources['sqlPool']): Promise<void> {
  const client = await sqlPool.connect();
  try {
    // A constant-only query proves connectivity without reading application data.
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

function memoryProviderStatus(
  provider: MemoryProvider,
): OptionalProviderHealthStatus {
  if (provider instanceof NullMemoryProvider) return 'disabled';
  if (provider instanceof OptionalMemoryProvider) return provider.healthStatus;
  return 'configured';
}

export function createPersistentApiFromResources(
  resources: NodePostgresResources,
  authVerifier: AuthVerifier,
  allowedOrigins: readonly string[] = [],
  memoryProvider: MemoryProvider = new NullMemoryProvider(),
  runtimeOptions: PersistentApiRuntimeOptions = {},
): PersistentApiRuntime {
  const logger = runtimeOptions.logger ?? stderrStructuredLogger;
  const buildInfo =
    runtimeOptions.buildInfo ?? readRuntimeBuildInfo(process.env);
  const store = new PostgresDomainStore(resources.sqlPool);
  const kernel = new DomainKernel(store);
  const health: ApiHealthOptions = {
    version: buildInfo.version,
    buildSha: buildInfo.buildSha,
    databaseProbe: () => checkPostgres(resources.sqlPool),
    authenticationConfiguration: 'valid',
    optionalProviders: () => ({
      memory: memoryProviderStatus(memoryProvider),
    }),
    ...(runtimeOptions.schedulerProbe === undefined
      ? {}
      : { schedulerProbe: runtimeOptions.schedulerProbe }),
  };

  return {
    app: createApi(kernel, authVerifier, {
      allowedOrigins,
      health,
      logger,
    }),
    memoryProvider,
    close: async () => {
      await resources.close();
    },
  };
}

export function createPersistentApiFromEnv(
  env: NodeJS.ProcessEnv,
  runtimeOptions: PersistentApiRuntimeOptions = {},
): PersistentApiRuntime {
  const logger = runtimeOptions.logger ?? stderrStructuredLogger;
  const memoryConfig = readMemoryRuntimeConfig(env);
  const authConfig = readAuthRuntimeConfig(env);
  const origins = readAllowedOrigins(env);
  const memoryProvider = resolveMemoryProvider(memoryConfig, logger);
  const authVerifier = new SupabaseAuthVerifier(authConfig);
  const resources = createNodePostgresResourcesFromEnv(env, logger);

  return createPersistentApiFromResources(
    resources,
    authVerifier,
    origins,
    memoryProvider,
    {
      ...runtimeOptions,
      logger,
      buildInfo: runtimeOptions.buildInfo ?? readRuntimeBuildInfo(env),
    },
  );
}
