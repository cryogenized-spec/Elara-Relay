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

function runNode(script) {
  return spawnSync(process.execPath, [join(root, script)], {
    cwd: root,
    encoding: 'utf8',
  });
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

{
  const path = 'package.json';
  const absolute = join(root, path);
  const original = readFileSync(absolute, 'utf8');
  const hostile = original.replace('"hono": "4.13.8"', '"hono": "^4.13.8"');
  if (hostile === original) {
    throw new Error('Mutation target disappeared: exact direct dependency pin');
  }
  try {
    writeFileSync(absolute, hostile);
    const result = runNode('scripts/supply-chain-gate.mjs');
    if (result.status === 0) {
      throw new Error(
        'Adversarial mutation survived: direct dependency range accepted by supply-chain gate.',
      );
    }
  } finally {
    writeFileSync(absolute, original);
  }
}

{
  const path = 'e2e/foundation.spec.ts';
  const absolute = join(root, path);
  const original = readFileSync(absolute, 'utf8');
  const hostile = original.replace(
    "test('foundation shell renders without browser errors'",
    "test.only('foundation shell renders without browser errors'",
  );
  if (hostile === original) {
    throw new Error('Mutation target disappeared: focused Playwright test');
  }
  try {
    writeFileSync(absolute, hostile);
    const result = runNode('scripts/test-quality-gate.mjs');
    if (result.status === 0) {
      throw new Error(
        'Adversarial mutation survived: focused Playwright test was not rejected.',
      );
    }
  } finally {
    writeFileSync(absolute, original);
  }
}

process.stdout.write(
  'Adversarial foundation gate passed: hostile concurrency, schema-boundary, dependency-pin, and focused-test mutations were rejected.\n',
);
