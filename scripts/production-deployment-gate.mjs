import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

/**
 * Production deployment gate.
 *
 * Certifies that the privileged Node API plane is deployable without a
 * proprietary hosting dependency:
 *
 * 1. the configuration contract fails closed and names variables, not values
 * 2. the built artifact carries no inlined environment and no credentials
 * 3. the browser plane carries no server-only identifier
 * 4. the real artifact boots, serves health/readiness, keeps every domain
 *    route behind bearer verification, honours trusted origins only, and
 *    drains to a clean exit on SIGTERM
 *
 * Startup is also proven free of schema migration: the runtime may not issue
 * DDL or read `src/db/migrations/`.
 */

const root = process.cwd();
const findings = [];
const read = (path) => readFileSync(join(root, path), 'utf8');
const fail = (message) => findings.push(message);

/**
 * Report a gate failure as a workflow annotation.
 *
 * CI logs are not always reachable from the environment that triaged the run,
 * so a failure also has to surface through the check-run annotation channel.
 * Findings never contain a secret value: the gate asserts that separately.
 */
function annotate(message) {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  const flattened = message.replace(/\r?\n/g, ' | ').slice(0, 900);
  process.stdout.write(`::error::production deployment gate: ${flattened}\n`);
}

/**
 * Render captured startup output for a finding.
 *
 * Gate-only placeholder credentials are stripped even though the gate asserts
 * separately that they never appear: a diagnostic must not become the leak.
 */
function describeOutput(text) {
  return text
    .replaceAll(GATE_PASSWORD, '[redacted]')
    .replaceAll(GATE_PUBLISHABLE_KEY, '[redacted]')
    .replace(/\r?\n/g, ' | ')
    .slice(0, 600);
}

function artifactBytes() {
  try {
    return statSync(join(root, SERVER_ARTIFACT)).size;
  } catch {
    return -1;
  }
}

const SERVER_ARTIFACT = 'dist-server/server.mjs';
const ENTRYPOINT = 'src/runtime/node/main.ts';

/** Values used by the behavioral checks; none of them is a real secret. */
const GATE_PASSWORD = 'gate-only-pooler-password';
const GATE_PUBLISHABLE_KEY = 'sb_publishable_gate_only';
const GATE_OWNER_ID = '50000000-0000-4000-8000-000000000001';
const GATE_ORIGIN = 'https://relay.example.com';

function walk(directory) {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];
  const output = [];
  for (const name of readdirSync(absolute)) {
    const path = join(absolute, name);
    if (statSync(path).isDirectory()) output.push(...walk(relative(root, path)));
    else output.push(relative(root, path));
  }
  return output;
}

const serverSources = walk('src/runtime/node').filter(
  (path) => path.endsWith('.ts') && !path.endsWith('.test.ts'),
);
const apiSources = walk('src/api').filter(
  (path) => path.endsWith('.ts') && !path.endsWith('.test.ts'),
);
const browserSources = [
  ...walk('src/app').filter(
    (path) => path.endsWith('.ts') || path.endsWith('.tsx'),
  ),
  'src/main.tsx',
].filter((path) => existsSync(join(root, path)));

/* ------------------------------------------------------------------ *
 * 1. Entrypoint and script contract
 * ------------------------------------------------------------------ */

const pkg = JSON.parse(read('package.json'));

if (!existsSync(join(root, ENTRYPOINT))) {
  fail(`production entrypoint is missing: ${ENTRYPOINT}`);
}
if (pkg.scripts?.['build:server'] !== 'vite build --config vite.server.config.mjs') {
  fail('package.json must expose build:server for the privileged API artifact');
}
if (pkg.scripts?.start !== `node ${SERVER_ARTIFACT}`) {
  fail('package.json start must run the built server artifact');
}
if (!existsSync(join(root, 'vite.server.config.mjs'))) {
  fail('vite.server.config.mjs must exist for the server build');
} else {
  const serverBuild = read('vite.server.config.mjs');
  for (const marker of [
    'envPrefix: []',
    "ssr: 'src/runtime/node/main.ts'",
    "outDir: 'dist-server'",
    "target: 'node24'",
  ]) {
    if (!serverBuild.includes(marker)) {
      fail(`server build lost required control: ${marker}`);
    }
  }
}
if (!read('.gitignore').includes('dist-server/')) {
  fail('dist-server/ must stay out of version control');
}
if (!read('eslint.config.js').includes('dist-server/**')) {
  fail('eslint must ignore the generated server artifact');
}

