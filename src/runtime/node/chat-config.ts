import { z } from 'zod';

/**
 * Server-only chat provider runtime configuration.
 *
 * Chat providers are optional infrastructure. Each provider is enabled only
 * when its server-side API key is present, so a missing key disables exactly
 * that provider and leaves manual Elara operations and the other configured
 * providers untouched. A value that is present but malformed fails closed at
 * startup rather than silently degrading to a different endpoint.
 *
 * No chat credential is ever read from, or exposed to, browser configuration.
 */
const positiveIntegerSchema = z.number().int().positive();

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const MAX_REQUEST_TIMEOUT_MS = 600_000;

const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const MUSE_DEFAULT_BASE_URL = 'https://api.meta.ai/v1';

export type ChatConfiguredProviderId = 'openai' | 'muse';

export interface ChatOpenAiRuntimeConfig {
  readonly provider: 'openai';
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly requestTimeoutMs: number;
}

export interface ChatMuseRuntimeConfig {
  readonly provider: 'muse';
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly requestTimeoutMs: number;
}

export type ChatProviderRuntimeConfig =
  | ChatOpenAiRuntimeConfig
  | ChatMuseRuntimeConfig;

export interface ChatRuntimeConfig {
  readonly providers: readonly ChatProviderRuntimeConfig[];
}

function parseRequestTimeoutMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_REQUEST_TIMEOUT_MS;

  const value = Number(raw);
  if (!positiveIntegerSchema.safeParse(value).success) {
    throw new Error('ELARA_CHAT_REQUEST_TIMEOUT_MS must be a positive integer');
  }
  if (value > MAX_REQUEST_TIMEOUT_MS) {
    throw new Error(
      `ELARA_CHAT_REQUEST_TIMEOUT_MS may not exceed ${MAX_REQUEST_TIMEOUT_MS}`,
    );
  }
  return value;
}

/**
 * A provider is enabled by its key alone. An absent or empty key is a clean
 * "not configured" state; anything else that is malformed is an error.
 */
function readApiKey(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const raw = env[name];
  if (raw === undefined) return undefined;
  if (/[\r\n]/.test(raw)) {
    throw new Error(`${name} must not contain newlines`);
  }
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

function normalizeBaseUrl(
  raw: string | undefined,
  fallback: string,
  name: string,
): string {
  const trimmed = (raw ?? fallback).trim();
  if (/\s/.test(trimmed)) {
    throw new Error(`${name} must be a valid URL`);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error(
      `${name} must be an HTTPS origin and API path (HTTP is allowed only on loopback)`,
    );
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error(`${name} must not contain credentials`);
  }
  if (url.search !== '' || url.hash !== '') {
    throw new Error(`${name} must not contain a query or fragment`);
  }

  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

export function readChatRuntimeConfig(
  env: NodeJS.ProcessEnv,
): ChatRuntimeConfig {
  const requestTimeoutMs = parseRequestTimeoutMs(
    env['ELARA_CHAT_REQUEST_TIMEOUT_MS'],
  );
  const providers: ChatProviderRuntimeConfig[] = [];

  const openAiApiKey = readApiKey(env, 'ELARA_OPENAI_API_KEY');
  if (openAiApiKey !== undefined) {
    providers.push({
      provider: 'openai',
      apiKey: openAiApiKey,
      baseUrl: normalizeBaseUrl(
        env['ELARA_OPENAI_BASE_URL'],
        OPENAI_DEFAULT_BASE_URL,
        'ELARA_OPENAI_BASE_URL',
      ),
      requestTimeoutMs,
    });
  }

  const museApiKey = readApiKey(env, 'ELARA_MUSE_API_KEY');
  if (museApiKey !== undefined) {
    providers.push({
      provider: 'muse',
      apiKey: museApiKey,
      baseUrl: normalizeBaseUrl(
        env['ELARA_MUSE_BASE_URL'],
        MUSE_DEFAULT_BASE_URL,
        'ELARA_MUSE_BASE_URL',
      ),
      requestTimeoutMs,
    });
  }

  return { providers };
}
