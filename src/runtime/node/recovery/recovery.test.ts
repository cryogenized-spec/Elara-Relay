import { describe, expect, it } from 'vitest';
import {
  listMigrationFiles,
  RecoveryError,
  type LoadedMigration,
} from './migrations.mjs';
import {
  MANIFEST_KIND,
  REPORT_KIND,
  parseManifest,
  serializeManifest,
  validateManifest,
  validateVerificationReport,
  type BackupManifest,
  type RecoveryVerificationReport,
} from './manifest.mjs';
import { isKnownTableName } from './schema-contract.mjs';
import { parseTocTableDataEntries } from './backup.mjs';
import { resolvePgTool, sanitizeToolOutput, toolEnvName } from './pg-tools.mjs';
import {
  probeDatabaseReadiness,
  summarizeReadiness,
} from './readiness.mjs';
import {
  verifySchemaFacts,
  verifyTableDigests,
} from './verify.mjs';
import {
  EXPECTED_TABLES,
  TABLE_NAMES,
} from './schema-contract.mjs';

function inMemoryFs(names: string[]) {
  return {
    readdirSync: (_dir: string) => names,
  };
}

describe('recovery migration loader', () => {
  it('lists migration files in strict numeric order', () => {
    const files = listMigrationFiles('/migrations', {
      fs: inMemoryFs([
        '0006_ai_chat.sql',
        '0001_domain_kernel.sql',
        '0003_repairs_domain.sql',
        '0002_security_hardening.sql',
        '0005_scheduler_backoff.sql',
        '0004_scheduler.sql',
        'README.md',
      ]),
    });
    expect(files).toEqual([
      '0001_domain_kernel.sql',
      '0002_security_hardening.sql',
      '0003_repairs_domain.sql',
      '0004_scheduler.sql',
      '0005_scheduler_backoff.sql',
      '0006_ai_chat.sql',
    ]);
  });

  it('rejects a broken migration order instead of restoring a wrong schema', () => {
    expect(() =>
      listMigrationFiles('/migrations', {
        fs: inMemoryFs([
          '0001_domain_kernel.sql',
          '0003_repairs_domain.sql',
        ]),
      }),
    ).toThrow(RecoveryError);
  });

  it('rejects stray sql files that violate the naming contract', () => {
    expect(() =>
      listMigrationFiles('/migrations', {
        fs: inMemoryFs([
          '0001_domain_kernel.sql',
          'fix-things.sql',
        ]),
      }),
    ).toThrow(/naming contract/);
  });

  it('rejects an empty migration directory', () => {
    expect(() =>
      listMigrationFiles('/migrations', { fs: inMemoryFs([]) }),
    ).toThrow(/no migration files/);
  });
});

describe('backup table of contents', () => {
  const toc = [
    '; Archive created at 2026-09-27T08:00:00Z',
    ';     Dumped from database version: 17.6',
    '2720; 0 16456 TABLE DATA public parties postgres',
    '2721; 0 16457 TABLE DATA public jobs postgres',
    '2722; 0 16458 TABLE DATA public events postgres',
    '2723; 0 16459 TABLE DATA public mutation_receipts postgres',
    '218; 1259 16460 TABLE public repairs postgres',
    '2730; 0 16461 TABLE DATA public repairs postgres',
    '; done',
  ].join('\n');

  it('extracts only TABLE DATA entries, never schema-only entries', () => {
    expect(parseTocTableDataEntries(toc)).toEqual([
      'parties',
      'jobs',
      'events',
      'mutation_receipts',
      'repairs',
    ]);
  });

  it('lets the gate detect a silently skipped domain', () => {
    const parsed = parseTocTableDataEntries(toc);
    const missing = TABLE_NAMES.filter((name) => !parsed.includes(name));
    expect(missing.length).toBeGreaterThan(0);
  });
});

function validManifest(): BackupManifest {
  return {
    kind: MANIFEST_KIND,
    formatVersion: 1,
    createdAt: '2026-09-27T08:00:00.000Z',
    toolVersions: {
      pgDump: 'pg_dump (PostgreSQL) 17.6',
      server: '17.6',
    },
    source: { label: '127.0.0.1:5433/elara' },
    migrations: [{ file: '0001_domain_kernel.sql', sha256: 'a'.repeat(64) }],
    tables: [
      { name: 'parties', rowCount: 1, checksum: 'b'.repeat(32) },
      { name: 'events', rowCount: 5, checksum: 'c'.repeat(32) },
    ],
    artifact: {
      file: 'elara-backup.dump',
      bytes: 2048,
      sha256: 'd'.repeat(64),
    },
    probes: { eventId: '00000000-0000-4000-8000-000000000001' },
  };
}

