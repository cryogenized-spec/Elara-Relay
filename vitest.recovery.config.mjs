import { defineConfig } from 'vitest/config';

// Recovery kill-test runner. Requires a live PostgreSQL pair:
//   DATABASE_URL                   — source database used to seed + back up
//   ELARA_RECOVERY_DATABASE_URL    — same server, target for restore proofs
// Run through `npm run recovery:check` (scripts/recovery-gate.mjs).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['integration/recovery-kill-test.test.ts'],
    passWithNoTests: false,
    testTimeout: 120_000,
    hookTimeout: 60_000,
    maxConcurrency: 1,
    fileParallelism: false,
  },
});
