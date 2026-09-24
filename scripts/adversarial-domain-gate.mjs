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

mutate(
  'src/domain/kernel.ts',
  'COLLECTED: [],',
  "COLLECTED: ['REPAIRING'],",
  () => runVitest('src/domain/repair-kernel.test.ts'),
  'collected Repair reopening protection removal',
);

mutate(
  'src/contracts/repair.ts',
  "repair.finalTestResult !== 'PASS'",
  'false',
  () => runVitest('src/domain/repair-kernel.test.ts'),
  'Repair Ready passing-test invariant removal',
);

mutate(
  'src/db/migrations/0003_repairs_domain.sql',
  'job_id uuid not null unique references jobs(id) on delete restrict',
  'job_id uuid not null references jobs(id) on delete restrict',
  () => runNode('scripts/migration-contract-gate.mjs'),
  'Repair one-to-one Job constraint removal',
);

mutate(
  'src/db/migrations/0003_repairs_domain.sql',
  'alter table public.repairs enable row level security;',
  '-- hostile mutation: Repair RLS removed',
  () => runNode('scripts/migration-contract-gate.mjs'),
  'Repair RLS removal',
);

mutate(
  'src/domain/kernel.ts',
  "existing.leaseExpiresAt > input.asOf",
  'false',
  () => runVitest('src/domain/scheduler-kernel.test.ts'),
  'scheduler live-lease exclusion removal',
);

mutate(
  'src/domain/scheduler-recurrence.ts',
  'Math.floor(elapsed / intervalMs) + 1',
  '1',
  () => runVitest('src/domain/scheduler-kernel.test.ts'),
  'scheduler missed-interval catch-up protection removal',
);

mutate(
  'src/db/migrations/0004_scheduler.sql',
  'occurrence_key text not null unique',
  'occurrence_key text not null',
  () => runNode('scripts/migration-contract-gate.mjs'),
  'scheduler occurrence uniqueness removal',
);

mutate(
  'src/db/migrations/0004_scheduler.sql',
  'alter table public.scheduled_actions enable row level security;',
  '-- hostile mutation: scheduler RLS removed',
  () => runNode('scripts/migration-contract-gate.mjs'),
  'scheduled action RLS removal',
);

mutate(
  'src/db/migrations/0004_scheduler.sql',
  "payload ->> 'recipient' = 'OWNER'",
  "payload ->> 'recipient' <> 'OWNER'",
  () => runNode('scripts/migration-contract-gate.mjs'),
  'owner-only scheduler email boundary removal',
);

mutate(
  'src/db/migrations/0004_scheduler.sql',
  'delivery_snapshot jsonb not null check (',
  'delivery_snapshot jsonb check (',
  () => runNode('scripts/migration-contract-gate.mjs'),
  'scheduler delivery snapshot requiredness removal',
);

mutate(
  'src/db/migrations/0004_scheduler.sql',
  "delivery_snapshot -> 'payload' ->> 'recipient' = 'OWNER'",
  "delivery_snapshot -> 'payload' ->> 'recipient' <> 'OWNER'",
  () => runNode('scripts/migration-contract-gate.mjs'),
  'scheduler snapshot owner-email boundary removal',
);

mutate(
  'src/db/migrations/0004_scheduler.sql',
  'check (completed_at is null or completed_at <= lease_expires_at),',
  '-- hostile mutation: completion no longer bounded by lease',
  () => runNode('scripts/migration-contract-gate.mjs'),
  'scheduler completion lease bound removal',
);

mutate(
  'src/contracts/scheduler.ts',
  'run.completedAt < run.claimedAt ||',
  'false ||',
  () => runVitest('src/contracts/scheduler.test.ts'),
  'scheduler pre-claim completion validation removal',
);

process.stdout.write(
  'Adversarial domain gate passed: replay, foreign-key, event-history, terminal-state, Repair lifecycle/test/one-to-one controls, Scheduler lease/catch-up/occurrence/delivery-snapshot/owner-email/completion controls, append-only, advisory-lock, row-lock, one-event-per-mutation, RLS, privilege-revocation, and search_path mutations were rejected.\n',
);
