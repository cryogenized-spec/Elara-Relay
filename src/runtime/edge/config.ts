import { z } from 'zod';
import type { SupabaseAuthVerifierConfig } from '../../auth/supabase-auth-verifier';

const uuidSchema = z.string().uuid();
const FALLBACK_OWNER_ID = '00000000-0000-4000-8000-000000000000';
const DEFAULT_ALLOWED_ORIGIN = 'https://cryogenized-spec.github.io';

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export interface EdgeRuntimeConfig {
  databaseUrl: string;
  authVerifierConfig: SupabaseAuthVerifierConfig;
  allowedOrigins: readonly string[];
  ownerAllowlistConfigured: boolean;
}

function requiredEnv(env: RuntimeEnvironment, name: string): string {
  const value = env[name]?.trim();
  if (value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readPublishableKey(env: RuntimeEnvironment): string {
  const direct = env['SUPABASE_PUBLISHABLE_KEY']?.trim();
  if (direct !== undefined && direct !== '') {
    return direct;
  }

  const raw = requiredEnv(env, 'SUPABASE_PUBLISHABLE_KEYS');
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('SUPABASE_PUBLISHABLE_KEYS must be valid JSON');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error('SUPABASE_PUBLISHABLE_KEYS must be a JSON object');
  }

  const key = (parsed as Record<string, unknown>)['default'];
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error('SUPABASE_PUBLISHABLE_KEYS.default is required');
  }

  return key.trim();
}

function readAllowedUserIds(
  raw: string | undefined,
): {
  ids: ReadonlySet<string>;
  configured: boolean;
} {
  const configured = raw !== undefined && raw.trim() !== '';
  const source = configured ? raw : FALLBACK_OWNER_ID;

  const values = source
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');

  const ids = values.map((value) => uuidSchema.parse(value));

  if (new Set(ids).size !== ids.length) {
    throw new Error('ELARA_ALLOWED_USER_IDS must not contain duplicates');
  }

  return {
    ids: new Set(ids),
    configured,
  };
}

function readAllowedOrigins(raw: string | undefined): readonly string[] {
  const values = (
    raw === undefined || raw.trim() === ''
      ? DEFAULT_ALLOWED_ORIGIN
      : raw
  )
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');

  return values.map((value) => {
    const url = new URL(value);

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
        'ELARA_ALLOWED_ORIGINS must contain exact HTTPS origins',
      );
    }

    return url.origin;
  });
}

export function readEdgeRuntimeConfig(
  env: RuntimeEnvironment,
): EdgeRuntimeConfig {
  const databaseUrl = requiredEnv(env, 'SUPABASE_DB_URL');
  const supabaseUrl = requiredEnv(env, 'SUPABASE_URL');
  const publishableKey = readPublishableKey(env);
  const allowedUsers = readAllowedUserIds(env['ELARA_ALLOWED_USER_IDS']);

  if (!publishableKey.startsWith('sb_publishable_')) {
    throw new Error(
      'Supabase publishable key must use the sb_publishable_ format',
    );
  }

  return {
    databaseUrl,
    authVerifierConfig: {
      supabaseUrl,
      publishableKey,
      allowedUserIds: allowedUsers.ids,
      requestTimeoutMs: 5_000,
    },
    allowedOrigins: readAllowedOrigins(env['ELARA_ALLOWED_ORIGINS']),
    ownerAllowlistConfigured: allowedUsers.configured,
  };
}
