import { z } from 'zod';

const browserRuntimeEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().trim().min(1),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
  VITE_ELARA_API_URL: z.string().trim().min(1),
});

export interface BrowserRuntimeConfig {
  supabaseUrl: string;
  publishableKey: string;
  apiBaseUrl: string;
}

function parseUrl(raw: string, name: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (url.username !== '' || url.password !== '') {
    throw new Error(`${name} must not contain credentials`);
  }

  const local =
    url.hostname === '127.0.0.1' ||
    url.hostname === 'localhost' ||
    url.hostname === '[::1]';

  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error(`${name} must use HTTPS outside local development`);
  }

  return url;
}

export function readBrowserRuntimeConfig(
  env: Record<string, unknown>,
): BrowserRuntimeConfig {
  const parsed = browserRuntimeEnvSchema.parse(env);
  const supabaseUrl = parseUrl(parsed.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL');
  const apiUrl = parseUrl(parsed.VITE_ELARA_API_URL, 'VITE_ELARA_API_URL');

  if (!parsed.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
    throw new Error(
      'VITE_SUPABASE_PUBLISHABLE_KEY must use a modern sb_publishable_ key',
    );
  }

  supabaseUrl.pathname = '';
  supabaseUrl.search = '';
  supabaseUrl.hash = '';

  apiUrl.search = '';
  apiUrl.hash = '';

  return {
    supabaseUrl: supabaseUrl.origin,
    publishableKey: parsed.VITE_SUPABASE_PUBLISHABLE_KEY,
    apiBaseUrl: apiUrl.toString().replace(/\/$/, ''),
  };
}
