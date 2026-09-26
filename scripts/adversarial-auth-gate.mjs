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
  'if (response.status === 401 || response.status === 403) {',
  'if (false) {',
  () => runVitest('src/app/operations-api.test.ts'),
  'browser authorization-status classification bypass',
);

mutate(
  'src/app/operations-api.ts',
  'return schema.parse(body.value);',
  'return body.value;',
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

mutate(
  'src/app/App.tsx',
  "authorizedUserId === null ||\n        session.userId !== authorizedUserId ||\n        session.sessionId !== authorizedSessionId",
  'authorizedUserId === null',
  () => runVitest('src/app/live-auth-lifecycle.test.tsx'),
  'authenticated session-switch reauthorization bypass',
);


mutate(
  'src/app/authorization-policy.ts',
  'if (requestAccessToken !== currentAccessToken) {',
  'if (false) {',
  () => runVitest('src/app/authorization-policy.test.ts'),
  'stale-session authorization denial isolation bypass',
);

mutate(
  'src/app/read-view-model.ts',
  "meta: party ?? 'Job',",
  "meta: `${party ?? 'Job'} · 0 open Tasks`,",
  () => runVitest('src/app/read-view-model.test.ts'),
  'partial Search Job task-count fabrication',
);

mutate(
  'src/app/read-view-model.ts',
  "action.status === 'COMPLETED'\n              ? 'Completed'",
  "action.status === 'COMPLETED'\n              ? 'Upcoming'",
  () => runVitest('src/app/read-view-model.test.ts'),
  'Search Scheduled Action terminal-status corruption',
);

mutate(
  'src/app/App.tsx',
  "authorizedUserId === null ||\n        session.userId !== authorizedUserId ||\n        session.sessionId !== authorizedSessionId",
  "authorizedUserId !== null &&\n        session.userId !== authorizedUserId",
  () => runVitest('src/app/live-auth-lifecycle.test.tsx'),
  'signed-out cross-tab session authorization bypass',
);

mutate(
  'src/app/App.tsx',
  'requestId.current += 1;',
  'requestId.current += 0;',
  () => runNode('scripts/auth-boundary-gate.mjs'),
  'Search synchronous request invalidation removal',
);

mutate(
  'src/app/App.tsx',
  'runtime.api.dashboard(asOf)',
  'runtime.api.today(asOf)',
  () => runNode('scripts/auth-boundary-gate.mjs'),
  'single Dashboard endpoint bypass',
);

process.stdout.write(
  'Adversarial auth gate passed: server and browser fail-closed routing, actor provenance, owner allowlist, anonymous-session rejection, bearer integrity, stale-session denial isolation, Search truthfulness, strict read-model validation, and modern publishable-key controls resisted hostile mutations.\n',
);
