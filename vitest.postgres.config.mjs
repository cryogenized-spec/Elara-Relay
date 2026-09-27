import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['integration/postgres-live.test.ts', 'integration/backup-restore.test.ts'],
    passWithNoTests: false,
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
