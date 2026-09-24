import {
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const findings = [];
const ignoredRoots = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
]);

const detectors = [
  ['OpenAI API key', /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{20,}/g],
  ['AWS access key', /AKIA[0-9A-Z]{16}/g],
  ['private key material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['Supabase service role assignment', /SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^\s$][^\s]*/g],
];

function walk(directory) {
  const output = [];
  for (const name of readdirSync(directory)) {
    if (ignoredRoots.has(name)) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) output.push(...walk(path));
    else output.push(path);
  }
  return output;
}

for (const file of walk(root)) {
  const rel = relative(root, file);
  if (/^\.env(?:\.|$)/.test(rel) && rel !== '.env.example') {
    findings.push(`${rel}: tracked environment file is forbidden`);
    continue;
  }
  if (/\.(?:png|jpe?g|gif|webp|ico|woff2?|pdf)$/i.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  for (const [label, pattern] of detectors) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) findings.push(`${rel}: possible ${label}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(
    `Secret scan failed (${findings.length}):\n${findings
      .map((finding) => `- ${finding}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}

process.stdout.write('Secret scan passed.\n');
