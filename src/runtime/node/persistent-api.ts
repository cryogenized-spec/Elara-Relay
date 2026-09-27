import type { AuthVerifier } from '../../auth/auth-verifier';
import { SupabaseAuthVerifier } from '../../auth/supabase-auth-verifier';
import type { ChatProvider } from '../../ai/chat-provider';
import type { MemoryProvider } from '../../ai/memory-provider';
import { NullMemoryProvider } from '../../ai/memory-provider';
import { HindsightMemoryProvider } from '../../ai/hindsight-adapter';
import { OptionalMemoryProvider } from '../../ai/optional-memory';
import { ChatTurnOrchestrator } from '../../ai/chat-turn';
import { createChatApi } from '../../api/chat-api';
import { createApi } from '../../api/app';
import { ChatKernel } from '../../domain/chat-kernel';
import { PostgresChatStore } from '../../db/postgres/chat-store';
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

async function checkPostgres(
  sqlPool: NodePostgresResources['sqlPool'],
): Promise<void> {
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
  chatProvidersOrOptions:
    | readonly ChatProvider[]
    | PersistentApiRuntimeOptions = [],
  options: PersistentApiRuntimeOptions = {},
): PersistentApiRuntime {
  const hasChatProviders = Array.isArray(chatProvidersOrOptions);
  const chatProviders: readonly ChatProvider[] = hasChatProviders
    ? (chatProvidersOrOptions as readonly ChatProvider[])
    : [];
  const runtimeOptions: PersistentApiRuntimeOptions = hasChatProviders
    ? options
    : (chatProvidersOrOptions as PersistentApiRuntimeOptions);

  const logger = runtimeOptions.logger ?? stderrStructuredLogger;
  const buildInfo =
    runtimeOptions.buildInfo ?? readRuntimeBuildInfo(process.env);
  const store = new PostgresDomainStore(resources.sqlPool);
  const kernel = new DomainKernel(store);
  const chatStore = new PostgresChatStore(resources.sqlPool);
  const chatKernel = new ChatKernel(chatStore);
  const chatOrchestrator = new ChatTurnOrchestrator(chatKernel, {
    providers: chatProviders,
    memoryProvider,
  });
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

  const runtime: PersistentApiRuntime = {
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

  // Chat is mounted on the same server instance and behind the same verified
  // identity middleware as the operational API. There is one authenticated
  // surface, not a second one. The shared structured logger preserves the
  // request-correlated observability boundary for streaming failures.
  runtime.app.route(
    '/',
    createChatApi(chatKernel, chatOrchestrator, authVerifier, logger),
  );

  return runtime;
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

  // No provider adapter is configured until the concrete adapter slice lands.
  // With an empty list every catalog model reports unavailable, Chat turns fail
  // closed, and every manual Elara workflow continues to work.
  return createPersistentApiFromResources(
    resources,
    authVerifier,
    origins,
    memoryProvider,
    [],
    {
      ...runtimeOptions,
      logger,
      buildInfo: runtimeOptions.buildInfo ?? readRuntimeBuildInfo(env),
    },
  );
}
