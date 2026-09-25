import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const read = (path) => readFileSync(join(root, path), 'utf8');
const fail = (message) => errors.push(message);

if (read('.nvmrc').trim() !== '24.21.0') {
  fail('.nvmrc must remain pinned to Node 24.21.0');
}

const pkg = JSON.parse(read('package.json'));
const expectedScripts = {
  lint: 'eslint . --max-warnings 0',
  'typecheck:ts6':
    'tsc6 -p tsconfig.json --noEmit && tsc6 -p tsconfig.e2e.json --noEmit && tsc6 -p tsconfig.integration.json --noEmit',
  'typecheck:ts7':
    'node node_modules/@typescript/native/bin/tsc -p tsconfig.json --noEmit && node node_modules/@typescript/native/bin/tsc -p tsconfig.e2e.json --noEmit && node node_modules/@typescript/native/bin/tsc -p tsconfig.integration.json --noEmit',
  test: 'vitest run',
  'test:coverage': 'vitest run --coverage',
  e2e: 'playwright test',
  'verify:gates': 'node scripts/check-verification-integrity.mjs',
  'secrets:check': 'node scripts/secret-scan.mjs',
  'security:check': 'node scripts/security-architecture-gate.mjs',
  'supply-chain:check': 'node scripts/supply-chain-gate.mjs',
  'test:quality': 'node scripts/test-quality-gate.mjs',
  'adversarial:check': 'node scripts/adversarial-foundation-gate.mjs',
  'adversarial:domain': 'node scripts/adversarial-domain-gate.mjs',
  'schema:check': 'node scripts/migration-contract-gate.mjs',
  'auth:check': 'node scripts/auth-boundary-gate.mjs',
  'docs:check': 'node scripts/documentation-contract-gate.mjs',
  'adversarial:auth': 'node scripts/adversarial-auth-gate.mjs',
  'test:postgres': 'vitest run --config vitest.postgres.config.mjs',
};

for (const [name, expected] of Object.entries(expectedScripts)) {
  if (pkg.scripts?.[name] !== expected) {
    fail(`npm script ${name} changed from the reviewed command`);
  }
}

if (pkg.packageManager !== 'npm@11.19.0') {
  fail('packageManager must remain npm@11.19.0');
}
if (pkg.devDependencies?.['@typescript/typescript6'] !== '6.0.2') {
  fail('TypeScript 6 gate must remain pinned to 6.0.2');
}
if (pkg.devDependencies?.['@typescript/native'] !== 'npm:typescript@7.0.2') {
  fail('TypeScript 7 native gate must remain pinned to 7.0.2');
}
if (pkg.devDependencies?.['@playwright/test'] !== '1.63.0') {
  fail('Playwright must remain pinned to 1.63.0 until explicitly reviewed');
}

const tsconfig = JSON.parse(read('tsconfig.json'));
const hardFlags = {
  strict: true,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  noImplicitOverride: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  useUnknownInCatchVariables: true,
  noPropertyAccessFromIndexSignature: true,
  allowUnreachableCode: false,
  allowUnusedLabels: false,
  verbatimModuleSyntax: true,
  isolatedModules: true,
  skipLibCheck: false,
};
for (const [flag, value] of Object.entries(hardFlags)) {
  if (tsconfig.compilerOptions?.[flag] !== value) {
    fail(`TypeScript hard flag changed: ${flag}`);
  }
}

const vitest = read('vitest.config.mjs');
for (const marker of [
  "environment: 'jsdom'",
  "'src/{api,auth,contracts,domain,db,scheduler}/**/*.ts'",
  "'src/runtime/node/auth-config.ts'",
  "exclude: ['src/**/*.test.ts']",
  'lines: 80',
  'statements: 80',
  'functions: 80',
  'branches: 75',
  'passWithNoTests: false',
]) {
  if (!vitest.includes(marker)) {
    fail(`Vitest coverage authority changed: ${marker}`);
  }
}

const npmPolicy = read('.npmrc');
for (const marker of [
  'ignore-scripts=true',
  'save-exact=true',
  'engine-strict=true',
  'strict-ssl=true',
]) {
  if (!npmPolicy.includes(marker)) {
    fail(`.npmrc lost required policy: ${marker}`);
  }
}

