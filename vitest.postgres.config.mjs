import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'integration/postgres-live.test.ts',
      'integration/chat-postgres.test.ts',
    ],
    passWithNoTests: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
