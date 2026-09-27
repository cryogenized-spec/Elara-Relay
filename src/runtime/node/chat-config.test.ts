import { describe, expect, it } from 'vitest';
import { readChatRuntimeConfig } from './chat-config';

describe('chat provider runtime config', () => {
  it('configures no provider when no key is present', () => {
    expect(readChatRuntimeConfig({})).toEqual({ providers: [] });
    expect(
      readChatRuntimeConfig({ ELARA_CHAT_REQUEST_TIMEOUT_MS: '30000' }),
    ).toEqual({ providers: [] });
  });

  it('treats blank keys as an absent provider', () => {
    expect(
      readChatRuntimeConfig({
        ELARA_OPENAI_API_KEY: '',
        ELARA_MUSE_API_KEY: '   ',
      }),
    ).toEqual({ providers: [] });
  });

  it('enables only the provider whose key is present', () => {
    expect(
      readChatRuntimeConfig({ ELARA_OPENAI_API_KEY: 'test-openai-key' }),
    ).toEqual({
      providers: [
        {
          provider: 'openai',
          apiKey: 'test-openai-key',
          baseUrl: 'https://api.openai.com/v1',
          requestTimeoutMs: 120_000,
        },
      ],
    });

    expect(
      readChatRuntimeConfig({ ELARA_MUSE_API_KEY: 'test-muse-key' }),
    ).toEqual({
      providers: [
        {
          provider: 'muse',
          apiKey: 'test-muse-key',
          baseUrl: 'https://api.meta.ai/v1',
          requestTimeoutMs: 120_000,
        },
      ],
    });
  });

  it('enables both providers in a deterministic order', () => {
    const config = readChatRuntimeConfig({
      ELARA_MUSE_API_KEY: 'test-muse-key',
      ELARA_OPENAI_API_KEY: 'test-openai-key',
    });

    expect(config.providers.map((provider) => provider.provider)).toEqual([
      'openai',
      'muse',
    ]);
  });

  it('accepts a reviewed endpoint override and normalizes it', () => {
    const config = readChatRuntimeConfig({
      ELARA_OPENAI_API_KEY: 'test-openai-key',
      ELARA_OPENAI_BASE_URL: 'https://gateway.example.com/openai/v1/',
      ELARA_CHAT_REQUEST_TIMEOUT_MS: '45000',
    });

    expect(config.providers[0]).toMatchObject({
      baseUrl: 'https://gateway.example.com/openai/v1',
      requestTimeoutMs: 45_000,
    });
  });

  it('rejects keys containing newlines', () => {
    expect(() =>
      readChatRuntimeConfig({ ELARA_OPENAI_API_KEY: 'first\nsecond' }),
    ).toThrow('ELARA_OPENAI_API_KEY must not contain newlines');
  });

  it('requires HTTPS endpoints outside loopback', () => {
    expect(() =>
      readChatRuntimeConfig({
        ELARA_MUSE_API_KEY: 'test-muse-key',
        ELARA_MUSE_BASE_URL: 'http://api.meta.ai/v1',
      }),
    ).toThrow('ELARA_MUSE_BASE_URL must be an HTTPS origin');

    expect(
      readChatRuntimeConfig({
        ELARA_MUSE_API_KEY: 'test-muse-key',
        ELARA_MUSE_BASE_URL: 'http://localhost:8890/v1',
      }).providers[0]?.baseUrl,
    ).toBe('http://localhost:8890/v1');
  });

  it('rejects endpoint credentials, queries and fragments', () => {
    expect(() =>
      readChatRuntimeConfig({
        ELARA_OPENAI_API_KEY: 'test-openai-key',
        ELARA_OPENAI_BASE_URL: 'https://user:pass@api.openai.com/v1',
      }),
    ).toThrow('ELARA_OPENAI_BASE_URL must not contain credentials');

    expect(() =>
      readChatRuntimeConfig({
        ELARA_OPENAI_API_KEY: 'test-openai-key',
        ELARA_OPENAI_BASE_URL: 'https://api.openai.com/v1?x=1',
      }),
    ).toThrow('ELARA_OPENAI_BASE_URL must not contain a query or fragment');

    expect(() =>
      readChatRuntimeConfig({
        ELARA_OPENAI_API_KEY: 'test-openai-key',
        ELARA_OPENAI_BASE_URL: 'not-a-url',
      }),
    ).toThrow('ELARA_OPENAI_BASE_URL must be a valid URL');
  });

  it('fails closed on a malformed or unbounded request timeout', () => {
    expect(() =>
      readChatRuntimeConfig({
        ELARA_OPENAI_API_KEY: 'test-openai-key',
        ELARA_CHAT_REQUEST_TIMEOUT_MS: 'soon',
      }),
    ).toThrow('ELARA_CHAT_REQUEST_TIMEOUT_MS must be a positive integer');

    expect(() =>
      readChatRuntimeConfig({
        ELARA_OPENAI_API_KEY: 'test-openai-key',
        ELARA_CHAT_REQUEST_TIMEOUT_MS: '0',
      }),
    ).toThrow('ELARA_CHAT_REQUEST_TIMEOUT_MS must be a positive integer');

    expect(() =>
      readChatRuntimeConfig({
        ELARA_OPENAI_API_KEY: 'test-openai-key',
        ELARA_CHAT_REQUEST_TIMEOUT_MS: '600001',
      }),
    ).toThrow('ELARA_CHAT_REQUEST_TIMEOUT_MS may not exceed 600000');
  });
});
