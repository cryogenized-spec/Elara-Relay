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
      throw new Error(`Adversarial auth mutation survived: ${label}`);
    }
  } finally {
    writeFileSync(absolute, original);
  }
}

mutate(
  'src/api/app.ts',
  'if (authVerifier === undefined) {',
  'if (false) {',
  () => runVitest('src/api/app.test.ts'),
  'fail-closed AuthVerifier requirement removal',
);

mutate(
  'src/api/app.ts',
  "actor: 'operator-ui' as const",
  "actor: 'system' as const",
  () => runVitest('src/api/app.test.ts'),
  'server-owned actor provenance corruption',
);

mutate(
  'src/auth/supabase-auth-verifier.ts',
  'if (!this.config.allowedUserIds.has(claims.sub)) {',
  'if (false) {',
  () => runVitest('src/auth/supabase-auth-verifier.test.ts'),
  'owner allowlist bypass',
);

mutate(
  'src/auth/supabase-auth-verifier.ts',
  'claims.is_anonymous',
  'false',
  () => runVitest('src/auth/supabase-auth-verifier.test.ts'),
  'anonymous-session rejection bypass',
);

mutate(
  'src/runtime/node/auth-config.ts',
  "if (!publishableKey.startsWith('sb_publishable_')) {",
  'if (false) {',
  () => runVitest('src/runtime/node/auth-config.test.ts'),
  'legacy API key acceptance bypass',
);

process.stdout.write(
  'Adversarial auth gate passed: fail-closed routing, actor provenance, owner allowlist, anonymous-session rejection, and modern publishable-key controls resisted hostile mutations.\n',
);
