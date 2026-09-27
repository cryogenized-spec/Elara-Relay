// Phase 1 recovery kill-test gate.
//
// Runs the deterministic disaster-recovery proof: seed -> backup ->
// destroy -> restore -> invariant verification -> application-level
// behavior proof, plus adversarial recovery cases. Fails loudly when the
// environment cannot support a genuine proof instead of skipping.
//
// Required environment:
//   DATABASE_URL                  — PostgreSQL source database (elara schema)
//   ELARA_RECOVERY_DATABASE_URL   — target database on the same server
// Optional:
//   ELARA_RECOVERY_PG_DUMP        — explicit pg_dump binary path
//   ELARA_RECOVERY_PG_RESTORE     — explicit pg_restore binary path

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();

function fail(message) {
  process.stderr.write(`Recovery gate failed: ${message}\n`);
  process.exit(1);
}

const requiredEnv = ['DATABASE_URL', 'ELARA_RECOVERY_DATABASE_URL'];
for (const name of requiredEnv) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    fail(
      `${name} is required. The kill-test must run against a real PostgreSQL server.`,
    );
  }
}

const source = new URL(process.env['DATABASE_URL']);
const target = new URL(process.env['ELARA_RECOVERY_DATABASE_URL']);
if (source.host !== target.host || source.port !== target.port) {
  fail(
    'ELARA_RECOVERY_DATABASE_URL must point at the same PostgreSQL server as DATABASE_URL (recovery replaces the target database).',
  );
}
if (source.pathname === target.pathname) {
  fail(
    'ELARA_RECOVERY_DATABASE_URL must name a different database than DATABASE_URL; the restore target is destroyed and recreated.',
  );
}

for (const tool of ['pg_dump', 'pg_restore']) {
  const envName =
    tool === 'pg_dump'
      ? 'ELARA_RECOVERY_PG_DUMP'
      : 'ELARA_RECOVERY_PG_RESTORE';
  const override = process.env[envName];
  const lookup = override ?? tool;
  const which = spawnSync('which', [lookup], { encoding: 'utf8' });
  if (which.status !== 0) {
    fail(
      `${tool} not found on PATH${override === undefined ? '' : ` (override ${envName}=${override} unusable)`}. Install PostgreSQL client tools matching the server major version, or set ${envName}.`,
    );
  }
}

if (!existsSync(join(root, 'src/db/migrations/0006_ai_chat.sql'))) {
  fail('migration set is incomplete; recovery proof requires the full schema');
}

const result = spawnSync(
  process.execPath,
  [
    join(root, 'node_modules/vitest/vitest.mjs'),
    'run',
    '--config',
    'vitest.recovery.config.mjs',
  ],
  {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    timeout: 15 * 60_000,
  },
);

if (result.stdout !== undefined && result.stdout.trim() !== '') {
  process.stdout.write(result.stdout);
}
if (result.stderr !== undefined && result.stderr.trim() !== '') {
  process.stderr.write(result.stderr);
}

if (result.status !== 0 || result.error !== undefined) {
  fail(
    `recovery kill-test did not pass (exit ${String(result.status)}). A backup that cannot be restored and verified is not a backup.`,
  );
}

process.stdout.write(
  'Recovery kill-test gate passed: backup artifact restored into a clean PostgreSQL database with schema, security boundaries, history, scheduler guarantees, and application-level behavior verified.\n',
);
