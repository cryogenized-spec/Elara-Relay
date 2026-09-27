import type { AuthVerifier } from '../../auth/auth-verifier';
import { SupabaseAuthVerifier } from '../../auth/supabase-auth-verifier';
import type { MemoryProvider } from '../../ai/memory-provider';
import { NullMemoryProvider } from '../../ai/memory-provider';
import { HindsightMemoryProvider } from '../../ai/hindsight-adapter';
import { OptionalMemoryProvider } from '../../ai/optional-memory';
import type { ChatProvider } from '../../ai/chat-provider';
import { OpenAiChatProvider } from '../../ai/openai-chat-adapter';
import { MuseChatProvider } from '../../ai/muse-chat-adapter';
import { createApi } from '../../api/app';
import { PostgresDomainStore } from '../../db/postgres/postgres-store';
import { DomainKernel } from '../../domain/kernel';
import {
  readAllowedOrigins,
  readAuthRuntimeConfig,
} from './auth-config';
import {
  readChatRuntimeConfig,
  type ChatRuntimeConfig,
} from './chat-config';
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
  /** Only configured chat providers are present; missing configuration disables one provider. */
  chatProviders: readonly ChatProvider[];
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

/**
 * Resolve the configured concrete chat provider adapters.
 *
 * Adapters are constructed only for providers with complete server-side
 * configuration. A model whose provider is absent remains unavailable and
 * fails closed at the `ChatProvider` resolution boundary.
 */
export function resolveChatProviders(
  config: ChatRuntimeConfig,
): readonly ChatProvider[] {
  return config.providers.map((provider) =>
    provider.provider === 'openai'
      ? new OpenAiChatProvider({
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
          requestTimeoutMs: provider.requestTimeoutMs,
        })
      : new MuseChatProvider({
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
          requestTimeoutMs: provider.requestTimeoutMs,
        }),
  );
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

  return {
    app: createApi(kernel, authVerifier, { allowedOrigins }),
    memoryProvider,
    chatProviders,
    close: async () => {
      await resources.close();
    },
  };
}

export function createPersistentApiFromEnv(
  env: NodeJS.ProcessEnv,
): PersistentApiRuntime {
  const memoryConfig = readMemoryRuntimeConfig(env);
  const chatConfig = readChatRuntimeConfig(env);
  const authConfig = readAuthRuntimeConfig(env);
  const origins = readAllowedOrigins(env);
  const memoryProvider = resolveMemoryProvider(memoryConfig);
  const chatProviders = resolveChatProviders(chatConfig);
  const authVerifier = new SupabaseAuthVerifier(authConfig);
  const resources = createNodePostgresResourcesFromEnv(env);

  return createPersistentApiFromResources(
    resources,
    authVerifier,
    origins,
    memoryProvider,
    chatProviders,
  );
}
