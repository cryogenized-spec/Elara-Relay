import { describe, expect, it } from 'vitest';
import { readEdgeRuntimeConfig } from './config';

const USER_A = '50000000-0000-4000-8000-000000000001';
const USER_B = '50000000-0000-4000-8000-000000000002';
const DB_URL = 'postgresql://postgres:secret@db.internal:5432/postgres';
const SUPABASE_URL = 'https://example.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_example';

describe('readEdgeRuntimeConfig', () => {
  it('reads Supabase hosted defaults and fails protected routes closed until an owner is configured', () => {
    const config = readEdgeRuntimeConfig({
      SUPABASE_DB_URL: DB_URL,
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
        default: PUBLISHABLE_KEY,
      }),
    });

    expect(config.databaseUrl).toBe(DB_URL);
    expect(config.authVerifierConfig.supabaseUrl).toBe(SUPABASE_URL);
    expect(config.authVerifierConfig.publishableKey).toBe(PUBLISHABLE_KEY);
    expect(config.authVerifierConfig.allowedUserIds).toEqual(
      new Set(['00000000-0000-4000-8000-000000000000']),
    );
    expect(config.allowedOrigins).toEqual([
      'https://cryogenized-spec.github.io',
    ]);
    expect(config.ownerAllowlistConfigured).toBe(false);
  });

  it('prefers an explicit publishable key and parses the owner allowlist', () => {
    const config = readEdgeRuntimeConfig({
      SUPABASE_DB_URL: DB_URL,
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_ignored"}',
      ELARA_ALLOWED_USER_IDS: `${USER_A}, ${USER_B}`,
      ELARA_ALLOWED_ORIGINS:
        'https://example.com, http://127.0.0.1:4173',
    });

    expect(config.authVerifierConfig.publishableKey).toBe(PUBLISHABLE_KEY);
    expect(config.authVerifierConfig.allowedUserIds).toEqual(
      new Set([USER_A, USER_B]),
    );
    expect(config.allowedOrigins).toEqual([
      'https://example.com',
      'http://127.0.0.1:4173',
    ]);
    expect(config.ownerAllowlistConfigured).toBe(true);
  });

  it('rejects malformed hosted publishable-key dictionaries', () => {
    expect(() =>
      readEdgeRuntimeConfig({
        SUPABASE_DB_URL: DB_URL,
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEYS: 'not-json',
      }),
    ).toThrow('SUPABASE_PUBLISHABLE_KEYS must be valid JSON');

    expect(() =>
      readEdgeRuntimeConfig({
        SUPABASE_DB_URL: DB_URL,
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEYS: '{}',
      }),
    ).toThrow('SUPABASE_PUBLISHABLE_KEYS.default is required');
  });

  it('rejects duplicate owner IDs and unsafe browser origins', () => {
    expect(() =>
      readEdgeRuntimeConfig({
        SUPABASE_DB_URL: DB_URL,
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
        ELARA_ALLOWED_USER_IDS: `${USER_A},${USER_A}`,
      }),
    ).toThrow('ELARA_ALLOWED_USER_IDS must not contain duplicates');

    expect(() =>
      readEdgeRuntimeConfig({
        SUPABASE_DB_URL: DB_URL,
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
        ELARA_ALLOWED_USER_IDS: USER_A,
        ELARA_ALLOWED_ORIGINS: 'http://example.com',
      }),
    ).toThrow('ELARA_ALLOWED_ORIGINS must contain exact HTTPS origins');
  });
});
