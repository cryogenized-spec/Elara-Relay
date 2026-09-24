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
  'input.jobId !== null && transaction.getJob(input.jobId) === undefined',
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
  'src/db/migrations/0001_domain_kernel.sql',
  'before update or delete on events',
  'before insert on events',
  () => runNode('scripts/migration-contract-gate.mjs'),
  'append-only event trigger bypass',
);

process.stdout.write(
  'Adversarial domain gate passed: replay, foreign-key, event-history, and append-only migration mutations were rejected.\n',
);
