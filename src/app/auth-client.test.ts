import { describe, expect, it } from 'vitest';
import type { RawSession } from './supabase-runtime.mjs';
import { toBrowserAuthSession } from './auth-client';

describe('browser auth session mapping', () => {
  it('keeps only the bearer identity needed by the app', () => {
    const session = {
      access_token: 'access-token',
      user: {
        id: '30000000-0000-4000-8000-000000000001',
        email: 'owner@example.com',
      },
    } satisfies RawSession;

    expect(toBrowserAuthSession(session)).toEqual({
      accessToken: 'access-token',
      userId: '30000000-0000-4000-8000-000000000001',
      email: 'owner@example.com',
    });
  });

  it('preserves the signed-out state', () => {
    expect(toBrowserAuthSession(null)).toBeNull();
  });
});
