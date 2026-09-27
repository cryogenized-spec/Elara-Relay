import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],

  // Production output uses relative asset URLs so the same build works from
  // /Elara-Relay/ on GitHub Pages and remains portable to a future host.
  base: command === 'build' ? './' : '/',

  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
}));
