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
  const manifest = JSON.parse(original);
  const honoVersion = manifest.dependencies?.hono;
  if (typeof honoVersion !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(honoVersion)) {
    throw new Error('Mutation target disappeared: exact direct dependency pin');
  }
  const exactPin = `"hono": "${honoVersion}"`;
  const hostile = original.replace(exactPin, `"hono": "^${honoVersion}"`);
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

hostileMutation(
  'src/ai/openai-chat-adapter.ts',
  'store: false,',
  'store: true,',
  ['src/ai/openai-chat-adapter.test.ts'],
  'provider conversation retention re-enabled',
);

hostileMutation(
  'src/ai/openai-chat-adapter.ts',
  'if (modelId === undefined) throw new ChatModelUnavailableError();',
  'if (modelId === undefined && false) throw new ChatModelUnavailableError();',
  ['src/ai/openai-chat-adapter.test.ts'],
  'unknown model no longer fails closed before a provider request',
);

hostileMutation(
  'src/ai/chat-http.ts',
  "if (callerSignal.aborted) return new ChatProviderFault('CANCELLED');",
  "if (callerSignal.aborted && false) return new ChatProviderFault('CANCELLED');",
  ['src/ai/chat-http.test.ts'],
  'caller cancellation misclassified as a provider outage',
);

hostileMutation(
  'src/ai/chat-http.ts',
  'while (read < maxBytes) {',
  'while (true) {',
  ['src/ai/chat-http.test.ts'],
  'provider error body read bound removed',
);

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

process.stdout.write(
  'Adversarial foundation gate passed: hostile concurrency, schema-boundary, dependency-pin, focused-test, workflow-permission, client-injection, provider-retention, provider-model, cancellation and error-bound mutations were rejected.\n',
);