/* ------------------------------------------------------------------ *
 * 2. Configuration contract
 * ------------------------------------------------------------------ */

const serverConfig = read('src/runtime/node/server-config.ts');
const serverRuntime = read('src/runtime/node/server.ts');
const transport = read('src/runtime/node/http-adapter.ts');
const readiness = read('src/runtime/node/readiness.ts');
const authConfig = read('src/runtime/node/auth-config.ts');
const apiApp = read('src/api/app.ts');
const requestBody = read('src/api/request-body.ts');

for (const marker of [
  "'DATABASE_URL'",
  "'SUPABASE_URL'",
  "'SUPABASE_PUBLISHABLE_KEY'",
  "'ELARA_ALLOWED_USER_IDS'",
  "'ELARA_ALLOWED_ORIGINS'",
  "'ELARA_HOST'",
  "'PORT'",
  'is not a recognized Elara runtime variable',
  'must contain exact HTTPS origins in production',
  'export class ConfigurationError',
  'readProductionRuntimeConfig',
]) {
  if (!serverConfig.includes(marker)) {
    fail(`server configuration authority lost required control: ${marker}`);
  }
}

const DRAIN_MARKER = 'readiness.drain()';
const STOP_ACCEPTING_MARKER = 'server.close(() => resolve())';

for (const marker of [
  'readiness.databaseProbe()',
  'database readiness check failed at startup',
  DRAIN_MARKER,
  STOP_ACCEPTING_MARKER,
  'server.closeIdleConnections()',
  'server.closeAllConnections()',
  'runtime.close()',
  'shutdown complete',
]) {
  if (!serverRuntime.includes(marker)) {
    fail(`production server lost required lifecycle control: ${marker}`);
  }
}

// Readiness must flip before connections are drained, never after.
const drainAt = serverRuntime.indexOf(DRAIN_MARKER);
const stopAt = serverRuntime.indexOf(STOP_ACCEPTING_MARKER);
if (drainAt < 0 || stopAt < 0 || drainAt > stopAt) {
  fail('readiness must be drained before the HTTP socket stops accepting');
}

for (const marker of [
  "'cache-control', 'no-store'",
  "'x-content-type-options', 'nosniff'",
  'server.requestTimeout = options.requestTimeoutMs',
  'server.headersTimeout = options.requestTimeoutMs + HEADERS_TIMEOUT_MARGIN_MS',
  'server.keepAliveTimeout = options.keepAliveTimeoutMs',
  'server.maxHeadersCount = MAX_HEADERS_COUNT',
  "response.setHeader('connection', 'close')",
  'MAX_URL_LENGTH',
  'MAX_HOST_HEADER_LENGTH',
]) {
  if (!transport.includes(marker)) {
    fail(`node transport lost required control: ${marker}`);
  }
}

for (const marker of [
  "pool.query('select 1')",
  'pool.ending || pool.ended',
  "if (draining) throw new Error('instance draining');",
]) {
  if (!readiness.includes(marker)) {
    fail(`readiness boundary lost required control: ${marker}`);
  }
}

if (!authConfig.includes('url.hostname.includes(\'*\')')) {
  fail('trusted origins must reject wildcard hosts');
}

/* ------------------------------------------------------------------ *
 * 3. CORS and route authority
 * ------------------------------------------------------------------ */

for (const forbidden of [
  "origin: '*'",
  'credentials: true',
  "allowHeaders: ['*']",
  "allowMethods: ['*']",
]) {
  if (apiApp.includes(forbidden)) {
    fail(`API CORS boundary contains a wildcard/credentialed control: ${forbidden}`);
  }
}

for (const marker of [
  "app.get('/health/ready'",
  "app.get('/health'",
  'health.databaseProbe',
  'await verifier.verify(token)',
]) {
  if (!apiApp.includes(marker)) {
    fail(`API boundary lost required control: ${marker}`);
  }
}

}

for (const marker of [
  'MAX_REQUEST_BODY_BYTES',
  'readBoundedBodyText',
  'Request body is too large',
]) {
  if (!requestBody.includes(marker)) {
    fail(`request-body authority lost required control: ${marker}`);
  }
}