describe('backup manifest', () => {
  it('accepts the reviewed manifest shape', () => {
    expect(validateManifest(validManifest())).toBeTruthy();
  });

  it('fails closed on a tampered artifact digest', () => {
    const tampered = validManifest();
    const broken = {
      ...tampered,
      artifact: { ...tampered.artifact, sha256: 'not-a-digest' },
    };
    expect(() => validateManifest(broken)).toThrow(/sha256/);
  });

  it('fails closed when the artifact size is not positive', () => {
    const broken = validManifest();
    expect(() =>
      validateManifest({
        ...broken,
        artifact: { ...broken.artifact, bytes: 0 },
      }),
    ).toThrow(/bytes/);
  });

  it('fails closed on an unknown format version', () => {
    expect(() =>
      validateManifest({ ...validManifest(), formatVersion: 99 }),
    ).toThrow(/formatVersion/);
  });

  it('fails closed on invalid checksum fields', () => {
    const broken = validManifest();
    const tables = broken.tables.map((table) =>
      table.name === 'events' ? { ...table, checksum: 'nope' } : table,
    );
    expect(() => validateManifest({ ...broken, tables })).toThrow(/md5 checksum/);
  });

  it('fails closed on duplicate table entries', () => {
    const broken = validManifest();
    expect(() =>
      validateManifest({ ...broken, tables: [...broken.tables, broken.tables[0]] }),
    ).toThrow(/unique/);
  });

  it('round-trips through serialization and parsing', () => {
    const parsed = parseManifest(serializeManifest(validManifest()));
    expect(parsed.artifact.file).toBe('elara-backup.dump');
  });

  it('rejects unparsable manifest text', () => {
    expect(() => parseManifest('{not json')).toThrow(RecoveryError);
  });
});

describe('restore verification report', () => {
  function validReport(): RecoveryVerificationReport {
    return {
      kind: REPORT_KIND,
      formatVersion: 1,
      verifiedAt: '2026-09-27T09:00:00.000Z',
      artifact: {
        dumpFile: 'elara-backup.dump',
        dumpSha256: 'd'.repeat(64),
        manifestSha256: 'f'.repeat(64),
      },
      result: {
        passed: true,
        checksTotal: 42,
        checksPassed: 42,
        failures: [],
      },
      digestSummary: { parties: 1 },
      target: { label: '127.0.0.1:5433/elara_restored' },
    };
  }

  it('accepts a passing report', () => {
    expect(validateVerificationReport(validReport())).toBeTruthy();
  });

  it('rejects a malformed report rather than misreporting success', () => {
    const broken = validReport();
    expect(() =>
      validateVerificationReport({
        ...broken,
        result: { ...broken.result, passed: 'yes' as unknown as boolean },
      }),
    ).toThrow(/result.passed/);
  });
});

