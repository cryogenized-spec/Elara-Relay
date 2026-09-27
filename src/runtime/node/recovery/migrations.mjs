// Migration loader for recovery flows.
//
// The reviewed SQL files under src/db/migrations/ remain the only schema
// authority. Recovery never generates DDL: it replays exactly those files,
// in lexicographic (numeric prefix) order, and records their digests in the
// backup manifest so a restored target can be tied to a known migration set.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

export class RecoveryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RecoveryError';
  }
}

// Deterministic default migration directory: the repository checkout itself.
export function defaultMigrationsDir() {
  return join(process.cwd(), 'src', 'db', 'migrations');
}

// Lists migration files in strict lexicographic order and validates the
// naming contract so a misnumbered or stray file fails recovery loudly
// instead of restoring a schema the application does not expect.
export function listMigrationFiles(dir, { fs = { readdirSync } } = {}) {
  const names = fs.readdirSync(dir);
  const migrationNames = names.filter((name) =>
    MIGRATION_FILE_PATTERN.test(name),
  ).sort();

  const rejected = names.filter(
    (name) => !MIGRATION_FILE_PATTERN.test(name) && name.endsWith('.sql'),
  );
  if (rejected.length > 0) {
    throw new RecoveryError(
      `migration file naming contract violated: ${rejected.sort().join(', ')}`,
    );
  }

  if (migrationNames.length === 0) {
    throw new RecoveryError(`no migration files found in ${dir}`);
  }

  for (const [index, name] of migrationNames.entries()) {
    const prefix = Number.parseInt(name.slice(0, 4), 10);
    if (prefix !== index + 1) {
      throw new RecoveryError(
        `migration order broken: expected prefix ${String(index + 1).padStart(4, '0')} at position ${index}, found ${name}`,
      );
    }
  }

  return migrationNames;
}

export function loadMigrations(dir) {
  const files = listMigrationFiles(dir);
  return files.map((file) => {
    const sql = readFileSync(join(dir, file), 'utf8');
    return {
      file,
      sha256: createHash('sha256').update(sql).digest('hex'),
      sql,
    };
  });
}