/* ------------------------------------------------------------------ *
 * 4. No schema migration as a startup side effect
 * ------------------------------------------------------------------ */

const ddlPattern =
  /\b(?:create|alter|drop)\s+(?:table|index|schema|role|trigger|function|policy)\b/i;
for (const path of [...serverSources, ...apiSources]) {
  const source = read(path);
  if (ddlPattern.test(source)) {
    fail(`${path} contains DDL; startup must never migrate schema`);
  }
  if (source.includes('db/migrations')) {
    fail(`${path} reads migration files; migrations are applied out of band`);
  }
}

/* ------------------------------------------------------------------ *
 * 5. Plane separation and server-only variables
 * ------------------------------------------------------------------ */

const serverOnlyVariables = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'ELARA_ALLOWED_USER_IDS',
  'ELARA_ALLOWED_ORIGINS',
  'ELARA_AUTH_REQUEST_TIMEOUT_MS',
  'ELARA_HOST',
  'ELARA_DB_POOL_MAX',
  'ELARA_DB_STATEMENT_TIMEOUT_MS',
  'ELARA_SHUTDOWN_TIMEOUT_MS',
  'ELARA_READINESS_TIMEOUT_MS',
  'ELARA_HINDSIGHT_API_KEY',
  'ELARA_OPENAI_API_KEY',
  'ELARA_MUSE_API_KEY',
  'ELARA_CHAT_REQUEST_TIMEOUT_MS',
];

/**
 * Whole-identifier match.
 *
 * `SUPABASE_URL` is a substring of the public `VITE_SUPABASE_URL`, so a plain
 * `includes` would report the browser plane for correctly using its own
 * public variable.
 */
