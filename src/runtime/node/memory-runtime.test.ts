import { describe, expect, it } from 'vitest';
import { readBrowserRuntimeConfig } from '../../app/runtime-config';
import { NullMemoryProvider } from '../../ai/memory-provider';
import { createPersistentApiFromResources, resolveMemoryProvider } from './persistent-api';
import type { NodePostgresResources } from './postgres-pool';
import type { AuthVerifier } from '../../auth/auth-verifier';

const identity = { userId: '550e8400-e29b-41d4-a716-446655440000',
  sessionId: '550e8400-e29b-41d4-a716-446655440001', email: null, aal: 'aal1' as const };
const verifier: AuthVerifier = { verify: () => Promise.resolve(identity) };

describe('memory runtime assembly', () => {
  it('defaults to a deterministic null provider without exposing it on the API', async () => {
    let closed = false;
    const resources = { sqlPool: { connect: () => Promise.reject(new Error('unused')) },
      rawPool: {} as NodePostgresResources['rawPool'],
      close: () => { closed = true; return Promise.resolve(); } };
    const runtime = createPersistentApiFromResources(resources, verifier);
    expect(runtime.memoryProvider).toBeInstanceOf(NullMemoryProvider);
    const response = await runtime.app.request('/health');
    const body: unknown = await response.json();
    expect(JSON.stringify(body)).not.toContain('memory');
    await runtime.close();
    expect(closed).toBe(true);
  });
  it('selects explicit none and server-only hindsight', () => {
    expect(resolveMemoryProvider({ provider: 'none' })).toBeInstanceOf(NullMemoryProvider);
    expect(resolveMemoryProvider({ provider: 'hindsight', url: 'https://api.example.com',
      apiKey: 'server-only-key', requestTimeoutMs: 5000 })).not.toBeInstanceOf(NullMemoryProvider);
    const browser = readBrowserRuntimeConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      VITE_ELARA_API_URL: 'https://api.example.com',
      ELARA_MEMORY_PROVIDER: 'hindsight', ELARA_HINDSIGHT_API_KEY: 'server-only-key',
    });
    expect(JSON.stringify(browser)).not.toContain('server-only-key');
    expect(JSON.stringify(browser)).not.toContain('hindsight');
  });
});
