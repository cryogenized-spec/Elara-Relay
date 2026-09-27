// Backup orchestration.
//
// Produces the canonical Elara recovery artifact:
//   <name>.dump  — pg_dump custom-format archive (schema + data)
//   <name>.manifest.json — structural verification metadata
//
// The backup refuses to run against a schema that does not match the
// recovery contract, and refuses to produce an artifact whose table of
// contents is missing any authoritative domain. A successful backup is only
// reported when both the archive and the manifest exist and agree.

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describeDatabaseLabel, withRecoveryPool } from './db.mjs';
import {
  MANIFEST_FORMAT_VERSION,
  MANIFEST_KIND,
  parseManifest,
  serializeManifest,
} from './manifest.mjs';
import {
  loadMigrations,
  RecoveryError,
} from './migrations.mjs';
import {
  getPgToolVersion,
  resolvePgTool,
  runPgTool,
} from './pg-tools.mjs';
import { collectSchemaFacts, collectTableDigests } from './schema-facts.mjs';
import { verifySchemaFacts } from './verify.mjs';

function timestampSlug(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

// Parse `pg_restore -l` table-of-contents output and extract TABLE data
// entries (the lowercase `data` marker is what pg_dump emits). A missing
// domain in the TOC means the dump would silently restore without that
// domain's rows.
export function parseTocTableDataEntries(tocText) {
  const entries = [];
  for (const line of tocText.split(/\r?\n/)) {
    const segments = line.split(';');
    if (segments.length < 2) continue;
    const tail = segments[1];
    if (tail === undefined) continue;
    const fields = tail.trim().split(/\s+/);
    // fields: <table-oid> <table-oid> TABLE data <table> <schema> <owner>
    if (fields[2] !== 'TABLE' || fields[3] !== 'data') continue;
    const table = fields[4];
    if (typeof table === 'string' && table !== '') {
      entries.push(table);
    }
  }
  return entries;
}

export async function createBackup(options) {
  const {
    databaseUrl,
    outputDir,
    migrationsDir,
    probes = {},
    slug,
    now = new Date(),
    env = process.env,
  } = options;

  const pgDump = resolvePgTool('pg_dump', env);
  const pgRestore = resolvePgTool('pg_restore', env);
  const pgDumpVersion = await getPgToolVersion(pgDump);

  const migrations = loadMigrations(migrationsDir);

  // 1. Refuse to back up a database whose live schema does not match the
  //    recovery contract (missing domain, drift, or unrevoked browser role).
  const sourceFacts = await withRecoveryPool(databaseUrl, async (pool) => {
    const client = await pool.connect();
    try {
      const facts = await collectSchemaFacts(client);
      const checks = verifySchemaFacts(facts);
      const failures = checks.filter((entry) => !entry.passed);
      if (failures.length > 0) {
        throw new RecoveryError(
          `source database does not satisfy the recovery contract: ${failures
            .map((failure) => failure.name)
            .join('; ')}`,
        );
      }
      return await collectTableDigests(client);
    } finally {
      client.release();
    }
  });

  // 2. Produce the dump archive (custom format; the canonical mechanism).
  await mkdir(outputDir, { recursive: true });
  const base = `elara-backup-${slug ?? timestampSlug(now)}`;
  const dumpPath = join(outputDir, `${base}.dump`);

  const dumpResult = await runPgTool(pgDump, [
    '--no-password',
    '--format=custom',
    '--file=' + dumpPath,
    '--dbname=' + databaseUrl,
  ], [databaseUrl]);
  void dumpResult;

  // 3. Validate the archive table of contents: every authoritative table
  //    must be present as TABLE DATA, otherwise restoration would silently
  //    skip a domain.
  const toc = await runPgTool(pgRestore, ['--list', dumpPath]);
  const tocTables = parseTocTableDataEntries(toc.stdout);
  const missing = sourceFacts
    .map((digest) => digest.name)
    .filter((name) => !tocTables.includes(name));
  if (missing.length > 0) {
    throw new RecoveryError(
      `backup table of contents is missing authoritative domains: ${missing.join(', ')}`,
    );
  }

  const archive = await stat(dumpPath);
  const archiveBytes = archive.size;
  const archiveSha256 = createHash('sha256')
    .update(await readFile(dumpPath))
    .digest('hex');

  const serverVersion = await withRecoveryPool(databaseUrl, async (pool) => {
    const result = await pool.query('show server_version');
    return String(result.rows[0]?.server_version ?? 'unknown');
  });

  const manifest = {
    kind: MANIFEST_KIND,
    formatVersion: MANIFEST_FORMAT_VERSION,
    createdAt: now.toISOString(),
    toolVersions: {
      pgDump: pgDumpVersion.text,
      server: serverVersion,
    },
    source: {
      label: describeDatabaseLabel(databaseUrl),
    },
    migrations: migrations.map((migration) => ({
      file: migration.file,
      sha256: migration.sha256,
    })),
    tables: sourceFacts.map((digest) => ({
      name: digest.name,
      rowCount: digest.rowCount,
      checksum: digest.checksum,
    })),
    artifact: {
      file: `${base}.dump`,
      bytes: archiveBytes,
      sha256: archiveSha256,
    },
    ...(Object.keys(probes).length > 0 ? { probes } : {}),
  };

  const manifestPath = join(outputDir, `${base}.manifest.json`);
  await writeFile(manifestPath, serializeManifest(manifest), 'utf8');

  return {
    dumpFile: dumpPath,
    manifestFile: manifestPath,
    manifest,
  };
}

export async function loadBackupArtifact(dumpFile, manifestFile) {
  const manifest = parseManifest(await readFile(manifestFile, 'utf8'));
  const archive = await stat(dumpFile);
  const archiveSha256 = createHash('sha256')
    .update(await readFile(dumpFile))
    .digest('hex');

  if (archive.size !== manifest.artifact.bytes) {
    throw new RecoveryError(
      `backup archive size does not match manifest (archive ${String(archive.size)}, manifest ${String(manifest.artifact.bytes)})`,
    );
  }
  if (archiveSha256 !== manifest.artifact.sha256) {
    throw new RecoveryError(
      'backup archive content hash does not match manifest; artifact is corrupt or tampered',
    );
  }
  return { dumpFile, manifest };
}

