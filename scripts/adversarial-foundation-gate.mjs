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
    "test('authenticated mobile operations shell reads live domain state'",
    "test.only('mobile operations shell renders and navigates without browser errors'",
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

{
  const path = '.github/workflows/ci.yml';
  const absolute = join(root, path);
  const original = readFileSync(absolute, 'utf8');
  const hostile = original.replace('contents: read', 'contents: write');
  if (hostile === original) {
    throw new Error('Mutation target disappeared: certification token permission');
  }
  try {
    writeFileSync(absolute, hostile);
    const result = runNode('scripts/supply-chain-gate.mjs');
    if (result.status === 0) {
      throw new Error(
        'Adversarial mutation survived: certification workflow gained repository write authority.',
      );
    }
  } finally {
    writeFileSync(absolute, original);
  }
}

{
  const path = 'src/app/App.tsx';
  const absolute = join(root, path);
  const original = readFileSync(absolute, 'utf8');
  const hostile = original.replace(
    '<main className="appShell">',
    '<main className="appShell" dangerouslySetInnerHTML={{ __html: "<p>hostile</p>" }}>',
  );
  if (hostile === original) {
    throw new Error('Mutation target disappeared: direct HTML injection');
  }
  try {
    writeFileSync(absolute, hostile);
    const result = runNode('scripts/security-architecture-gate.mjs');
    if (result.status === 0) {
      throw new Error(
        'Adversarial mutation survived: direct HTML injection was not rejected.',
      );
    }
  } finally {
    writeFileSync(absolute, original);
  }
}

// Recovery certification must fail loudly when restore verification loses a
// check. Removing the anti-drift tripwire (unknown public tables) or the
// content-digest comparison must break the recovery unit suite.
hostileMutation(
  'src/runtime/node/recovery/verify.mjs',
  "'no unaccounted public tables',",
  "'no unaccounted public tables (check disabled)',",
  ['src/runtime/node/recovery/recovery.test.ts'],
  'recovery unknown-table drift check removed',
);

hostileMutation(
  'src/runtime/node/recovery/verify.mjs',
  '`content checksum preserved: ${expected.name}`,',
  '`content checksum (check disabled): ${expected.name}`,',
  ['src/runtime/node/recovery/recovery.test.ts'],
  'recovery content-digest verification removed',
);

process.stdout.write(
  'Adversarial foundation gate passed: hostile concurrency, schema-boundary, dependency-pin, focused-test, workflow-permission, client-injection, and recovery-verification mutations were rejected.\n',
);