import {
  createRemoteJWKSet,
  customFetch,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from 'jose';
import { z } from 'zod';
import {
  authIdentitySchema,
  type AuthIdentity,
  type AuthVerifier,
} from './auth-verifier';
import { AuthenticationError, AuthorizationError } from './errors';

const verifiedClaimsSchema = z
  .object({
    iss: z.string(),
    aud: z.union([z.string(), z.array(z.string())]),
    exp: z.number().int(),
    iat: z.number().int(),
    sub: z.string().uuid(),
    role: z.literal('authenticated'),
    aal: z.enum(['aal1', 'aal2']),
    session_id: z.string().uuid(),
    email: z.string().email().optional(),
    is_anonymous: z.boolean(),
  })
  .passthrough();

const authUserSchema = z
  .object({
    id: z.string().uuid(),
  })
  .passthrough();

export interface SupabaseAuthVerifierConfig {
  supabaseUrl: string;
  publishableKey: string;
  allowedUserIds: ReadonlySet<string>;
  requestTimeoutMs: number;
}

export interface SupabaseAuthVerifierOptions {
  fetch?: typeof fetch;
  now?: () => number;
  allowInsecureIssuer?: boolean;
}

// Tokens genuinely issued within the last minute are accepted even if their
// embedded issued-at runs slightly ahead of this server's clock. Anything
// further in the future is rejected rather than trusted.
const MAX_CLOCK_SKEW_MS = 60_000;

function normalizedOrigin(raw: string): string {
  return new URL(raw).origin;
}

function audienceIncludesAuthenticated(audience: string | string[]): boolean {
  return Array.isArray(audience)
    ? audience.includes('authenticated')
    : audience === 'authenticated';
}

export class SupabaseAuthVerifier implements AuthVerifier {
  private readonly origin: string;
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  public constructor(
    private readonly config: SupabaseAuthVerifierConfig,
    options: SupabaseAuthVerifierOptions = {},
  ) {
    // Auth fetches bound every request handler, so a missing or absurd
    // timeout fails closed at construction instead of hanging workers.
    if (
      !Number.isInteger(config.requestTimeoutMs) ||
      config.requestTimeoutMs <= 0
    ) {
      throw new Error('requestTimeoutMs must be a positive integer');
    }
    this.origin = normalizedOrigin(config.supabaseUrl);
    // JWKS and user-info fetches authenticate the issuer, so a plaintext
    // issuer would let a network attacker mint trusted tokens. Production
    // wiring must stay HTTPS; only local tests may opt out explicitly.
    if (
      this.origin.startsWith('http://') &&
      options.allowInsecureIssuer !== true
    ) {
      throw new Error(
        'Supabase issuer must use HTTPS outside local tests',
      );
    }
    this.issuer = `${this.origin}/auth/v1`;
    this.fetchFn = options.fetch ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.jwks = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
      {
        timeoutDuration: config.requestTimeoutMs,
        [customFetch]: this.fetchFn,
      },
    );
  }

  public async verify(accessToken: string): Promise<AuthIdentity> {
    try {
      const header = decodeProtectedHeader(accessToken);
      let payload: JWTPayload;

      if (header.alg === 'HS256') {
        payload = await this.verifyLegacyToken(accessToken);
      } else if (header.alg === 'ES256' || header.alg === 'RS256') {
        payload = (
          await jwtVerify(accessToken, this.jwks, {
            algorithms: ['ES256', 'RS256'],
            issuer: this.issuer,
            audience: 'authenticated',
          })
        ).payload;
      } else {
        throw new AuthenticationError();
      }

      return this.identityFromPayload(payload);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      throw new AuthenticationError();
    }
  }

  private async verifyLegacyToken(accessToken: string): Promise<JWTPayload> {
    const response = await this.fetchFn(`${this.issuer}/user`, {
      method: 'GET',
      headers: {
        apikey: this.config.publishableKey,
        authorization: `Bearer ${accessToken}`,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (!response.ok) {
      throw new AuthenticationError();
    }

    const user = authUserSchema.parse(await response.json());
    const payload = decodeJwt(accessToken);

    if (payload.sub !== user.id) {
      throw new AuthenticationError();
    }

    return payload;
  }

  private identityFromPayload(payload: JWTPayload): AuthIdentity {
    const claims = verifiedClaimsSchema.parse(payload);

    if (
      claims.iss !== this.issuer ||
      !audienceIncludesAuthenticated(claims.aud) ||
      claims.exp * 1000 <= this.now() ||
      claims.iat * 1000 > this.now() + MAX_CLOCK_SKEW_MS ||
      claims.is_anonymous
    ) {
      throw new AuthenticationError();
    }

    if (!this.config.allowedUserIds.has(claims.sub)) {
      throw new AuthorizationError();
    }

    return authIdentitySchema.parse({
      userId: claims.sub,
      sessionId: claims.session_id,
      email: claims.email ?? null,
      aal: claims.aal,
    });
  }
}