function mentionsVariable(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`).test(source);
}

for (const path of browserSources) {
  const source = read(path);
  for (const name of serverOnlyVariables) {
    if (mentionsVariable(source, name)) {
      fail(`${path}: browser plane references server-only variable ${name}`);
    }
  }
  if (/from\s+'[^']*(?:runtime\/node|db\/postgres|node:)/.test(source)) {
    fail(`${path}: browser plane imports a server-only module`);
  }
  if (/from\s+'pg'/.test(source)) {
    fail(`${path}: browser plane imports the PostgreSQL driver`);
  }
}

for (const path of serverSources) {
  const source = read(path);
  if (/from\s+'[^']*\.\.\/(?:\.\.\/)?app\//.test(source)) {
    fail(`${path}: server plane imports browser application code`);
  }
  if (source.includes('import.meta.env')) {
    fail(`${path}: server code must read process.env, never inlined build env`);
  }
}

/* ------------------------------------------------------------------ *
 * 6. .env.example parity with the runtime registry
 * ------------------------------------------------------------------ */

const envExample = read('.env.example');
const documentedVariables = new Set(
  [...envExample.matchAll(/\b(ELARA_[A-Z0-9_]+)\b/g)].map((m) => m[1]),
);
const runtimeVariables = new Set();
for (const path of serverSources) {
  for (const match of read(path).matchAll(/'(ELARA_[A-Z0-9_]+)'/g)) {
    runtimeVariables.add(match[1]);
  }
}
for (const name of runtimeVariables) {
  if (!documentedVariables.has(name)) {
    fail(`.env.example does not document runtime variable ${name}`);
  }
}
for (const name of documentedVariables) {
  if (!runtimeVariables.has(name)) {
    fail(`.env.example documents ${name}, which no runtime authority reads`);
  }
}
for (const name of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'PORT']) {
  if (!envExample.includes(name)) {
    fail(`.env.example does not document ${name}`);
  }
}
if (/(?:postgres(?:ql)?|https?):\/\/[^/\s]+:[^/\s]+@(?!127\.0\.0\.1|localhost)/.test(envExample)) {
  fail('.env.example must contain local placeholders only');
}

/* ------------------------------------------------------------------ *
 * 7. Documentation contract
 * ------------------------------------------------------------------ */

const deploymentDocPath = 'docs/production-deployment.md';
if (!existsSync(join(root, deploymentDocPath))) {
  fail(`missing deployment documentation: ${deploymentDocPath}`);
} else {
  const doc = read(deploymentDocPath);
  for (const heading of [
    '## Required server variables',
    '## Public browser variables',
    '## Secret storage',
    '## Startup procedure',
    '## Health and readiness',
    '## Deployment assumptions',
    '## Rollback',
  ]) {
    if (!doc.includes(heading)) {
      fail(`production deployment doc lost required section: ${heading}`);
    }
  }
  for (const name of [
    ...serverOnlyVariables,
    'NODE_ENV',
    'PORT',
    'ELARA_SHUTDOWN_TIMEOUT_MS',
    'ELARA_READINESS_TIMEOUT_MS',
    'ELARA_HTTP_REQUEST_TIMEOUT_MS',
    'ELARA_HTTP_KEEP_ALIVE_TIMEOUT_MS',
    'VITE_ELARA_API_URL',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  ]) {
    if (!doc.includes(name)) {
      fail(`production deployment doc does not document ${name}`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 8. Artifact hygiene
 * ------------------------------------------------------------------ */

if (!existsSync(join(root, SERVER_ARTIFACT))) {
  fail(`server artifact is missing; run npm run build:server (${SERVER_ARTIFACT})`);
}
const browserAssets = existsSync(join(root, 'dist/assets'))
  ? readdirSync(join(root, 'dist/assets')).filter((name) => name.endsWith('.js'))
  : [];
if (browserAssets.length === 0) {
  fail('browser artifact is missing; run npm run build');
}

/* ------------------------------------------------------------------ *
 * Behavioral certification against the built artifact
 * ------------------------------------------------------------------ */

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => {
        if (address === null || typeof address !== 'object') {
          reject(new Error('no port allocated'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function bootArtifact(env) {
  const child = spawn(process.execPath, [SERVER_ARTIFACT], {
    cwd: root,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

  return {
    child,
    exited,
    output: () => `${stdout}${stderr}`,
    async waitForLog(pattern, timeoutMs = 15_000) {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        if (pattern.test(`${stdout}${stderr}`)) return true;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return false;
    },
    async stop(signal = 'SIGTERM') {
      child.kill(signal);
      return exited;
    },
  };
}

function gateEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: `postgresql://postgres:${GATE_PASSWORD}@127.0.0.1:5432/elara?sslmode=disable`,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: GATE_PUBLISHABLE_KEY,
    ELARA_ALLOWED_USER_IDS: GATE_OWNER_ID,
    ELARA_ALLOWED_ORIGINS: GATE_ORIGIN,
    ELARA_HOST: '127.0.0.1',
    PORT: '8791',
    ELARA_READINESS_TIMEOUT_MS: '1000',
    ELARA_SHUTDOWN_TIMEOUT_MS: '5000',
    ...overrides,
  };
}

async function expectRefusal(label, env, expectations) {
  const run = bootArtifact(env);
  try {
    const { code } = await Promise.race([
      run.exited,
      new Promise((resolve) => setTimeout(() => resolve({ code: null }), 20_000)),
    ]);
    const output = run.output();
    if (code !== 1) {
      fail(
        `${label}: expected exit code 1, received ${code} (saw: ${describeOutput(output)})`,
      );
    }
    for (const expected of expectations) {
      if (!output.includes(expected)) {
        fail(
          `${label}: startup output is missing "${expected}" (saw: ${describeOutput(output)})`,
        );
      }
    }
    for (const secret of [GATE_PASSWORD, GATE_PUBLISHABLE_KEY]) {
      if (output.includes(secret)) {
        fail(`${label}: startup output leaked a configured secret value`);
      }
    }
    if (output.includes('listening on')) {
      fail(`${label}: a refused startup must not open a socket`);
    }
  } finally {
    run.child.kill('SIGKILL');
  }
}

