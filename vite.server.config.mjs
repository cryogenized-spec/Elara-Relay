import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const manifest = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
);

// Runtime dependencies stay external. The deployed artifact resolves `hono`,
// `jose`, `pg`, and `zod` from a production `node_modules` installed from the
// exact lockfile, so the bundle cannot silently pin a second copy of a
// security-relevant library.
const external = Object.keys(manifest.dependencies ?? {});

/**
 * Privileged Node API build (separate plane from the browser build).
 *
 * Source imports are extensionless under `moduleResolution: "Bundler"`, which
 * Node's ESM resolver cannot load directly; this build produces the single
 * runnable artifact `dist-server/server.mjs`.
 *
 * `envPrefix: []` matters: no environment value may ever be inlined into the
 * artifact at build time. Every secret is read from `process.env` by the
 * running process, from the deployment platform's secret store.
 */
export default defineConfig({
  envPrefix: [],
  build: {
    target: 'node24',
    outDir: 'dist-server',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    ssr: 'src/runtime/node/main.ts',
    rollupOptions: {
      external,
      output: {
        format: 'es',
        entryFileNames: 'server.mjs',
      },
    },
  },
  ssr: {
    external,
  },
});
