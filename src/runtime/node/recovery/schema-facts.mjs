// SQL-level fact collection against a live Elara PostgreSQL database.
//
// Everything here is plain PostgreSQL catalog + data access so the same code
// verifies a source database before backup and a target database after
// restore. No Supabase-specific client APIs are involved: recovery is
// PostgreSQL-centric by design.

import {
  EXPECTED_TABLES,
  BROWSER_ROLE_NAMES,
} from './schema-contract.mjs';
import { withChecksumSession } from './db.mjs';

const CHECKSUM_ALGORITHM = 'pg-md5-row_to_json-pk-order';

function quotedIdentifier(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`refusing to quote irregular identifier: ${name}`);
  }
  return `"${name}"`;
}

async function listPublicTables(client) {
  const result = await client.query(`
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
    order by c.relname
  `);
  return result.rows.map((row) => row.table_name);
}

async function listRowLevelSecurity(client) {
  const result = await client.query(`
    select c.relname as table_name, c.relrowsecurity as rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
  `);
  const map = new Map();
  for (const row of result.rows) {
    map.set(row.table_name, row.rls_enabled === true);
  }
  return map;
}

async function listBrowserRolePrivileges(client) {
  const tables = EXPECTED_TABLES.map((table) => table.name);
  const result = await client.query(
    `
    select role_name, table_name,
           has_table_privilege(role_name, format('public.%I', table_name), 'select') as can_select,
           has_table_privilege(role_name, format('public.%I', table_name), 'insert') as can_insert,
           has_table_privilege(role_name, format('public.%I', table_name), 'update') as can_update,
           has_table_privilege(role_name, format('public.%I', table_name), 'delete') as can_delete
    from unnest($1::text[]) as role_name
    cross join unnest($2::text[]) as table_name
  `,
    [[...BROWSER_ROLE_NAMES], tables],
  );
  return result.rows.map((row) => ({
    roleName: row.role_name,
    tableName: row.table_name,
    canSelect: row.can_select === true,
    canInsert: row.can_insert === true,
    canUpdate: row.can_update === true,
    canDelete: row.can_delete === true,
  }));
}

async function listTriggers(client) {
  const result = await client.query(`
    select c.relname as table_name, t.tgname as trigger_name,
           t.tgenabled as enabled,
           p.proname as function_name,
           p.proconfig as proconfig
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public'
      and not t.tgisinternal
    order by c.relname, t.tgname
  `);
  return result.rows.map((row) => ({
    tableName: row.table_name,
    triggerName: row.trigger_name,
    enabled: row.enabled !== 'D',
    functionName: row.function_name,
    proconfig: row.proconfig ?? [],
  }));
}

async function listUniqueConstraints(client) {
  const result = await client.query(`
    select c.relname as table_name,
           array_agg(a.attname::text order by k.ord) as columns
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join unnest(i.indkey) with ordinality as k(attnum, ord) on true
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
    where n.nspname = 'public'
      and i.indisunique
      and c.relkind = 'r'
    group by c.relname, i.indexrelid
    order by c.relname
  `);
  return result.rows.map((row) => ({
    tableName: row.table_name,
    columns: row.columns,
  }));
}

async function listForeignKeys(client) {
  const result = await client.query(`
    select src.relname as table_name,
           array_agg(src_a.attname::text order by k.ord) as columns,
           dst.relname as ref_table,
           array_agg(dst_a.attname::text order by k.ord) as ref_columns
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_namespace sn on sn.oid = src.relnamespace
    join pg_class dst on dst.oid = con.confrelid
    join unnest(con.conkey) with ordinality as k(attnum, ord) on true
    join pg_attribute src_a on src_a.attrelid = con.conrelid and src_a.attnum = k.attnum
    join unnest(con.confkey) with ordinality as dk(attnum, ord) on dk.ord = k.ord
    join pg_attribute dst_a on dst_a.attrelid = con.confrelid and dst_a.attnum = dk.attnum
    where con.contype = 'f'
      and sn.nspname = 'public'
    group by src.relname, dst.relname, con.oid
    order by src.relname
  `);
  return result.rows.map((row) => ({
    tableName: row.table_name,
    columns: row.columns,
    refTable: row.ref_table,
    refColumns: row.ref_columns,
  }));
}

