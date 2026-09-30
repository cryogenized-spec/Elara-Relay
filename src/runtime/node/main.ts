/**
 * Production entrypoint for the privileged Elara Relay Operations API.
 *
 * This is the Node-plane counterpart of `src/main.tsx` (the browser plane).
 * The two are built and deployed separately: this artifact reads
 * `DATABASE_URL`, the Supabase publishable key, and the owner allowlist from
 * the process environment, and it is never bundled into browser output.
 *
 * Build:  `npm run build:server`  →  `dist-server/server.mjs`
 * Run:    `npm start`              (configuration comes from the platform)
 */
import { describeFailure } from './diagnostics';
import { createProcessHost, runProductionServer } from './server';

const host = createProcessHost();

void runProductionServer(host).then(
  (code) => {
    process.exitCode = code;
    process.exit(code);
  },
  (error: unknown) => {
    host.log.fail(`fatal startup failure: ${describeFailure(error)}`);
    process.exitCode = 1;
    process.exit(1);
  },
);
