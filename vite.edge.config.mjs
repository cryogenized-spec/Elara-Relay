import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist-edge',
    emptyOutDir: true,
    target: 'es2024',
    minify: false,
    sourcemap: false,
    ssr: 'supabase/functions/elara-api/index.ts',
    rollupOptions: {
      external: ['pg-native'],
      output: {
        entryFileNames: 'index.js',
      },
    },
  },
  ssr: {
    noExternal: true,
  },
});
