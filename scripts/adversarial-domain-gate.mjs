import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();

function runVitest(path) {
  return spawnSync(
    process.execPath,
    [join(root, 'node_modules/vitest/vitest.mjs'), 'run', path],
    { cwd: root, encoding: 'utf8' },
  );
}

function runNode(path) {
  return spawnSync(process.execPath, [join(root, path)], {
    cwd: root,
    encoding: 'utf8',
  });
}

function mutate(path, search, replacement, runner, label) {
  const absolute = join(root, path);
  const original = readFileSync(absolute, 'utf8');
  if (!original.includes(search)) {
    throw new Error(`Mutation target disappeared: ${label}`);
  }

  try {
    writeFileSync(absolute, original.replace(search, replacement));
    const result = runner();
    if (result.status === 0) {
      throw new Error(`Adversarial domain mutation survived: ${label}`);
    }
  } finally {
    writeFileSync(absolute, original);
  }
}

mutate(
  'src/domain/kernel.ts',
  'existing.fingerprint !== fingerprint',
  'false',
  () => runVitest('src/domain/kernel.test.ts'),
  'mutation replay fingerprint bypass',
);

mutate(
  'src/domain/kernel.ts',
  'input.jobId !== null && (await transaction.getJob(input.jobId)) === undefined',
  'false',
  () => runVitest('src/domain/kernel.test.ts'),
  'orphan task foreign-key bypass',
);

mutate(
  'src/domain/kernel.ts',
  "eventType: 'TASK_COMPLETED',",
  "eventType: 'TASK_UPDATED',",
  () => runVitest('src/domain/kernel.test.ts'),
  'completion event identity corruption',
);

mutate(
  'src/domain/kernel.ts',
  "patch.status !== undefined &&\n          (current.status === 'DONE' || current.status === 'CANCELLED')",
  "false",
  () => runVitest('src/domain/kernel.test.ts'),
  'terminal task reopening protection removal',
);

mutate(
  'src/db/migrations/0001_domain_kernel.sql',
  'before update or delete on events',
  'before insert on events',
  () => runNode('scripts/migration-contract-gate.mjs'),
  'append-only event trigger bypass',
);

mutate(
  'src/db/postgres/postgres-store.ts',
  "await this.client.query(\n      'select pg_advisory_xact_lock(hashtextextended($1, 0))',",
  "await this.client.query(\n      'select 1',",
  () => runVitest('src/db/postgres/postgres-store.test.ts'),
  'mutation-id advisory lock removal',
);

mutate(
  'src/db/postgres/postgres-store.ts',
  "${this.lockRows ? ' for update' : ''}",
  "''",
  () => runVitest('src/db/postgres/postgres-store.test.ts'),
  'mutable-row lock removal',
);

mutate(
  'src/db/migrations/0001_domain_kernel.sql',
  'mutation_id text not null unique',
  'mutation_id text not null',
  () => runNode('scripts/migration-contract-gate.mjs'),
  'one-event-per-mutation uniqueness removal',
);

mutate(
  'src/db/migrations/0002_security_hardening.sql',
  'alter table public.tasks enable row level security;',
  '-- hostile mutation: tasks RLS removed',
  () => runNode('scripts/migration-contract-gate.mjs'),
  'tasks RLS removal',
);

mutate(
  'src/db/migrations/0002_security_hardening.sql',
  'from authenticated;',
  'from postgres;',
  () => runNode('scripts/migration-contract-gate.mjs'),
  'authenticated privilege revocation removal',
);

mutate(
  'src/db/migrations/0002_security_hardening.sql',
  'set search_path = pg_catalog, public;',
  'reset search_path;',
  () => runNode('scripts/migration-contract-gate.mjs'),
  'trigger search_path hardening removal',
);

process.stdout.write(
  'Adversarial domain gate passed: replay, foreign-key, event-history, terminal-state, append-only, advisory-lock, row-lock, one-event-per-mutation, RLS, privilege-revocation, and search_path mutations were rejected.\n',
);
