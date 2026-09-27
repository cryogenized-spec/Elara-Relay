import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import process from 'node:process';

const root = process.cwd();
const entrypoint = 'supabase/functions/elara-api/index.ts';
const importMap = 'supabase/functions/elara-api/deno.json';
const outputRoot = join(root, 'dist-edge-source');

function posix(path) {
  return path.split(sep).join('/');
}

function assertInsideRoot(path) {
  const absolute = resolve(root, path);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
    throw new Error(`Edge package import escapes repository root: ${path}`);
  }
  return absolute;
}

function resolveLocalImport(fromPath, specifier) {
  const base = join(dirname(fromPath), specifier);
  const candidates =
    extname(base) === ''
      ? [
          `${base}.ts`,
          `${base}.tsx`,
          `${base}.js`,
          `${base}.mjs`,
          `${base}.json`,
          join(base, 'index.ts'),
        ]
      : [base];

  for (const candidate of candidates) {
    const absolute = assertInsideRoot(candidate);
    if (existsSync(absolute)) {
      return posix(relative(root, absolute));
    }
  }

  throw new Error(
    `Cannot resolve Edge package import "${specifier}" from ${fromPath}`,
  );
}

function relativeSpecifier(fromPath, targetPath) {
  let specifier = posix(relative(dirname(fromPath), targetPath));
  if (!specifier.startsWith('.')) {
    specifier = `./${specifier}`;
  }
  return specifier;
}

function rewriteImports(path, source, dependencies) {
  const patterns = [
    /(\bfrom\s*['"])(\.[^'"]+)(['"])/g,
    /(\bimport\s*['"])(\.[^'"]+)(['"])/g,
    /(\bimport\(\s*['"])(\.[^'"]+)(['"]\s*\))/g,
  ];

  let output = source;

  for (const pattern of patterns) {
    output = output.replace(
      pattern,
      (match, prefix, specifier, suffix) => {
        const resolved = resolveLocalImport(path, specifier);
        dependencies.add(resolved);
        return `${prefix}${relativeSpecifier(path, resolved)}${suffix}`;
      },
    );
  }

  return output;
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

rmSync(outputRoot, { recursive: true, force: true });

const queue = [entrypoint];
const visited = new Set();
const packaged = [];

while (queue.length > 0) {
  const path = queue.shift();

  if (visited.has(path)) {
    continue;
  }

  visited.add(path);

  const source = readFileSync(assertInsideRoot(path), 'utf8');
  const dependencies = new Set();
  const transformed = rewriteImports(path, source, dependencies);

  const destination = join(outputRoot, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, transformed);

  packaged.push({
    path,
    sha256: sha256(transformed),
  });

  for (const dependency of dependencies) {
    if (!visited.has(dependency)) {
      queue.push(dependency);
    }
  }
}

const denoJson = readFileSync(assertInsideRoot(importMap), 'utf8');
const denoDestination = join(outputRoot, importMap);
mkdirSync(dirname(denoDestination), { recursive: true });
writeFileSync(denoDestination, denoJson);

packaged.push({
  path: importMap,
  sha256: sha256(denoJson),
});

packaged.sort((left, right) => left.path.localeCompare(right.path));

writeFileSync(
  join(outputRoot, 'manifest.json'),
  `${JSON.stringify(
    {
      entrypoint,
      importMap,
      files: packaged,
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(
  `Supabase Edge deployment package built with ${packaged.length} source files.\n`,
);
