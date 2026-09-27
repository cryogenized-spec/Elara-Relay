#!/usr/bin/env node
// Elara application-data portability tool. DDL is owned by reviewed migrations.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { finished } from 'node:stream/promises';
import { dirname, resolve, join } from 'node:path';
import { Pool } from 'pg';

const tables = [
  'parties', 'jobs', 'tasks', 'events', 'mutation_receipts', 'repairs',
  'scheduled_actions', 'scheduled_action_runs', 'chat_threads', 'chat_messages',
];
const migrationsDir = resolve('src/db/migrations');
const dataFile = 'data.sql';
const manifestFile = 'manifest.json';
const sha = (value) => createHash('sha256').update(value).digest('hex');

async function migrations() {
  const names = (await readdir(migrationsDir)).filter((name) => /^\d{4}_[a-z_]+\.sql$/.test(name)).sort();
  if (names.length === 0) throw new Error('No reviewed migrations found');
  return Promise.all(names.map(async (name) => ({ name, sha256: sha(await readFile(join(migrationsDir, name))) })));
}

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

// Supply libpq connection settings via the child environment, not argv or logs.
// Deliberately do not inherit ambient PG* overrides (including PGOPTIONS).
function connection(urlString) {
  if (!urlString) throw new Error('Explicit source/target URL environment variable is required');
  const url = new URL(urlString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
    throw new Error('Expected a PostgreSQL connection URL with host and database');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const sslmode = url.searchParams.get('sslmode') ?? (local ? 'prefer' : 'require');
  if (!local && !['require', 'verify-ca', 'verify-full'].includes(sslmode)) {
    throw new Error('Remote PostgreSQL requires TLS');
  }
  const allowed = new Set(['sslmode']);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) {
    throw new Error('Unsupported PostgreSQL URL parameter');
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
  Object.assign(env, {
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: sslmode,
    PGCONNECT_TIMEOUT: '10',
    PGCLIENTENCODING: 'UTF8',
    PGOPTIONS: '-c search_path=public',
  });
  return { env, url: urlString };
}

async function command(bin, args, env, outputPath) {
  const child = spawn(bin, args, { env, stdio: ['ignore', outputPath ? 'pipe' : 'ignore', 'pipe'] });
  // Consume but never echo libpq stderr (it may contain credentials or data).
  child.stderr.resume();
  let output;
  if (outputPath) {
    output = createWriteStream(outputPath, { flags: 'wx', mode: 0o600 });
    child.stdout.pipe(output);
    output.on('error', () => child.kill());
  }
  const outputDone = output ? finished(output) : Promise.resolve();
  const statusDone = new Promise((ok, fail) => {
    child.on('error', fail);
    child.on('close', ok);
  });
  const [status] = await Promise.all([statusDone, outputDone]);
  if (status !== 0) {
    throw new Error(`${bin} failed (exit ${status}); inspect connection, tool version and server logs`);
  }
}

function poolFor(conn) {
  return new Pool({ connectionString: conn.url, max: 1, connectionTimeoutMillis: 10000 });
}

async function assertSchema(client) {
  const actual = (await client.query("select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') order by relname")).rows.map((row) => row.relname);
  if (JSON.stringify(actual) !== JSON.stringify([...tables].sort())) {
    throw new Error('Public application table inventory differs from the reviewed ten-table schema');
  }
  const security = await client.query(`select c.relname, c.relrowsecurity,
    (select count(*)::int from pg_constraint k where k.conrelid = c.oid and not k.convalidated) as invalid_constraints,
    (select count(*)::int from pg_index i where i.indrelid = c.oid and not i.indisvalid) as invalid_indexes
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = any($1)`, [tables]);
  if (security.rows.some((row) => !row.relrowsecurity || row.invalid_constraints !== 0 || row.invalid_indexes !== 0)) {
    throw new Error('RLS or constraints/indexes are not valid on all application tables');
  }
  const browserAccess = await client.query(`select count(*)::int as exposed from pg_roles r
    cross join pg_class c where r.rolname in ('anon', 'authenticated')
    and c.relnamespace = 'public'::regnamespace and c.relname = any($1)
    and (has_table_privilege(r.oid, c.oid, 'SELECT')
      or has_table_privilege(r.oid, c.oid, 'INSERT')
      or has_table_privilege(r.oid, c.oid, 'UPDATE')
      or has_table_privilege(r.oid, c.oid, 'DELETE'))`, [tables]);
  if (browserAccess.rows[0].exposed !== 0) throw new Error('Browser roles have direct application table access');
  const objects = await client.query(`select
    (select count(*)::int from pg_index i join pg_class c on c.oid = i.indrelid
      where c.relnamespace = 'public'::regnamespace and c.relname = any($1)) as indexes,
    (select count(*)::int from pg_constraint k where k.connamespace = 'public'::regnamespace and k.contype = 'c') as checks,
    (select count(*)::int from pg_constraint k where k.connamespace = 'public'::regnamespace and k.contype = 'p') as primary_keys,
    (select count(*)::int from pg_constraint k where k.connamespace = 'public'::regnamespace and k.contype = 'u') as uniques,
    (select proconfig from pg_proc where oid = 'public.reject_event_mutation()'::regprocedure) as event_function_config,
    (select proconfig from pg_proc where oid = 'public.enforce_chat_message_transition()'::regprocedure) as chat_function_config`, [tables]);
  const o = objects.rows[0];
  if (o.indexes !== 32 || o.checks !== 73 || o.primary_keys !== 10 || o.uniques !== 8 ||
      !o.event_function_config?.includes('search_path=pg_catalog, public') ||
      !o.chat_function_config?.includes('search_path=pg_catalog, public')) {
    throw new Error('Reviewed indexes, constraints or immutable-history function configuration missing');
  }
  const boundary = await client.query(`select
    (select count(*)::int from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace) as fks,
    (select count(*)::int from pg_trigger where tgrelid = 'public.events'::regclass and tgname = 'events_append_only' and tgenabled = 'O') as events_trigger,
    (select count(*)::int from pg_trigger where tgrelid = 'public.chat_messages'::regclass and tgname = 'chat_messages_append_only' and tgenabled = 'O') as chat_trigger`);
  if (boundary.rows[0].fks !== 7 || boundary.rows[0].events_trigger !== 1 || boundary.rows[0].chat_trigger !== 1) {
    throw new Error('Ownership FKs or immutable-history triggers missing');
  }
}

async function summary(client) {
  const result = {};
  for (const table of tables) {
    const key = table === 'mutation_receipts' ? 'mutation_id' : 'id';
    // Fixed identifiers only. Ordered row hashes cover all columns, including
    // IDs, revisions, JSONB, receipts, provenance, timestamps and lease state.
    const { rows: [row] } = await client.query(`select count(*)::text as count,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' order by ${key}::text), '')) as digest
      from public.${table} t`);
    result[table] = row;
  }
  return result;
}

async function checkManifest(dir) {
  const path = join(dir, manifestFile);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  if (manifest.format !== 'elara-pg-data-v1' || manifest.dataFile !== dataFile ||
      JSON.stringify(manifest.tables) !== JSON.stringify(tables) ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      typeof manifest.counts !== 'object' || manifest.counts === null ||
      JSON.stringify(Object.keys(manifest.counts)) !== JSON.stringify(tables) ||
      tables.some((table) => !/^(0|[1-9][0-9]*)$/.test(manifest.counts[table]?.count) ||
        !/^[a-f0-9]{32}$/.test(manifest.counts[table]?.digest))) {
    throw new Error('Unsupported or incomplete backup manifest');
  }
  if (JSON.stringify(manifest.migrations) !== JSON.stringify(await migrations())) {
    throw new Error('Backup requires a different set of reviewed migrations; use the matching checkout');
  }
  if ((await hashFile(join(dir, dataFile))) !== manifest.sha256) {
    throw new Error('Backup data checksum mismatch');
  }
  return manifest;
}

async function exportData(dir) {
  const conn = connection(process.env.ELARA_BACKUP_SOURCE_URL);
  await mkdir(dirname(dir), { recursive: true, mode: 0o700 });
  await mkdir(dir, { mode: 0o700 }); // never overwrite or append an existing export
  const pool = poolFor(conn);
  let client;
  try {
    client = await pool.connect();
    await client.query('begin isolation level repeatable read read only');
    await client.query("set local time zone 'UTC'");
    await assertSchema(client);
    const snapshot = (await client.query('select pg_export_snapshot() as snapshot')).rows[0].snapshot;
    const counts = await summary(client);
    await command('pg_dump', [
      '--data-only', '--format=plain', '--no-owner', '--no-privileges',
      '--no-comments', '--snapshot', snapshot,
      ...tables.flatMap((table) => ['--table', `public.${table}`]),
    ], conn.env, join(dir, dataFile));
    await client.query('commit');
    const manifest = { format: 'elara-pg-data-v1', dataFile, tables, migrations: await migrations(), counts, sha256: await hashFile(join(dir, dataFile)) };
    await writeFile(join(dir, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await checkManifest(dir);
    console.log(`Exported ${tables.length} tables to ${dir}; validate and store securely.`);
  } catch (error) {
    if (client) await client.query('rollback').catch(() => {});
    await rm(dir, { recursive: true, force: true });
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

async function verifyTarget(pool, manifest) {
  const client = await pool.connect();
  try {
    await client.query('begin isolation level repeatable read read only');
    await client.query("set local time zone 'UTC'");
    await assertSchema(client);
    const actual = await summary(client);
    if (JSON.stringify(actual) !== JSON.stringify(manifest.counts)) {
      throw new Error('Restored row counts or row contents differ from snapshot');
    }
    const { rows: [state] } = await client.query(`select
      (select count(*)::int from public.scheduled_action_runs where status = 'CLAIMED') as claimed,
      (select count(*)::int from public.scheduled_actions where status = 'ACTIVE' and next_run_at <= now()) as due`);
    await client.query('commit');
    console.log(`Verified ${tables.length} tables, row digests, RLS, FKs and immutable-history triggers. Scheduler: ${state.claimed} claimed runs, ${state.due} due actions; workers must remain stopped until reviewed.`);
    return state;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function target(dir, restore) {
  const manifest = await checkManifest(dir);
  const conn = connection(process.env.ELARA_BACKUP_TARGET_URL);
  const pool = poolFor(conn);
  try {
    if (restore) {
      const existing = await pool.query("select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')");
      if (existing.rows.length) throw new Error('Target public schema is not empty; restore requires a fresh database');
      // Reviewed DDL is authoritative. Do not replay vendor roles, extensions or auth.
      for (const migration of manifest.migrations) {
        await command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', join(migrationsDir, migration.name)], conn.env);
      }
      const check = await pool.connect();
      try { await assertSchema(check); } finally { check.release(); }
      await command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', join(dir, dataFile)], conn.env);
    }
    await verifyTarget(pool, manifest);
  } finally { await pool.end(); }
}

async function main() {
  const [mode, path, confirmation] = process.argv.slice(2);
  if (!['export', 'validate', 'restore', 'verify'].includes(mode) || !path ||
    (mode === 'restore' && confirmation !== '--confirm-empty-target') ||
    (mode !== 'restore' && confirmation)) {
    throw new Error('Usage: node scripts/elara-backup.mjs export|validate|verify <directory> | restore <directory> --confirm-empty-target');
  }
  const dir = resolve(path);
  if (mode === 'export') await exportData(dir);
  else if (mode === 'validate') {
    await checkManifest(dir);
    console.log('Backup manifest, migration set and data checksum valid (database restore proof still required).');
  } else await target(dir, mode === 'restore');
}

main().catch(() => {
  // Never print raw PostgreSQL/libpq errors; they may include credentials or row data.
  console.error('Backup operation failed. Check the reviewed runbook, target cleanliness, connection and migration compatibility.');
  process.exitCode = 1;
});
