import { describe, expect, it } from 'vitest';
import { readBrowserRuntimeConfig } from './runtime-config';

describe('browser runtime config', () => {
  it('normalizes reviewed browser endpoints', () => {
    expect(
      readBrowserRuntimeConfig({
        VITE_SUPABASE_URL: 'https://example.supabase.co/path?ignored=1',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        VITE_ELARA_API_URL: 'https://api.example.com/operations/',
      }),
    ).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
      apiBaseUrl: 'https://api.example.com/operations',
    });
  });

  it('allows HTTP only for local development endpoints', () => {
    expect(
      readBrowserRuntimeConfig({
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local',
        VITE_ELARA_API_URL: 'http://localhost:8787',
      }),
    ).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      publishableKey: 'sb_publishable_local',
      apiBaseUrl: 'http://localhost:8787',
    });

    expect(() =>
      readBrowserRuntimeConfig({
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        VITE_ELARA_API_URL: 'http://api.example.com',
      }),
    ).toThrow('VITE_ELARA_API_URL must use HTTPS outside local development');
  });

  it('rejects legacy or malformed public configuration', () => {
    expect(() =>
      readBrowserRuntimeConfig({
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'legacy-key',
        VITE_ELARA_API_URL: 'https://api.example.com',
      }),
    ).toThrow('VITE_SUPABASE_PUBLISHABLE_KEY must use a modern sb_publishable_ key');

    expect(() =>
      readBrowserRuntimeConfig({
        VITE_SUPABASE_URL: 'not-a-url',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        VITE_ELARA_API_URL: 'https://api.example.com',
      }),
    ).toThrow('VITE_SUPABASE_URL must be a valid URL');
  });
});