async function certifyLiveBoot(databaseUrl) {
  const port = await freePort();
  const run = bootArtifact(
    gateEnv({ DATABASE_URL: databaseUrl, PORT: String(port) }),
  );
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    if (!(await run.waitForLog(/listening on 127\.0\.0\.1:/))) {
      fail(
        `live boot: artifact never reported listening (saw: ${describeOutput(run.output())})`,
      );
      return;
    }

    const health = await fetch(`${baseUrl}/health`);
    if (health.status !== 200) {
      fail(`live boot: /health must answer 200, received ${health.status}`);
    }
    const healthBody = await health.json();
    if (healthBody.service !== 'elara-relay' || healthBody.status !== 'ok') {
      fail(`live boot: unexpected /health body ${JSON.stringify(healthBody)}`);
    }

    const ready = await fetch(`${baseUrl}/health/ready`);
    if (ready.status !== 200) {
      fail(`live boot: /health/ready must answer 200 against a reachable database, received ${ready.status}`);
    }
    const readyBody = await ready.json();
    if (
      readyBody.service !== 'elara-relay' ||
      readyBody.status !== 'ready' ||
      readyBody.checks?.database !== 'available' ||
      readyBody.checks?.authentication !== 'valid'
    ) {
      fail(`live boot: unexpected /health/ready body ${JSON.stringify(readyBody)}`);
    }

    const anonymous = await fetch(
      `${baseUrl}/today?asOf=2026-09-27T09:00:00.000Z`,
    );
    if (anonymous.status !== 401) {
      fail(`live boot: unauthenticated read must be 401, received ${anonymous.status}`);
    }
    if (anonymous.headers.get('www-authenticate') !== 'Bearer') {
      fail(
        `live boot: unauthenticated read must advertise Bearer, received ${String(
          anonymous.headers.get('www-authenticate'),
        )}`,
      );
    }

    const unknown = await fetch(`${baseUrl}/admin/service-role`);
    if (unknown.status !== 401) {
      fail(`live boot: unknown endpoint must stay behind auth (401), received ${unknown.status}`);
    }

    const allowedPreflight = await fetch(`${baseUrl}/work`, {
      method: 'OPTIONS',
      headers: {
        origin: GATE_ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });
    if (allowedPreflight.status !== 204) {
      fail(`live boot: trusted-origin preflight must be 204, received ${allowedPreflight.status}`);
    }
    if (allowedPreflight.headers.get('access-control-allow-origin') !== GATE_ORIGIN) {
      fail(
        `live boot: trusted origin did not receive CORS authorization, received ${String(
          allowedPreflight.headers.get('access-control-allow-origin'),
        )}`,
      );
    }

    const deniedPreflight = await fetch(`${baseUrl}/work`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://attacker.example',
        'access-control-request-method': 'GET',
      },
    });
    if (deniedPreflight.headers.get('access-control-allow-origin') !== null) {
      fail(
        `live boot: an untrusted origin received CORS authorization: ${String(
          deniedPreflight.headers.get('access-control-allow-origin'),
        )}`,
      );
    }

    const heavy = await fetch(`${baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(2_000_000) }),
    });
    if (heavy.status !== 401) {
      fail(`live boot: oversized unauthenticated write must be 401, received ${heavy.status}`);
    }
    if (heavy.headers.get('connection') !== 'close') {
      fail(
        `live boot: an unread request body must not be reusable, connection=${String(
          heavy.headers.get('connection'),
        )}`,
      );
    }

    const noStore = await fetch(`${baseUrl}/health`);
    if (noStore.headers.get('cache-control') !== 'no-store') {
      fail(
        `live boot: responses must not be cacheable by an intermediary, cache-control=${String(
          noStore.headers.get('cache-control'),
        )}`,
      );
    }

    const { code, signal } = await run.stop('SIGTERM');
    const output = run.output();
    if (code !== 0) {
      fail(
        `live boot: SIGTERM must exit 0 after draining, received code=${String(
          code,
        )} signal=${String(signal)} (saw: ${describeOutput(output)})`,
      );
    }
    for (const expected of [
      'shutdown started (SIGTERM)',
      'shutdown complete',
    ]) {
      if (!output.includes(expected)) {
        fail(
          `live boot: shutdown log is missing "${expected}" (saw: ${describeOutput(output)})`,
        );
      }
    }
    if (output.includes(GATE_PASSWORD) || output.includes(GATE_PUBLISHABLE_KEY)) {
      fail('live boot: lifecycle log leaked a configured secret value');
    }
  } catch (error) {
    // A dead artifact surfaces as a failed fetch; the artifact's own log is
    // the only evidence of why, so it belongs in the finding.
    const detail =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    fail(
      `live boot: check aborted by ${detail} (artifact output: ${describeOutput(
        run.output(),
      )})`,
    );
  } finally {
    run.child.kill('SIGKILL');
  }
}

async function certifyArtifacts() {
  if (!existsSync(join(root, SERVER_ARTIFACT))) return;

  const artifact = read(SERVER_ARTIFACT);
  if (artifact.includes('import.meta.env')) {
    fail('server artifact inlined build-time environment values');
  }
  if (/VITE_[A-Z0-9_]+/.test(artifact)) {
    fail('server artifact references browser-only VITE_ configuration');
  }
  if (/(?:postgres(?:ql)?|mysql|https?):\/\/[^/\s"'`]+:[^/\s"'`]+@/.test(artifact)) {
    fail('server artifact embeds a credentialed connection string');
  }
  if (!artifact.includes('process.env')) {
    fail('server artifact must read configuration from the process environment');
  }

  for (const name of browserAssets) {
    const bundle = readFileSync(join(root, 'dist/assets', name), 'utf8');
    for (const secret of serverOnlyVariables) {
      if (mentionsVariable(bundle, secret)) {
        fail(`browser bundle ${name} contains server-only identifier ${secret}`);
      }
    }
    if (bundle.includes('ELARA_ALLOWED_ORIGINS') || bundle.includes('statement_timeout')) {
      fail(`browser bundle ${name} contains server runtime configuration`);
    }
  }
}

