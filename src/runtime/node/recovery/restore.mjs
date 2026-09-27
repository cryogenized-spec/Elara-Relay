// Restore orchestration.
//
// Restores a canonical Elara backup artifact into a PostgreSQL database and
// verifies the result. The sequence is:
//
//   clean-target assertion (or explicit replacement)
//     -> ensure shadow browser roles (cluster-level, matching live posture)
//     -> pg_restore --exit-on-error --single-transaction
//     -> full recovery verification battery (schema + data + probes)
//     -> restore verification report
//
// A failed pg_restore rolls back its single transaction, leaving the target
// empty; a failed verification leaves the restore marked FAILED. A restore
// is only ever reported successful when every verification check passed.

import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { describeDatabaseLabel, withRecoveryPool } from './db.mjs';
import {
  REPORT_FORMAT_VERSION,
  REPORT_KIND,
  serializeManifest,
} from './manifest.mjs';
import { RecoveryError } from './migrations.mjs';
import { resolvePgTool, runPgTool } from './pg-tools.mjs';
import { runRestoreVerification } from './verify.mjs';

const BROWSER_SHADOW_ROLES = ['anon', 'authenticated'];

// The anon/authenticated roles are cluster-level (created by Supabase in
// production, created explicitly in clean environments). pg_restore applies
// the reviewed REVOKE statements verbatim, so these roles must exist before
// restore or the security statements would fail.
async function ensureBrowserShadowRoles(adminClient) {
  for (const role of BROWSER_SHADOW_ROLES) {
    const existing = await adminClient.query(
      'select 1 from pg_roles where rolname = $1',
      [role],
    );
    if (existing.rows.length === 0) {
      await adminClient.query(`create role ${role} nologin`);
    }
  }
}

// A restore must target a clean database. Restoring over live Elara tables
// would corrupt state; recovery replaces databases, it never merges them.
async function assertCleanTarget(client) {
  const result = await client.query(`
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
    order by c.relname
  `);
  if (result.rows.length > 0) {
    throw new RecoveryError(
      `restore target is not clean; public tables present: ${result.rows
        .map((row) => row.table_name)
        .join(', ')}. Use replaceTarget to drop and recreate the database.`,
    );
  }
}

async function replaceTargetDatabase(databaseUrl) {
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, '');
  if (database === '') {
    throw new RecoveryError('restore target URL does not name a database');
  }
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';

  await withRecoveryPool(adminUrl.toString(), async (pool) => {
    const client = await pool.connect();
    try {
      await ensureBrowserShadowRoles(client);
      // WITH (FORCE) drops remaining connections; recovery explicitly owns
      // the target it was told to replace.
      await client.query(
        `drop database if exists ${quoteIdent(database)} with (force)`,
      );
      await client.query(`create database ${quoteIdent(database)}`);
    } finally {
      client.release();
    }
  });
}

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new RecoveryError(`refusing to quote irregular database name: ${name}`);
  }
  return `"${name}"`;
}

export async function restoreBackup(options) {
  const {
    databaseUrl,
    dumpFile,
    manifest,
    replaceTarget = false,
    reportPath,
    env = process.env,
    now = new Date(),
  } = options;

  const pgRestore = resolvePgTool('pg_restore', env);

  if (replaceTarget) {
    await replaceTargetDatabase(databaseUrl);
  }

  // 1. Clean-target assertion (after optional replacement).
  await withRecoveryPool(databaseUrl, async (pool) => {
    const client = await pool.connect();
    try {
      await assertCleanTarget(client);
    } finally {
      client.release();
    }
  });

  // 2. Ensure the browser shadow roles exist so the dump's reviewed REVOKE
  //    statements apply verbatim during restore.
  await withRecoveryPool(databaseUrl, async (pool) => {
    const client = await pool.connect();
    try {
      await ensureBrowserShadowRoles(client);
    } finally {
      client.release();
    }
  });

  // 3. Atomic restore: --single-transaction aborts the whole restore on any
  //    error, so a failed restore can never half-apply and then masquerade
  //    as success.
  const restoreResult = await runPgTool(pgRestore, [
    '--no-password',
    '--exit-on-error',
    '--single-transaction',
    '--dbname=' + databaseUrl,
    dumpFile,
  ], [databaseUrl]);
  void restoreResult;

  // 4. Verify the restored database against the backup manifest.
  const verification = await withRecoveryPool(databaseUrl, async (pool) => {
    const client = await pool.connect();
    try {
      return await runRestoreVerification(client, manifest);
    } finally {
      client.release();
    }
  });

  const manifestSha256 = createHash('sha256')
    .update(serializeManifest(manifest))
    .digest('hex');

  const report = {
    kind: REPORT_KIND,
    formatVersion: REPORT_FORMAT_VERSION,
    verifiedAt: now.toISOString(),
    artifact: {
      dumpFile: manifest.artifact.file,
      dumpSha256: manifest.artifact.sha256,
      manifestSha256,
    },
    result: {
      passed: verification.passed,
      checksTotal: verification.checks.length,
      checksPassed:
        verification.checks.length - verification.failures.length,
      failures: verification.failures,
    },
    digestSummary: verification.digestSummary,
    target: {
      label: describeDatabaseLabel(databaseUrl),
    },
  };

  if (reportPath !== undefined) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (!verification.passed) {
    throw new RecoveryError(
      `restore verification FAILED (${String(verification.failures.length)} checks):\n- ${verification.failures.join('\n- ')}`,
    );
  }

  return { report, verification };
}
