import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { createBrowserRuntime, type BrowserRuntime } from './app/browser-runtime';
import { readBrowserRuntimeConfig } from './app/runtime-config';
import './app/app.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Elara root element is missing');
}

let runtime: BrowserRuntime | undefined;
let configurationError: string | undefined;

try {
  runtime = createBrowserRuntime(readBrowserRuntimeConfig(import.meta.env));
} catch (error: unknown) {
  configurationError =
    error instanceof Error ? error.message : 'Browser runtime configuration is invalid';
}

createRoot(root).render(
  <StrictMode>
    <App runtime={runtime} configurationError={configurationError} />
  </StrictMode>,
);
