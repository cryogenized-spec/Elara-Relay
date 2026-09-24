import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const findings = [];

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

for (const file of [...walk('src'), ...walk('e2e'), ...walk('integration')]) {
  if (!/\.(?:ts|tsx)$/.test(file)) continue;
  const rel = relative(root, file);
  const source = readFileSync(file, 'utf8');

  if (/\b(?:test|it|describe)\.only\s*\(/.test(source)) {
    findings.push(`${rel}: focused test is forbidden`);
  }
  if (/\b(?:test|it|describe)\.skip\s*\(/.test(source)) {
    findings.push(`${rel}: skipped test is forbidden without an explicit reviewed mechanism`);
  }
}

const vitest = readFileSync(join(root, 'vitest.config.mjs'), 'utf8');
if (!vitest.includes('passWithNoTests: false')) {
  findings.push('Vitest must fail when no tests are discovered');
}
if (/\bpassWithNoTests\s*:\s*true\b/.test(vitest)) {
  findings.push('Vitest may not allow an empty suite');
}

const playwright = readFileSync(join(root, 'playwright.config.ts'), 'utf8');
if (!playwright.includes('forbidOnly: true')) {
  findings.push('Playwright must reject focused tests');
}

if (findings.length > 0) {
  process.stderr.write(
    `Test-quality gate failed (${findings.length}):\n${findings
      .map((finding) => `- ${finding}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  'Test-quality gate passed: no focused/skipped tests, no empty-suite bypass, and Playwright focused-test rejection is intact.\n',
);
