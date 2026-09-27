import { z } from 'zod';

const positiveIntegerSchema = z.number().int().positive();

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

function normalizeUrl(raw: string, name: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') throw new Error(`${name} is required when memory provider is "hindsight"`);
  let url: URL;
  try { url = new URL(trimmed); }
  catch { throw new Error(`${name} must be a valid URL`); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' ||
    url.pathname !== '/') {
    throw new Error(`${name} must be an HTTPS origin (HTTP only on loopback), without credentials, path, query or fragment`);
  }
  return url.origin;
}

export type MemoryProviderKind = 'none' | 'hindsight';

export interface MemoryNoneConfig {
  readonly provider: 'none';
}

export interface MemoryHindsightConfig {
  readonly provider: 'hindsight';
  readonly url: string;
  readonly apiKey: string;
  readonly requestTimeoutMs: number;
}

export type MemoryRuntimeConfig = MemoryNoneConfig | MemoryHindsightConfig;

/**
 * Read memory provider configuration from environment variables.
 *
 * Follows the same parsing/validation pattern as the existing database and
 * auth config authorities: fail closed on explicit misconfiguration, allow
 * clean "no provider" defaults.
 */
export function readMemoryRuntimeConfig(
  env: NodeJS.ProcessEnv,
): MemoryRuntimeConfig {
  const raw = env['ELARA_MEMORY_PROVIDER']?.trim().toLowerCase();

  // No provider configured — clean absence.
  if (raw === undefined || raw === '' || raw === 'none') {
    return { provider: 'none' };
  }

  if (raw === 'hindsight') {
    const urlRaw = env['ELARA_HINDSIGHT_URL'] ?? '';
    const apiKeyRaw = env['ELARA_HINDSIGHT_API_KEY']?.trim() ?? '';

    if (apiKeyRaw === '' || /[\r\n]/.test(apiKeyRaw)) {
      throw new Error(
        'ELARA_HINDSIGHT_API_KEY is required when ELARA_MEMORY_PROVIDER is "hindsight"',
      );
    }

    const url = normalizeUrl(urlRaw, 'ELARA_HINDSIGHT_URL');

    const requestTimeoutMs = parsePositiveInteger(
      env['ELARA_MEMORY_REQUEST_TIMEOUT_MS'],
      5_000,
      'ELARA_MEMORY_REQUEST_TIMEOUT_MS',
    );
    if (requestTimeoutMs > 30_000) {
      throw new Error('ELARA_MEMORY_REQUEST_TIMEOUT_MS may not exceed 30000');
    }

    return { provider: 'hindsight', url, apiKey: apiKeyRaw, requestTimeoutMs };
  }

  throw new Error('ELARA_MEMORY_PROVIDER must be "none" or "hindsight"');
}