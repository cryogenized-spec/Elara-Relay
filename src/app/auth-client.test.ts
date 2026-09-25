import { describe, expect, it } from 'vitest';
import type { RawSession } from './supabase-runtime.mjs';
import { toBrowserAuthSession } from './auth-client';

const ACCESS_TOKEN =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIzMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJzZXNzaW9uX2lkIjoiMzAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAyIn0.signature';

describe('browser auth session mapping', () => {
  it('keeps the bearer identity and opaque session marker needed by the app', () => {
    const session = {
      access_token: ACCESS_TOKEN,
      user: {
        id: '30000000-0000-4000-8000-000000000001',
        email: 'owner@example.com',
      },
    } satisfies RawSession;

    expect(toBrowserAuthSession(session)).toEqual({
      accessToken: ACCESS_TOKEN,
      userId: '30000000-0000-4000-8000-000000000001',
      sessionId: '30000000-0000-4000-8000-000000000002',
      email: 'owner@example.com',
    });
  });

  it('rejects a token whose subject contradicts the Supabase user', () => {
    const session = {
      access_token: ACCESS_TOKEN,
      user: {
        id: '30000000-0000-4000-8000-000000000099',
        email: 'other@example.com',
      },
    } satisfies RawSession;

    expect(() => toBrowserAuthSession(session)).toThrow(
      'Supabase session subject does not match the session user',
    );
  });

  it('preserves the signed-out state', () => {
    expect(toBrowserAuthSession(null)).toBeNull();
  });
});