const supplyChain = read('scripts/supply-chain-gate.mjs');
for (const marker of [
  'lockfileVersion',
  'reviewed GitHub Action disappeared',
  'cryptographic integrity digest',
  'root lifecycle script is forbidden',
  'exact direct dependencies',
]) {
  if (!supplyChain.includes(marker)) {
    fail(`supply-chain gate lost required proof: ${marker}`);
  }
}

const playwright = read('playwright.config.ts');
for (const marker of [
  "name: 'chromium'",
  "name: 'mobile-9x16'",
  'viewport: { width: 405, height: 720 }',
  "name: 'android-portrait'",
  'viewport: { width: 412, height: 915 }',
  'reuseExistingServer: false',
  'forbidOnly: true',
]) {
  if (!playwright.includes(marker)) {
    fail(`Playwright foundation control missing: ${marker}`);
  }
}

const skillText = read('skills/SKILL.md');
const mirror = read('skills/PR_Review.md');
if (skillText !== mirror) {
  fail('skills/PR_Review.md must remain an exact mirror of skills/SKILL.md');
}

if (existsSync(join(root, '.github/workflows/bootstrap-lockfile.yml'))) {
  fail('temporary bootstrap-lockfile workflow must be removed before certification');
}

const ci = read('.github/workflows/ci.yml');
for (const forbidden of [
  'continue-on-error',
  'if: always()',
  '|| true',
  'set +e',
  'persist-credentials: true',
]) {
  if (ci.includes(forbidden)) {
    fail(`CI contains forbidden bypass marker: ${forbidden}`);
  }
}
for (const required of [
  'permissions: {}',
  'persist-credentials: false',
  'ref: ${{ github.event.pull_request.head.sha || github.sha }}',
  'test "$(npm --version)" = "11.19.0"',
  'npm ci --ignore-scripts --no-audit --no-fund',
  'npm run verify:gates',
  'npm run secrets:check',
  'npm run security:check',
  'npm run auth:check',
  'npm run docs:check',
  'npm audit signatures',
  'npm audit --audit-level=high',
  'npm run supply-chain:check',
  'npm run test:quality',
  'npm run lint',
  'npm run typecheck:ts6',
  'npm run typecheck:ts7',
  'npm run test:coverage',
  'npm run adversarial:check',
  'npm run adversarial:domain',
  'npm run adversarial:auth',
  'npm run schema:check',
  'image: postgres:17.6-alpine',
  'npm run test:postgres',
  'npm run build',
  'npm run e2e -- --project=chromium --project=mobile-9x16 --project=android-portrait',
]) {
  if (!ci.includes(required)) {
    fail(`CI lost required control: ${required}`);
  }
}

function walk(directory) {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];
  const output = [];
  for (const name of readdirSync(absolute)) {
    const path = join(absolute, name);
    if (statSync(path).isDirectory()) output.push(...walk(relative(root, path)));
    else output.push(path);
  }
  return output;
}

const reasonedDisable =
  /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?\s+[^\n]+\s--\s\S/;
for (const file of [...walk('src'), ...walk('e2e'), ...walk('scripts')]) {
  if (!/\.(?:ts|tsx|js|mjs|cjs)$/.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  const path = relative(root, file);
  if (/@ts-(?:ignore|nocheck)\b/.test(source)) {
    fail(`${path} contains a forbidden TypeScript suppression`);
  }
  for (const line of source.split(/\r?\n/)) {
    if (/(?:\/\/|\/\*)\s*eslint-disable/.test(line) && !reasonedDisable.test(line)) {
      fail(`${path} contains an eslint-disable without an inline reason`);
      break;
    }
  }
}

if (errors.length > 0) {
  process.stderr.write(
    `Verification integrity failed (${errors.length}):\n${errors
      .map((error) => `- ${error}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  'Verification integrity passed: Node/npm pins, TS6+TS7 gates, strict compiler flags, Playwright desktop/mobile proof, CI anti-bypass controls, documentation authority, skill mirror, and suppression policy are intact.\n',
);