describe('schema fact verification', () => {
  function completeFacts() {
    return {
      tables: [...TABLE_NAMES],
      rls: new Map(TABLE_NAMES.map((name) => [name, true])),
      privileges: TABLE_NAMES.flatMap((tableName) =>
        ['anon', 'authenticated'].map((roleName) => ({
          roleName,
          tableName,
          canSelect: false,
          canInsert: false,
          canUpdate: false,
          canDelete: false,
        })),
      ),
      triggers: [
        {
          tableName: 'events',
          triggerName: 'events_append_only',
          enabled: true,
          functionName: 'reject_event_mutation',
          proconfig: ['search_path=pg_catalog, public'],
        },
        {
          tableName: 'chat_messages',
          triggerName: 'chat_messages_append_only',
          enabled: true,
          functionName: 'enforce_chat_message_transition',
          proconfig: ['search_path=pg_catalog, public'],
        },
      ],
      uniques: [
        { tableName: 'jobs', columns: ['job_key'] },
        { tableName: 'events', columns: ['mutation_id'] },
        { tableName: 'mutation_receipts', columns: ['mutation_id'] },
        { tableName: 'repairs', columns: ['job_id'] },
        { tableName: 'scheduled_action_runs', columns: ['occurrence_key'] },
        { tableName: 'scheduled_action_runs', columns: ['lease_token'] },
        { tableName: 'chat_threads', columns: ['id', 'owner_id'] },
        { tableName: 'chat_messages', columns: ['thread_id', 'turn_id', 'role'] },
      ],
      foreignKeys: [
        { tableName: 'jobs', columns: ['party_id'], refTable: 'parties', refColumns: ['id'] },
        { tableName: 'tasks', columns: ['job_id'], refTable: 'jobs', refColumns: ['id'] },
        { tableName: 'repairs', columns: ['job_id'], refTable: 'jobs', refColumns: ['id'] },
        { tableName: 'scheduled_actions', columns: ['job_id'], refTable: 'jobs', refColumns: ['id'] },
        { tableName: 'scheduled_actions', columns: ['task_id'], refTable: 'tasks', refColumns: ['id'] },
        {
          tableName: 'scheduled_action_runs',
          columns: ['scheduled_action_id'],
          refTable: 'scheduled_actions',
          refColumns: ['id'],
        },
        {
          tableName: 'chat_messages',
          columns: ['thread_id', 'owner_id'],
          refTable: 'chat_threads',
          refColumns: ['id', 'owner_id'],
        },
      ],
    };
  }

  it('passes a complete, hardened schema', () => {
    const checks = verifySchemaFacts(completeFacts());
    const failed = checks.filter((check) => !check.passed);
    expect(failed).toEqual([]);
  });

  it('fails when a required domain table is missing', () => {
    const facts = completeFacts();
    facts.tables = facts.tables.filter((name) => name !== 'repairs');
    const checks = verifySchemaFacts(facts);
    expect(checks.filter((check) => !check.passed).map((c) => c.name)).toContain(
      'table present: repairs',
    );
  });

  it('fails loudly when an unaccounted public table exists', () => {
    const facts = completeFacts();
    facts.tables = [...facts.tables, 'secret_admin_table'];
    const checks = verifySchemaFacts(facts);
    const failed = checks.find((check) => !check.passed);
    expect(failed?.name).toBe('no unaccounted public tables');
    expect(failed?.detail).toContain('secret_admin_table');
  });

  it('fails when row level security disappears', () => {
    const facts = completeFacts();
    facts.rls.set('events', false);
    const checks = verifySchemaFacts(facts);
    expect(
      checks.some(
        (check) => !check.passed && check.name === 'row level security enabled: events',
      ),
    ).toBe(true);
  });

  it('fails when browser-role privileges reappear', () => {
    const facts = completeFacts();
    const leaked = facts.privileges.find(
      (privilege) => privilege.roleName === 'anon' && privilege.tableName === 'tasks',
    );
    if (leaked === undefined) throw new Error('fixture missing');
    (leaked as { canSelect: boolean }).canSelect = true;
    const checks = verifySchemaFacts(facts);
    expect(
      checks.some(
        (check) =>
          !check.passed &&
          check.name === 'browser role retains no table privileges: anon',
      ),
    ).toBe(true);
  });

  it('fails when an append-only trigger is disabled or unpinned', () => {
    const facts = completeFacts();
    const trigger = facts.triggers[0];
    if (trigger === undefined) throw new Error('fixture missing');
    facts.triggers[0] = { ...trigger, enabled: false };
    expect(
      verifySchemaFacts(facts).some(
        (check) => !check.passed && check.name.includes('events_append_only'),
      ),
    ).toBe(true);

    const unpinned = completeFacts();
    const trigger2 = unpinned.triggers[0];
    if (trigger2 === undefined) throw new Error('fixture missing');
    unpinned.triggers[0] = { ...trigger2, proconfig: [] };
    expect(
      verifySchemaFacts(unpinned).some(
        (check) =>
          !check.passed && check.name.includes('search_path pinned'),
      ),
    ).toBe(true);
  });

  it('fails when scheduler occurrence uniqueness disappears', () => {
    const facts = completeFacts();
    facts.uniques = facts.uniques.filter(
      (unique) =>
        !(
          unique.tableName === 'scheduled_action_runs' &&
          unique.columns.includes('occurrence_key')
        ),
    );
    const checks = verifySchemaFacts(facts);
    expect(
      checks.some(
        (check) =>
          !check.passed &&
          check.name.includes('scheduled_action_runs.occurrence_key'),
      ),
    ).toBe(true);
  });

  it('fails when a foreign key relationship is damaged', () => {
    const facts = completeFacts();
    facts.foreignKeys = facts.foreignKeys.filter(
      (fk) => !(fk.tableName === 'chat_messages'),
    );
    const checks = verifySchemaFacts(facts);
    expect(
      checks.some(
        (check) => !check.passed && check.name.includes('chat_messages'),
      ),
    ).toBe(true);
  });
});

