import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['integration/postgres-live.test.ts'],
    passWithNoTests: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
