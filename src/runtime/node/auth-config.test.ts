import { describe, expect, it } from 'vitest';
import { readAuthRuntimeConfig } from './auth-config';

const USER_A = '50000000-0000-4000-8000-000000000001';
const USER_B = '50000000-0000-4000-8000-000000000002';

describe('auth runtime config', () => {
  it('normalizes the Supabase origin and requires an explicit user allowlist', () => {
    const config = readAuthRuntimeConfig({
      SUPABASE_URL: 'https://example.supabase.co/some/path?ignored=yes',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      ELARA_ALLOWED_USER_IDS: `${USER_A}, ${USER_B}`,
    });

    expect(config.supabaseUrl).toBe('https://example.supabase.co');
    expect([...config.allowedUserIds]).toEqual([USER_A, USER_B]);
  });

  it('rejects insecure URLs, legacy keys, missing users, and duplicate users', () => {
    expect(() =>
      readAuthRuntimeConfig({
        SUPABASE_URL: 'http://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        ELARA_ALLOWED_USER_IDS: USER_A,
      }),
    ).toThrow('SUPABASE_URL must be a valid HTTPS URL');

    expect(() =>
      readAuthRuntimeConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'legacy-anon-key',
        ELARA_ALLOWED_USER_IDS: USER_A,
      }),
    ).toThrow('must use a modern sb_publishable_ key');

    expect(() =>
      readAuthRuntimeConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        ELARA_ALLOWED_USER_IDS: '',
      }),
    ).toThrow('ELARA_ALLOWED_USER_IDS is required');

    expect(() =>
      readAuthRuntimeConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        ELARA_ALLOWED_USER_IDS: `${USER_A},${USER_A}`,
      }),
    ).toThrow('must not contain duplicates');
  });
});
