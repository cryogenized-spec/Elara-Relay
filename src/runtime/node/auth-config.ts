import { z } from 'zod';
import type { SupabaseAuthVerifierConfig } from '../../auth/supabase-auth-verifier';

const uuidSchema = z.string().uuid();

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

  const parsed = parts.map((value) => uuidSchema.parse(value));
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
  };
}
