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

const executablePatterns = [
  ['dynamic eval', /\beval\s*\(/],
  ['dynamic Function constructor', /\bnew\s+Function\s*\(/],
  ['direct HTML injection', /\bdangerouslySetInnerHTML\b/],
  ['DOM innerHTML assignment', /\.innerHTML\s*=/],
  ['document.write', /\bdocument\.write\s*\(/],
];

for (const file of walk('src')) {
  if (!/\.(?:ts|tsx)$/.test(file)) continue;
  const rel = relative(root, file);
  const source = readFileSync(file, 'utf8');
  for (const [label, pattern] of executablePatterns) {
    if (pattern.test(source)) findings.push(`${rel}: forbidden ${label}`);
  }
}

const clientFiles = [
  ...walk('src/app'),
  join(root, 'src/main.tsx'),
].filter((path) => existsSync(path));

const forbiddenClientSecrets = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_JWT_SECRET',
  'ELARA_ALLOWED_USER_IDS',
  'OPENAI_API_KEY',
  'META_API_KEY',
  'XAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'DATABASE_URL',
];

for (const file of clientFiles) {
  if (!/\.(?:ts|tsx)$/.test(file)) continue;
  const rel = relative(root, file);
  const source = readFileSync(file, 'utf8');
  for (const secretName of forbiddenClientSecrets) {
    if (source.includes(secretName)) {
      findings.push(`${rel}: client bundle references server secret identifier ${secretName}`);
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(
    `Security architecture gate failed (${findings.length}):\n${findings
      .map((finding) => `- ${finding}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  'Security architecture gate passed: no dynamic code execution, direct HTML injection, or server-secret identifiers are present in the client boundary.\n',
);
