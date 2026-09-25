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


mutate(
  'src/app/operations-api.ts',
  "if (token === null || token === '') {",
  'if (false) {',
  () => runVitest('src/app/operations-api.test.ts'),
  'browser bearer fail-closed bypass',
);

mutate(
  'src/app/operations-api.ts',
  'authorization: `Bearer ${token}`',
  'authorization: token',
  () => runVitest('src/app/operations-api.test.ts'),
  'browser bearer scheme corruption',
);

mutate(
  'src/app/operations-api.ts',
  'return schema.parse(raw);',
  'return raw;',
  () => runVitest('src/app/operations-api.test.ts'),
  'browser read-model validation bypass',
);

mutate(
  'src/app/runtime-config.ts',
  "if (!parsed.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {",
  'if (false) {',
  () => runVitest('src/app/runtime-config.test.ts'),
  'browser legacy publishable-key acceptance bypass',
);


mutate(
  'src/contracts/read-model.ts',
  'if (!jobIds.has(repair.jobId)) {',
  'if (false) {',
  () => runVitest('src/contracts/read-model.test.ts'),
  'Repair-to-Job aggregate integrity bypass',
);

mutate(
  'src/contracts/read-model.ts',
  "action.status !== 'ACTIVE' ||\n        action.nextRunAt === null ||\n        Date.parse(action.nextRunAt) <= asOf",
  "false",
  () => runVitest('src/contracts/read-model.test.ts'),
  'upcoming scheduler bucket semantic bypass',
);

process.stdout.write(
  'Adversarial auth gate passed: server and browser fail-closed routing, actor provenance, owner allowlist, anonymous-session rejection, bearer integrity, strict read-model validation, and modern publishable-key controls resisted hostile mutations.\n',
);
