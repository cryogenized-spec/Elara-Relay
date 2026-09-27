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

export interface PersistentApiRuntime {
  app: ReturnType<typeof createApi>;
  memoryProvider: MemoryProvider;
  close(): Promise<void>;
}

/**
 * Resolve a MemoryProvider from a parsed memory config.
 *
 * Extracted so both env-based and resource-based assembly paths can
 * share the same provider resolution logic.
 */
export function resolveMemoryProvider(
  config: MemoryRuntimeConfig,
): MemoryProvider {
  if (config.provider === 'none') {
    return new NullMemoryProvider();
  }

  return new OptionalMemoryProvider(new HindsightMemoryProvider({
    url: config.url,
    apiKey: config.apiKey,
    requestTimeoutMs: config.requestTimeoutMs,
  }));
}

export function createPersistentApiFromResources(
  resources: NodePostgresResources,
  authVerifier: AuthVerifier,
  allowedOrigins: readonly string[] = [],
  memoryProvider: MemoryProvider = new NullMemoryProvider(),
  chatProviders: readonly ChatProvider[] = [],
): PersistentApiRuntime {
  const store = new PostgresDomainStore(resources.sqlPool);
  const kernel = new DomainKernel(store);
  const chatStore = new PostgresChatStore(resources.sqlPool);
  const chatKernel = new ChatKernel(chatStore);
  const chatOrchestrator = new ChatTurnOrchestrator(chatKernel, {
    providers: chatProviders,
    memoryProvider,
  });

  const runtime: PersistentApiRuntime = {
    app: createApi(kernel, authVerifier, { allowedOrigins }),
    memoryProvider,
    close: async () => {
      await resources.close();
    },
  };

  // Chat is mounted on the same server instance and behind the same verified
  // identity middleware as the operational API. There is one authenticated
  // surface, not a second one.
  runtime.app.route(
    '/',
    createChatApi(chatKernel, chatOrchestrator, authVerifier),
  );

  return runtime;
}

export function createPersistentApiFromEnv(
  env: NodeJS.ProcessEnv,
): PersistentApiRuntime {
  const memoryConfig = readMemoryRuntimeConfig(env);
  const authConfig = readAuthRuntimeConfig(env);
  const origins = readAllowedOrigins(env);
  const memoryProvider = resolveMemoryProvider(memoryConfig);
  const authVerifier = new SupabaseAuthVerifier(authConfig);
  const resources = createNodePostgresResourcesFromEnv(env);

  // No provider adapter is configured until the concrete adapter slice lands.
  // With an empty list every catalog model reports unavailable, Chat turns fail
  // closed, and every manual Elara workflow continues to work.
  return createPersistentApiFromResources(
    resources,
    authVerifier,
    origins,
    memoryProvider,
    [],
  );
}