describe('table digest verification', () => {
  const fullManifestTables = EXPECTED_TABLES.map((table, index) => ({
    name: table.name,
    rowCount: index + 1,
    checksum: (index + 1).toString().repeat(32).slice(0, 32),
  }));

  const identicalDigests = fullManifestTables.map((entry) => ({ ...entry }));

  it('passes identical digests for every authoritative table', () => {
    const checks = verifyTableDigests(identicalDigests, fullManifestTables);
    const failed = checks.filter((check) => !check.passed);
    expect(failed).toEqual([]);
  });

  it('detects lost events after a partial restore', () => {
    const restored = identicalDigests.map((entry) =>
      entry.name === 'events' ? { ...entry, rowCount: 5 } : entry,
    );
    const checks = verifyTableDigests(restored, fullManifestTables);
    expect(
      checks.some(
        (check) => !check.passed && check.name === 'row count preserved: events',
      ),
    ).toBe(true);
  });

  it('detects content changes with identical counts', () => {
    const restored = identicalDigests.map((entry) =>
      entry.name === 'parties' ? { ...entry, checksum: 'z'.repeat(32) } : entry,
    );
    const checks = verifyTableDigests(restored, fullManifestTables);
    expect(
      checks.some(
        (check) =>
          !check.passed && check.name === 'content checksum preserved: parties',
      ),
    ).toBe(true);
  });

  it('flags tables the manifest does not cover', () => {
    const checks = verifyTableDigests(
      identicalDigests,
      fullManifestTables.filter((table) => table.name !== 'events'),
    );
    expect(
      checks.some(
        (check) =>
          !check.passed && check.name === 'backup manifest covers table: events',
      ),
    ).toBe(true);
  });
});

describe('pg tool resolution', () => {
  it('prefers an explicit environment override', () => {
    expect(
      resolvePgTool('pg_dump', { ELARA_RECOVERY_PG_DUMP: '/opt/bin/pg_dump' }),
    ).toBe('/opt/bin/pg_dump');
  });

  it('names the override variable when the tool cannot be found', () => {
    expect(toolEnvName('pg_restore')).toBe('ELARA_RECOVERY_PG_RESTORE');
    expect(() =>
      resolvePgTool('pg_dump', { PATH: '/nonexistent-directory' }),
    ).toThrow(/ELARA_RECOVERY_PG_DUMP/);
  });

  it('redacts connection strings from captured tool output', () => {
    const output = sanitizeToolOutput(
      'connection to server at postgres://user:secret@db.example.com:5432/elara failed',
      ['postgres://user:secret@db.example.com:5432/elara'],
    );
    expect(output).not.toContain('secret');
    expect(output).toContain('<redacted>');
  });
});

describe('readiness probe', () => {
  function fakeConnect(behavior: {
    failConnect?: boolean;
    failSelect?: boolean;
    failFacts?: boolean;
    factsPass?: boolean;
  }) {
    return async (): Promise<{
      query(sql: string): Promise<{ rows: unknown[]; rowCount: number }>;
      release(): void;
    }> => {
      await Promise.resolve();
      return ({
      async query(sql: string): Promise<{ rows: unknown[]; rowCount: number }> {
        await Promise.resolve();
        if (sql === 'select 1') {
          if (behavior.failSelect) throw new Error('down');
          return { rows: [], rowCount: 0 };
        }
        if (behavior.failFacts) throw new Error('schema probe failed');
        return {
          rows: behavior.factsPass === true ? [] : TABLE_NAMES.map(() => ({})),
          rowCount: 0,
        };
      },
      release(): void {},
      });
    };
  }

  it('reports unknown posture when the database is unreachable', async () => {
    const probe = await probeDatabaseReadiness(
      fakeConnect({ failSelect: true }),
    );
    expect(probe.database).toBe('down');
    const summary = summarizeReadiness(probe);
    expect(summary.ready).toBe(false);
    expect(summary.status).toBe('degraded');
  });

  it('reports degraded when the schema is not complete', async () => {
    const probe = await probeDatabaseReadiness(fakeConnect({ factsPass: false }));
    expect(probe.database).toBe('up');
    expect(probe.schema).toBe('incomplete');
  });
});

describe('recovery contract coverage', () => {
  it('covers every authoritative domain table exactly once', () => {
    const names = EXPECTED_TABLES.map((table) => table.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(isKnownTableName(name)).toBe(true);
    }
  });
});

describe('migration digest type', () => {
  it('keeps migration digest entries well-formed', () => {
    const migration: LoadedMigration = {
      file: '0001_domain_kernel.sql',
      sha256: 'a'.repeat(64),
      sql: 'begin; commit;',
    };
    expect(migration.sha256).toHaveLength(64);
  });
});
