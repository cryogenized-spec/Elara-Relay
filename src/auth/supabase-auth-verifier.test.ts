import { createSecretKey } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import {
  SignJWT,
  exportJWK,
  generateKeyPair,
} from 'jose';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import {
  AuthenticationError,
  AuthorizationError,
} from './errors';
import { SupabaseAuthVerifier } from './supabase-auth-verifier';

const ALLOWED_USER = '60000000-0000-4000-8000-000000000001';
const OTHER_USER = '60000000-0000-4000-8000-000000000002';
const SESSION_ID = '60000000-0000-4000-8000-000000000003';

let server: Server;
let origin: string;
let privateKey: CryptoKey;

async function tokenFor(
  userId: string,
  overrides: {
    audience?: string;
    issuer?: string;
    expiresAt?: number;
    isAnonymous?: boolean;
  } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    role: 'authenticated',
    aal: 'aal1',
    session_id: SESSION_ID,
    email: 'owner@example.com',
    is_anonymous: overrides.isAnonymous ?? false,
  })
    .setProtectedHeader({
      alg: 'ES256',
      kid: 'test-es256',
      typ: 'JWT',
    })
    .setSubject(userId)
    .setIssuer(overrides.issuer ?? `${origin}/auth/v1`)
    .setAudience(overrides.audience ?? 'authenticated')
    .setIssuedAt(now)
    .setExpirationTime(overrides.expiresAt ?? now + 3600)
    .sign(privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);

  server = createServer((request, response) => {
    if (
      request.url === '/auth/v1/.well-known/jwks.json' &&
      request.method === 'GET'
    ) {
      response.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=60',
      });
      response.end(
        JSON.stringify({
          keys: [
            {
              ...publicJwk,
              kid: 'test-es256',
              alg: 'ES256',
              use: 'sig',
            },
          ],
        }),
      );
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Test JWKS server did not expose an address');
  }
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
});

describe('SupabaseAuthVerifier', () => {
  it('verifies asymmetric Supabase-style JWTs through JWKS', async () => {
    const verifier = new SupabaseAuthVerifier({
      supabaseUrl: origin,
      publishableKey: 'sb_publishable_test',
      allowedUserIds: new Set([ALLOWED_USER]),
    });

    await expect(verifier.verify(await tokenFor(ALLOWED_USER))).resolves.toEqual({
      userId: ALLOWED_USER,
      sessionId: SESSION_ID,
      email: 'owner@example.com',
      aal: 'aal1',
    });
  });

  it('rejects valid tokens for users outside the application allowlist', async () => {
    const verifier = new SupabaseAuthVerifier({
      supabaseUrl: origin,
      publishableKey: 'sb_publishable_test',
      allowedUserIds: new Set([ALLOWED_USER]),
    });

    await expect(
      verifier.verify(await tokenFor(OTHER_USER)),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('rejects expired, wrong-audience, wrong-issuer, and anonymous sessions', async () => {
    const verifier = new SupabaseAuthVerifier({
      supabaseUrl: origin,
      publishableKey: 'sb_publishable_test',
      allowedUserIds: new Set([ALLOWED_USER]),
    });
    const now = Math.floor(Date.now() / 1000);

    const invalidTokens = [
      await tokenFor(ALLOWED_USER, { expiresAt: now - 5 }),
      await tokenFor(ALLOWED_USER, { audience: 'anon' }),
      await tokenFor(ALLOWED_USER, {
        issuer: 'https://wrong.example/auth/v1',
      }),
      await tokenFor(ALLOWED_USER, { isAnonymous: true }),
    ];

    for (const token of invalidTokens) {
      await expect(verifier.verify(token)).rejects.toBeInstanceOf(
        AuthenticationError,
      );
    }
  });

  it('validates legacy HS256 sessions through the Supabase Auth user endpoint', async () => {
    const now = Math.floor(Date.now() / 1000);
    const secret = createSecretKey(
      Buffer.from('test-only-hs256-secret-with-sufficient-length'),
    );
    const token = await new SignJWT({
      role: 'authenticated',
      aal: 'aal1',
      session_id: SESSION_ID,
      email: 'owner@example.com',
      is_anonymous: false,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(ALLOWED_USER)
      .setIssuer('https://legacy.supabase.co/auth/v1')
      .setAudience('authenticated')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(secret);

    const calls: Array<{
      input: string;
      authorization: string | null;
      apiKey: string | null;
    }> = [];

    const fakeFetch: typeof fetch = (input, init) => {
      const request = new Request(input, init);
      calls.push({
        input: request.url,
        authorization: request.headers.get('authorization'),
        apiKey: request.headers.get('apikey'),
      });
      return Promise.resolve(
        new Response(JSON.stringify({ id: ALLOWED_USER }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };

    const verifier = new SupabaseAuthVerifier(
      {
        supabaseUrl: 'https://legacy.supabase.co',
        publishableKey: 'sb_publishable_legacy_test',
        allowedUserIds: new Set([ALLOWED_USER]),
      },
      { fetch: fakeFetch },
    );

    await expect(verifier.verify(token)).resolves.toMatchObject({
      userId: ALLOWED_USER,
    });
    expect(calls).toEqual([
      {
        input: 'https://legacy.supabase.co/auth/v1/user',
        authorization: `Bearer ${token}`,
        apiKey: 'sb_publishable_legacy_test',
      },
    ]);
  });

  it('rejects a legacy token when the Auth server does not validate it', async () => {
    const now = Math.floor(Date.now() / 1000);
    const secret = createSecretKey(
      Buffer.from('test-only-hs256-secret-with-sufficient-length'),
    );
    const token = await new SignJWT({
      role: 'authenticated',
      aal: 'aal1',
      session_id: SESSION_ID,
      is_anonymous: false,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(ALLOWED_USER)
      .setIssuer('https://legacy.supabase.co/auth/v1')
      .setAudience('authenticated')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(secret);

    const verifier = new SupabaseAuthVerifier(
      {
        supabaseUrl: 'https://legacy.supabase.co',
        publishableKey: 'sb_publishable_legacy_test',
        allowedUserIds: new Set([ALLOWED_USER]),
      },
      {
        fetch: () =>
          Promise.resolve(new Response(null, { status: 401 })),
      },
    );

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });
});
