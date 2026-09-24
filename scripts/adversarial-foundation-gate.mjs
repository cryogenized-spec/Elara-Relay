import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();

function runVitest(paths) {
  return spawnSync(
    process.execPath,
    [join(root, 'node_modules/vitest/vitest.mjs'), 'run', ...paths],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
}

function hostileMutation(path, search, replacement, tests, label) {
  const absolute = join(root, path);
  const original = readFileSync(absolute, 'utf8');
  if (!original.includes(search)) {
    throw new Error(`Mutation target disappeared: ${label}`);
  }

  try {
    writeFileSync(absolute, original.replace(search, replacement));
    const result = runVitest(tests);
    if (result.status === 0) {
      throw new Error(
        `Adversarial mutation survived: ${label}. The test suite failed to detect a removed invariant.`,
      );
    }
  } finally {
    writeFileSync(absolute, original);
  }
}

hostileMutation(
  'src/domain/revision.ts',
  'if (currentRevision !== expectedRevision) {',
  'if (false) {',
  ['src/domain/revision.test.ts'],
  'optimistic concurrency check removed',
);

hostileMutation(
  'src/contracts/foundation.ts',
  '.strict();',
  ';',
  ['src/contracts/foundation.test.ts'],
  'mutation boundary widened to accept unknown fields',
);

process.stdout.write(
  'Adversarial foundation gate passed: hostile concurrency and schema-boundary mutations were rejected by the test suite.\n',
);
