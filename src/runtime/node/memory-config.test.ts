import { describe, expect, it } from 'vitest';
import { readMemoryRuntimeConfig } from './memory-config';

describe('memory runtime config', () => {
  it('returns "none" when ELARA_MEMORY_PROVIDER is absent or empty', () => {
    expect(readMemoryRuntimeConfig({})).toEqual({ provider: 'none' });
    expect(readMemoryRuntimeConfig({ ELARA_MEMORY_PROVIDER: '' })).toEqual({
      provider: 'none',
    });
    expect(readMemoryRuntimeConfig({ ELARA_MEMORY_PROVIDER: '  ' })).toEqual({
      provider: 'none',
    });
  });

  it('returns "none" when ELARA_MEMORY_PROVIDER is explicitly "none"', () => {
    expect(
      readMemoryRuntimeConfig({ ELARA_MEMORY_PROVIDER: 'none' }),
    ).toEqual({ provider: 'none' });
  });

  it('rejects unknown provider names', () => {
    expect(() =>
      readMemoryRuntimeConfig({ ELARA_MEMORY_PROVIDER: 'pinecone' }),
    ).toThrow('must be "none" or "hindsight"');
  });

  it('is case-insensitive for provider name', () => {
    const config = readMemoryRuntimeConfig({
      ELARA_MEMORY_PROVIDER: 'Hindsight',
      ELARA_HINDSIGHT_URL: 'http://localhost:8888',
      ELARA_HINDSIGHT_API_KEY: 'hsk_test_key_123',
    });
    expect(config.provider).toBe('hindsight');
  });

  describe('hindsight provider', () => {
    const baseEnv = {
      ELARA_MEMORY_PROVIDER: 'hindsight',
      ELARA_HINDSIGHT_URL: 'http://localhost:8888',
      ELARA_HINDSIGHT_API_KEY: 'hsk_test_key_123',
    } as const;

    it('allows an unauthenticated loopback Hindsight instance', () => {
      expect(
        readMemoryRuntimeConfig({
          ELARA_MEMORY_PROVIDER: 'hindsight',
          ELARA_HINDSIGHT_URL: 'http://localhost:8888',
        }),
      ).toMatchObject({
        provider: 'hindsight',
        url: 'http://localhost:8888',
        apiKey: '',
      });
    });

    it('requires an API key for non-loopback Hindsight', () => {
      expect(() =>
        readMemoryRuntimeConfig({
          ELARA_MEMORY_PROVIDER: 'hindsight',
          ELARA_HINDSIGHT_URL: 'https://api.hindsight.vectorize.io',
        }),
      ).toThrow(
        'ELARA_HINDSIGHT_API_KEY is required for non-loopback Hindsight',
      );
    });

    it('rejects API keys containing newlines', () => {
      expect(() =>
        readMemoryRuntimeConfig({
          ELARA_MEMORY_PROVIDER: 'hindsight',
          ELARA_HINDSIGHT_URL: 'http://localhost:8888',
          ELARA_HINDSIGHT_API_KEY: 'first\nsecond',
        }),
      ).toThrow('ELARA_HINDSIGHT_API_KEY must not contain newlines');
    });

    it('requires ELARA_HINDSIGHT_URL when provider is hindsight', () => {
      expect(() =>
        readMemoryRuntimeConfig({
          ELARA_MEMORY_PROVIDER: 'hindsight',
          ELARA_HINDSIGHT_API_KEY: 'hsk_test_key_123',
        }),
      ).toThrow('ELARA_HINDSIGHT_URL is required');
    });

    it('rejects non-HTTP(S) URL protocols', () => {
      expect(() =>
        readMemoryRuntimeConfig({
          ...baseEnv,
          ELARA_HINDSIGHT_URL: 'ftp://localhost:8888',
        }),
      ).toThrow('must be an HTTPS origin');
    });

    it('rejects malformed URLs', () => {
      expect(() =>
        readMemoryRuntimeConfig({
          ...baseEnv,
          ELARA_HINDSIGHT_URL: 'not-a-url',
        }),
      ).toThrow('must be a valid URL');
    });

    it('rejects remote plaintext, embedded credentials and non-origin URLs without printing values', () => {
      for (const url of ['http://api.example.com', 'https://user:password@api.example.com',
        'https://api.example.com/admin', 'https://api.example.com/?key=secret',
        'https://api.example.com/#fragment']) {
        expect(() => readMemoryRuntimeConfig({ ...baseEnv, ELARA_HINDSIGHT_URL: url }))
          .toThrow('must be an HTTPS origin');
      }
    });

    it('strips trailing slashes from URL', () => {
      const config = readMemoryRuntimeConfig({
        ...baseEnv,
        ELARA_HINDSIGHT_URL: 'http://localhost:8888/',
      });
      expect(config).toMatchObject({
        provider: 'hindsight',
        url: 'http://localhost:8888',
      });
    });

    it('accepts HTTPS URLs', () => {
      const config = readMemoryRuntimeConfig({
        ...baseEnv,
        ELARA_HINDSIGHT_URL: 'https://api.hindsight.vectorize.io',
      });
      expect(config).toMatchObject({
        provider: 'hindsight',
        url: 'https://api.hindsight.vectorize.io',
      });
    });

    it('defaults request timeout to 5000ms', () => {
      const config = readMemoryRuntimeConfig(baseEnv);
      expect(config).toMatchObject({
        provider: 'hindsight',
        requestTimeoutMs: 5_000,
      });
    });

    it('accepts custom request timeout', () => {
      const config = readMemoryRuntimeConfig({
        ...baseEnv,
        ELARA_MEMORY_REQUEST_TIMEOUT_MS: '10000',
      });
      expect(config).toMatchObject({
        provider: 'hindsight',
        requestTimeoutMs: 10_000,
      });
    });

    it('bounds request timeout to 30000ms', () => {
      expect(() =>
        readMemoryRuntimeConfig({
          ...baseEnv,
          ELARA_MEMORY_REQUEST_TIMEOUT_MS: '30001',
        }),
      ).toThrow('may not exceed 30000');
    });

    it('rejects non-positive timeout values', () => {
      for (const raw of ['0', '-5', '1.5', 'never']) {
        expect(() =>
          readMemoryRuntimeConfig({
            ...baseEnv,
            ELARA_MEMORY_REQUEST_TIMEOUT_MS: raw,
          }),
        ).toThrow('must be a positive integer');
      }
    });
  });

  it('does not expose API key in error messages', () => {
    try {
      readMemoryRuntimeConfig({
        ELARA_MEMORY_PROVIDER: 'hindsight',
        ELARA_HINDSIGHT_URL: 'not-a-url',
        ELARA_HINDSIGHT_API_KEY: 'sk-' + 'secret-key-value-12345678',
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('sk-' + 'secret-key-value-12345678');
    }
  });
});