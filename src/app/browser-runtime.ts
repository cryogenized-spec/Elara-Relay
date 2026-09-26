import { createSupabaseBrowserAuth, type BrowserAuthClient } from './auth-client';
import { createOperationsApi, type OperationsApi } from './operations-api';
import type { BrowserRuntimeConfig } from './runtime-config';

export interface BrowserRuntime {
  auth: BrowserAuthClient;
  api: OperationsApi;
}

export function createBrowserRuntime(
  config: BrowserRuntimeConfig,
): BrowserRuntime {
  const auth = createSupabaseBrowserAuth(config);
  const api = createOperationsApi({
    baseUrl: config.apiBaseUrl,
    getAccessToken: () => auth.getAccessToken(),
  });

  return { auth, api };
}
