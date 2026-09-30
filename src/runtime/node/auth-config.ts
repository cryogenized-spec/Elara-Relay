import { z } from 'zod';
import type { SupabaseAuthVerifierConfig } from '../../auth/supabase-auth-verifier';

const uuidSchema = z.string().uuid();
const positiveIntegerSchema = z.number().int().positive();

function parseRequestTimeoutMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return 5_000;
  }

  const value = Number(raw);
  if (!positiveIntegerSchema.safeParse(value).success) {
    throw new Error(
      'ELARA_AUTH_REQUEST_TIMEOUT_MS must be a positive integer',
    );
  }
  if (value > 30_000) {
    throw new Error('ELARA_AUTH_REQUEST_TIMEOUT_MS may not exceed 30000');
  }
  return value;
}

function requiredEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = env[name]?.trim();
  if (value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseSupabaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('SUPABASE_URL must be a valid HTTPS URL');
  }

  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
    throw new Error('SUPABASE_URL must be a valid HTTPS URL');
  }

  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.origin;
}

function parseAllowedUserIds(raw: string): ReadonlySet<string> {
  const parts = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');

  if (parts.length === 0) {
    throw new Error('ELARA_ALLOWED_USER_IDS must contain at least one UUID');
  }

  // safeParse rather than parse: a thrown Zod message would echo the supplied
  // value into a startup log, and a rejected allowlist entry is diagnostic
  // enough by name alone.
  const parsed = parts.map((value) => {
    const result = uuidSchema.safeParse(value);
    if (!result.success) {
      throw new Error(
        'ELARA_ALLOWED_USER_IDS must contain valid user UUIDs',
      );
    }
    return result.data;
  });
  const unique = new Set(parsed);
  if (unique.size !== parsed.length) {
    throw new Error('ELARA_ALLOWED_USER_IDS must not contain duplicates');
  }

  return unique;
}

function parseAllowedOrigins(raw: string): readonly string[] {
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');

  if (values.length === 0) {
    throw new Error('ELARA_ALLOWED_ORIGINS must contain at least one origin');
  }

  const origins = values.map((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error('ELARA_ALLOWED_ORIGINS must contain valid origins');
    }

    // A trusted origin must name one exact host. A wildcard (or a relative
    // host) would turn the browser allowlist into a pattern-match decision,
    // which is not a boundary this API is allowed to have.
    if (
      url.hostname === '' ||
      url.hostname.includes('*') ||
      url.hostname.startsWith('.')
    ) {
      throw new Error(
        'ELARA_ALLOWED_ORIGINS must not contain wildcard or relative hosts',
      );
    }

    const local =
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost' ||
      url.hostname === '[::1]';

    if (
      url.username !== '' ||
      url.password !== '' ||
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      throw new Error(
        'ELARA_ALLOWED_ORIGINS must contain exact HTTPS origins (HTTP is allowed only for local development)',
      );
    }

    return url.origin;
  });

  if (new Set(origins).size !== origins.length) {
    throw new Error('ELARA_ALLOWED_ORIGINS must not contain duplicates');
  }

  return origins;
}

export function readAllowedOrigins(
  env: NodeJS.ProcessEnv,
): readonly string[] {
  return parseAllowedOrigins(requiredEnv(env, 'ELARA_ALLOWED_ORIGINS'));
}

export function readAuthRuntimeConfig(
  env: NodeJS.ProcessEnv,
): SupabaseAuthVerifierConfig {
  const supabaseUrl = parseSupabaseUrl(
    requiredEnv(env, 'SUPABASE_URL'),
  );
  const publishableKey = requiredEnv(
    env,
    'SUPABASE_PUBLISHABLE_KEY',
  );

  if (!publishableKey.startsWith('sb_publishable_')) {
    throw new Error(
      'SUPABASE_PUBLISHABLE_KEY must use a modern sb_publishable_ key',
    );
  }

  return {
    supabaseUrl,
    publishableKey,
    allowedUserIds: parseAllowedUserIds(
      requiredEnv(env, 'ELARA_ALLOWED_USER_IDS'),
    ),
    requestTimeoutMs: parseRequestTimeoutMs(
      env['ELARA_AUTH_REQUEST_TIMEOUT_MS'],
    ),
  };
}