async function main() {
  await certifyArtifacts();

  await expectRefusal(
    'empty environment',
    { PATH: process.env.PATH ?? '/usr/bin:/bin' },
    [
      'configuration rejected (profile production',
      'DATABASE_URL',
      'SUPABASE_URL',
      'SUPABASE_PUBLISHABLE_KEY',
      'ELARA_ALLOWED_USER_IDS',
      'ELARA_ALLOWED_ORIGINS',
      'ELARA_HOST',
      'PORT',
      'startup aborted (configuration)',
    ],
  );

  await expectRefusal(
    'unreachable database',
    gateEnv({ PORT: String(await freePort()) }),
    ['database readiness check failed at startup', 'startup aborted (database)'],
  );

  await expectRefusal(
    'unrecognized ELARA variable',
    gateEnv({ ELARA_ALLOW_ORIGINS: GATE_ORIGIN, PORT: String(await freePort()) }),
    ['ELARA_ALLOW_ORIGINS', 'is not a recognized Elara runtime variable'],
  );

  await expectRefusal(
    'insecure production origin',
    gateEnv({
      ELARA_ALLOWED_ORIGINS: 'http://127.0.0.1:4173',
      PORT: String(await freePort()),
    }),
    ['must contain exact HTTPS origins in production'],
  );

  await expectRefusal(
    'remote database without TLS',
    gateEnv({
      DATABASE_URL:
        `postgresql://postgres:${GATE_PASSWORD}@db.example.com:5432/elara?sslmode=disable`,
      PORT: String(await freePort()),
    }),
    ['DATABASE_URL', 'must require TLS'],
  );

  const databaseUrl = process.env.GATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (databaseUrl !== undefined && databaseUrl !== '') {
    await certifyLiveBoot(databaseUrl);
  } else if (process.env.GATE_REQUIRE_DATABASE === '1') {
    fail('GATE_REQUIRE_DATABASE=1 but no DATABASE_URL was supplied for the live boot check');
  } else {
    process.stdout.write(
      'Production deployment gate: live boot check skipped (no reachable DATABASE_URL supplied).\n',
    );
  }

  if (findings.length > 0) {
    annotate(
      `environment node=${process.version} artifactBytes=${artifactBytes()} findings=${findings.length}`,
    );
    for (const finding of findings) annotate(finding);
    process.stderr.write(
      `Production deployment gate failed (${findings.length}):\n${findings
        .map((finding) => `- ${finding}`)
        .join('\n')}\n`,
    );
    process.exit(1);
  }

  process.stdout.write(
    'Production deployment gate passed: fail-closed configuration contract, two-plane secret separation, migration-free startup, artifact hygiene, and a real boot/drain lifecycle were certified.\n',
  );
}

try {
  await main();
} catch (error) {
  const detail =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  annotate(`crashed before completing: ${detail}`);
  process.stderr.write(
    `Production deployment gate crashed: ${detail}\n${
      error instanceof Error && error.stack !== undefined ? error.stack : ''
    }\n`,
  );
  process.exit(1);
}
