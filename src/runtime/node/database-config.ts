import { z } from 'zod';

const positiveIntegerSchema = z.number().int().positive();

export interface DatabaseRuntimeConfig {
  databaseUrl: string;
  poolMax: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
}

function parsePositiveInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const value = Number(raw);
  const result = positiveIntegerSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`${name} must be a positive integer`);
  }
  return result.data;
}

function normalizeDatabaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error('DATABASE_URL is required');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use postgres:// or postgresql://');
  }

  const host = url.hostname.toLowerCase();
  const local =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1';

  const sslMode = url.searchParams.get('sslmode');

  if (!local) {
    if (sslMode === null) {
      url.searchParams.set('sslmode', 'require');
    } else if (
      sslMode !== 'require' &&
      sslMode !== 'verify-ca' &&
      sslMode !== 'verify-full'
    ) {
      throw new Error(
        'Remote DATABASE_URL connections must require TLS',
      );
    }
  }

  return url.toString();
}

export function readDatabaseRuntimeConfig(
  env: NodeJS.ProcessEnv,
): DatabaseRuntimeConfig {
  const databaseUrl = normalizeDatabaseUrl(env['DATABASE_URL'] ?? '');

  const poolMax = parsePositiveInteger(
    env['ELARA_DB_POOL_MAX'],
    5,
    'ELARA_DB_POOL_MAX',
  );
  if (poolMax > 20) {
    throw new Error('ELARA_DB_POOL_MAX may not exceed 20');
  }

  const idleTimeoutMs = parsePositiveInteger(
    env['ELARA_DB_IDLE_TIMEOUT_MS'],
    30_000,
    'ELARA_DB_IDLE_TIMEOUT_MS',
  );

  const connectionTimeoutMs = parsePositiveInteger(
    env['ELARA_DB_CONNECTION_TIMEOUT_MS'],
    10_000,
    'ELARA_DB_CONNECTION_TIMEOUT_MS',
  );

  return {
    databaseUrl,
    poolMax,
    idleTimeoutMs,
    connectionTimeoutMs,
  };
}
