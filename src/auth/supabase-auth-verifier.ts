import {
  createRemoteJWKSet,
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
}

export interface SupabaseAuthVerifierOptions {
  fetch?: typeof fetch;
  now?: () => number;
}

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
    this.origin = normalizedOrigin(config.supabaseUrl);
    this.issuer = `${this.origin}/auth/v1`;
    this.fetchFn = options.fetch ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.jwks = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
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