// Count + content checksum per authoritative table. The checksum is the
// PostgreSQL md5 over newline-joined row_to_json texts ordered by the
// table's primary key, computed in a UTC-pinned session. Both the backup
// and the verification sides run this identical query, so any content or
// ordering difference after a restore changes the checksum.
async function collectTableDigests(client) {
  const digests = [];
  for (const table of EXPECTED_TABLES) {
    const orderColumns = table.primaryKey
      .map((column) => quotedIdentifier(column))
      .join(', ');
    const pkSelect = table.primaryKey
      .map(
        (column) =>
          `t.${quotedIdentifier(column)} as ${quotedIdentifier(column)}`,
      )
      .join(', ');
    const result = await withChecksumSession(client, async () =>
      client.query(
        `
        select count(*)::text as row_count,
               coalesce(md5(string_agg(row_text, E'\n' order by (${orderColumns}))), '') as checksum
        from (
          select row_to_json(t.*)::text as row_text, ${pkSelect}
          from public.${quotedIdentifier(table.name)} t
        ) rows
      `,
      ),
    );
    const row = result.rows[0];
    digests.push({
      name: table.name,
      rowCount: Number.parseInt(row.row_count, 10),
      checksum: row.checksum,
    });
  }
  return digests;
}

// Schema facts without data digests: used by readiness probes and clean
// target assertions where reading authoritative row data is unnecessary.
async function collectSchemaFacts(client) {
  const [tables, rls, privileges, triggers, uniques, foreignKeys] =
    await Promise.all([
      listPublicTables(client),
      listRowLevelSecurity(client),
      listBrowserRolePrivileges(client),
      listTriggers(client),
      listUniqueConstraints(client),
      listForeignKeys(client),
    ]);
  return {
    tables,
    rls,
    privileges,
    triggers,
    uniques,
    foreignKeys,
  };
}

// Append-only and isolation behavioral probes. Every probe runs inside a
// transaction that is rolled back, so verification never mutates the
// database it is verifying.
async function runNegativeProbes(client, probes) {
  const results = [];

  async function expectRejection(name, sql, values, messagePattern) {
    try {
      await client.query('begin');
      await client.query(sql, values);
      await client.query('rollback');
      results.push({
        name,
        passed: false,
        detail: 'statement unexpectedly succeeded',
      });
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        name,
        passed: messagePattern.test(message),
        detail: message.slice(0, 300),
      });
    }
  }

  if (probes.eventId !== undefined) {
    await expectRejection(
      'events are not updatable',
      'update public.events set detail = detail where id = $1',
      [probes.eventId],
      /events are append-only/,
    );
    await expectRejection(
      'events are not deletable',
      'delete from public.events where id = $1',
      [probes.eventId],
      /events are append-only/,
    );
  }

  // mutation_receipts are intentionally NOT probed for update rejection:
  // they are keyed by mutation_id but are not append-only by design.

  if (probes.chatMessageId !== undefined && probes.foreignOwnerId !== undefined) {
    await expectRejection(
      'chat messages reject cross-owner records',
      `insert into public.chat_messages (
         id, thread_id, owner_id, turn_id, role, status, content, completed_at
       ) values (
         gen_random_uuid(), $1, $2, gen_random_uuid(), 'USER', 'COMPLETED', 'recovery probe', now()
       )`,
      [probes.chatThreadId, probes.foreignOwnerId],
      /chat_threads_id_owner_id_fkey|violates foreign key constraint/,
    );
    await expectRejection(
      'chat messages are not deletable',
      'delete from public.chat_messages where id = $1',
      [probes.chatMessageId],
      /chat messages are append-only/,
    );
  }

  return results;
}

export {
  CHECKSUM_ALGORITHM,
  collectSchemaFacts,
  collectTableDigests,
  listPublicTables,
  runNegativeProbes,
};
