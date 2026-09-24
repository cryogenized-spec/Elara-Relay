import { readFileSync } from 'node:fs';
import process from 'node:process';

const read = (path) => readFileSync(path, 'utf8');
const errors = [];
const fail = (message) => errors.push(message);

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const baseline = JSON.parse(read('scripts/supply-chain-baseline.json'));
const npmrc = read('.npmrc');
const ci = read('.github/workflows/ci.yml');

if (baseline.node !== '24.21.0') fail('reviewed Node baseline changed');
if (baseline.npm !== '11.19.0') fail('reviewed npm baseline changed');
if (lock.lockfileVersion !== baseline.lockfileVersion) {
  fail(`package-lock lockfileVersion must remain ${baseline.lockfileVersion}`);
}
if (pkg.packageManager !== `npm@${baseline.npm}`) {
  fail('packageManager drifted from reviewed npm version');
}
if (pkg.engines?.node !== '24.x' || pkg.engines?.npm !== baseline.npm) {
  fail('package engines drifted from reviewed Node/npm policy');
}

for (const marker of [
  'ignore-scripts=true',
  'save-exact=true',
  'engine-strict=true',
  'strict-ssl=true',
]) {
  if (!npmrc.includes(marker)) fail(`.npmrc lost supply-chain control: ${marker}`);
}

for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
  if (Object.hasOwn(pkg.scripts ?? {}, lifecycle)) {
    fail(`root lifecycle script is forbidden without explicit review: ${lifecycle}`);
  }
}

const direct = {
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
};
for (const [name, spec] of Object.entries(direct)) {
  if (typeof spec !== 'string') {
    fail(`dependency ${name} has a non-string version specifier`);
    continue;
  }
  const exactSemver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
  const exactAlias = /^npm:[^@\s]+@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
  if (!exactSemver.test(spec) && !exactAlias.test(spec)) {
    fail(`direct dependency ${name} is not exactly pinned: ${spec}`);
  }
  if (/^(?:git|https?|file|link|workspace):/i.test(spec)) {
    fail(`direct dependency ${name} uses a forbidden non-registry source: ${spec}`);
  }
}

const rootLock = lock.packages?.[''];
if (!rootLock) {
  fail('package-lock is missing the root package record');
} else {
  const compareGroup = (label, expected, actual) => {
    const normalize = (value) =>
      Object.fromEntries(
        Object.entries(value ?? {}).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
    const left = JSON.stringify(normalize(expected));
    const right = JSON.stringify(normalize(actual));
    if (left !== right) fail(`package-lock root ${label} does not match package.json`);
  };
  compareGroup('dependencies', pkg.dependencies, rootLock.dependencies);
  compareGroup('devDependencies', pkg.devDependencies, rootLock.devDependencies);
}

for (const [path, record] of Object.entries(lock.packages ?? {})) {
  if (path === '' || !record || typeof record !== 'object') continue;
  const resolved = record.resolved;
  if (typeof resolved === 'string' && !resolved.startsWith(baseline.registry)) {
    fail(`${path} resolved from unreviewed source: ${resolved}`);
  }
  if (typeof resolved === 'string' && resolved.startsWith(baseline.registry)) {
    if (typeof record.integrity !== 'string' || !/^sha(?:256|384|512)-/.test(record.integrity)) {
      fail(`${path} is a registry package without a cryptographic integrity digest`);
    }
  }
}

const actionUses = [...ci.matchAll(/\buses:\s*([^\s#]+)/g)].map((match) => match[1]);
for (const action of actionUses) {
  if (!baseline.githubActions.includes(action)) {
    fail(`GitHub Action is not in the reviewed allowlist: ${action}`);
  }
}
for (const action of baseline.githubActions) {
  if (!actionUses.includes(action)) fail(`reviewed GitHub Action disappeared: ${action}`);
}
if (/uses:\s*[^\n]+@(?![0-9a-f]{40}\b)/i.test(ci)) {
  fail('GitHub Actions must be pinned to immutable 40-character commit SHAs');
}
if (!ci.includes('permissions: {}')) fail('workflow-wide token permissions must default to none');
if (ci.includes('persist-credentials: true')) fail('checkout credentials may not persist');
for (const forbiddenPermission of [
  'contents: write',
  'pull-requests: write',
  'actions: write',
  'issues: write',
  'id-token: write',
]) {
  if (ci.includes(forbiddenPermission)) {
    fail(`certification workflow may not grant ${forbiddenPermission}`);
  }
}
if (!ci.includes('npm ci --ignore-scripts --no-audit --no-fund')) {
  fail('CI must install the exact lockfile with lifecycle scripts disabled');
}

if (errors.length > 0) {
  process.stderr.write(
    `Supply-chain gate failed (${errors.length}):\n${errors
      .map((error) => `- ${error}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `Supply-chain gate passed: ${Object.keys(direct).length} exact direct dependencies, lockfile v${lock.lockfileVersion}, registry provenance/integrity, disabled lifecycle scripts, and immutable reviewed GitHub Actions verified.\n`,
);
