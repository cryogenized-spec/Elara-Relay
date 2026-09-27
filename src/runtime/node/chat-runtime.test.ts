import { describe, expect, it } from 'vitest';
import { readBrowserRuntimeConfig } from '../../app/runtime-config';
import {
  ChatModelUnavailableError,
  resolveChatProvider,
} from '../../ai/chat-provider';
import { MuseChatProvider } from '../../ai/muse-chat-adapter';
import { OpenAiChatProvider } from '../../ai/openai-chat-adapter';
import { readChatRuntimeConfig } from './chat-config';
import {
  createPersistentApiFromResources,
  resolveChatProviders,
} from './persistent-api';
import type { NodePostgresResources } from './postgres-pool';
import type { AuthVerifier } from '../../auth/auth-verifier';

const identity = {
  userId: '550e8400-e29b-41d4-a716-446655440000',
  sessionId: '550e8400-e29b-41d4-a716-446655440001',
  email: null,
  aal: 'aal1' as const,
};
const verifier: AuthVerifier = { verify: () => Promise.resolve(identity) };

describe('chat provider runtime assembly', () => {
  it('builds a concrete adapter per configured provider', () => {
    const providers = resolveChatProviders(
      readChatRuntimeConfig({
        ELARA_OPENAI_API_KEY: 'test-openai-key',
        ELARA_MUSE_API_KEY: 'test-muse-key',
      }),
    );

    expect(providers).toHaveLength(2);
    expect(providers[0]).toBeInstanceOf(OpenAiChatProvider);
    expect(providers[1]).toBeInstanceOf(MuseChatProvider);
  });

  it('disables only the unconfigured provider and fails closed for its models', () => {
    const providers = resolveChatProviders(
      readChatRuntimeConfig({ ELARA_MUSE_API_KEY: 'test-muse-key' }),
    );

    expect(
      resolveChatProvider('muse-spark-1.3-contributor', providers),
    ).toBeInstanceOf(MuseChatProvider);
    expect(() => resolveChatProvider('gpt-6-luna', providers)).toThrow(
      ChatModelUnavailableError,
    );
    expect(() => resolveChatProvider('unknown-model', providers)).toThrow(
      ChatModelUnavailableError,
    );
  });

  it('keeps the application runtime operational without any chat provider', async () => {
    let closed = false;
    const resources = {
      sqlPool: { connect: () => Promise.reject(new Error('unused')) },
      rawPool: {} as NodePostgresResources['rawPool'],
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    };

    const runtime = createPersistentApiFromResources(resources, verifier);

    expect(runtime.chatProviders).toEqual([]);
    const response = await runtime.app.request('/health');
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(JSON.stringify(body)).not.toContain('openai');
    expect(JSON.stringify(body)).not.toContain('muse');
    await runtime.close();
    expect(closed).toBe(true);
  });

  it('exposes configured adapters without leaking them to browser configuration', () => {
    const providers = resolveChatProviders(
      readChatRuntimeConfig({
        ELARA_OPENAI_API_KEY: 'server-only-openai-key',
        ELARA_MUSE_API_KEY: 'server-only-muse-key',
      }),
    );
    const resources = {
      sqlPool: { connect: () => Promise.reject(new Error('unused')) },
      rawPool: {} as NodePostgresResources['rawPool'],
      close: () => Promise.resolve(),
    };

    const runtime = createPersistentApiFromResources(
      resources,
      verifier,
      [],
      undefined,
      providers,
    );
    expect(runtime.chatProviders).toHaveLength(2);

    const browser = readBrowserRuntimeConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      VITE_ELARA_API_URL: 'https://api.example.com',
      ELARA_OPENAI_API_KEY: 'server-only-openai-key',
      ELARA_MUSE_API_KEY: 'server-only-muse-key',
      ELARA_OPENAI_BASE_URL: 'https://api.openai.com/v1',
    });
    expect(JSON.stringify(browser)).not.toContain('server-only-openai-key');
    expect(JSON.stringify(browser)).not.toContain('server-only-muse-key');
    expect(JSON.stringify(browser)).not.toContain('openai');
  });
});
