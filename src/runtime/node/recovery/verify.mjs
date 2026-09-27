// Restore verification battery.
//
// Turns collected schema facts, data digests, and negative behavioral probes
// into an explicit pass/fail result. Every check is named so an operator can
// see exactly which recovery invariant failed.

import {
  BROWSER_ROLE_NAMES,
  EXPECTED_FOREIGN_KEYS,
  EXPECTED_TABLES,
  EXPECTED_TRIGGERS,
  EXPECTED_UNIQUE_CONSTRAINTS,
  isKnownTableName,
} from './schema-contract.mjs';
import {
  CHECKSUM_ALGORITHM,
  collectSchemaFacts,
  collectTableDigests,
  runNegativeProbes,
} from './schema-facts.mjs';

function columnsMatch(actual, expected) {
  if (actual.length !== expected.length) return false;
  const normalizedActual = [...actual].map((column) => column.toLowerCase());
  const normalizedExpected = expected.map((column) => column.toLowerCase());
  for (const column of normalizedExpected) {
    if (!normalizedActual.includes(column)) return false;
  }
  return true;
}

function referencesMatch(fk, expected) {
  const match = /^([a-z_][a-z0-9_]*)\(([^)]+)\)$/.exec(expected.references);
  if (match === null) return false;
  const refTable = match[1];
  const refColumns = match[2].split(',').map((part) => part.trim());
  return (
    fk.refTable === refTable && columnsMatch(fk.refColumns, refColumns)
  );
}

// Structural verification of the schema contract. `facts.tables` must match
// the contract exactly: any missing required table and any unknown public
// table fails recovery. The unknown-table rule is the anti-drift tripwire:
// new durable domains must extend the recovery contract, or recovery
// refuses to certify.
export function verifySchemaFacts(facts) {
  const checks = [];
  const check = (name, passed, detail) => {
    checks.push({ name, passed, detail });
  };

  const presentTables = new Set(facts.tables);

  for (const table of EXPECTED_TABLES) {
    check(
      `table present: ${table.name}`,
      presentTables.has(table.name),
      presentTables.has(table.name)
        ? undefined
        : 'required table is missing',
    );
  }

  const unknown = facts.tables.filter((name) => !isKnownTableName(name));
  check(
    'no unaccounted public tables',
    unknown.length === 0,
    unknown.length === 0
      ? undefined
      : `unaccounted tables (recovery contract must be extended): ${unknown.join(', ')}`,
  );

  for (const table of EXPECTED_TABLES) {
    check(
      `row level security enabled: ${table.name}`,
      facts.rls.get(table.name) === true,
    );
  }

  for (const role of BROWSER_ROLE_NAMES) {
    const leaked = facts.privileges.filter(
      (privilege) =>
        privilege.roleName === role &&
        (privilege.canSelect ||
          privilege.canInsert ||
          privilege.canUpdate ||
          privilege.canDelete),
    );
    check(
      `browser role retains no table privileges: ${role}`,
      leaked.length === 0,
      leaked.length === 0
        ? undefined
        : `privileges re-appeared on: ${leaked.map((entry) => entry.tableName).join(', ')}`,
    );
  }

  for (const trigger of EXPECTED_TRIGGERS) {
    const found = facts.triggers.find(
      (candidate) =>
        candidate.tableName === trigger.table &&
        candidate.triggerName === trigger.name,
    );
    check(
      `append-only trigger present: ${trigger.name}`,
      found !== undefined && found.enabled,
      found === undefined
        ? 'trigger is missing'
        : found.enabled
          ? undefined
          : 'trigger is disabled',
    );
    if (trigger.pinnedSearchPath && found !== undefined) {
      const pinned = found.proconfig.some(
        (entry) =>
          entry === 'search_path=pg_catalog, public' ||
          entry === 'search_path=pg_catalog,public',
      );
      check(
        `trigger function search_path pinned: ${trigger.function}`,
        pinned,
      );
    }
  }

  for (const expected of EXPECTED_UNIQUE_CONSTRAINTS) {
    const found = facts.uniques.find(
      (unique) =>
        unique.tableName === expected.table &&
        columnsMatch(unique.columns, expected.columns),
    );
    check(
      `unique identity survives: ${expected.label}`,
      found !== undefined,
      found === undefined ? 'unique constraint is missing' : undefined,
    );
  }

  for (const expected of EXPECTED_FOREIGN_KEYS) {
    const found = facts.foreignKeys.find(
      (fk) =>
        fk.tableName === expected.table &&
        columnsMatch(fk.columns, expected.columns) &&
        referencesMatch(fk, expected),
    );
    check(
      `foreign key survives: ${expected.table}(${expected.columns.join(', ')}) -> ${expected.references}`,
      found !== undefined,
      found === undefined ? 'foreign key constraint is missing' : undefined,
    );
  }

  return checks;
}

export function verifyTableDigests(digests, manifestTables) {
  const checks = [];
  const check = (name, passed, detail) => {
    checks.push({ name, passed, detail });
  };

  const restored = new Map(digests.map((digest) => [digest.name, digest]));
  const recorded = new Map(
    manifestTables.map((table) => [table.name, table]),
  );

  for (const expected of EXPECTED_TABLES) {
    const recordedEntry = recorded.get(expected.name);
    const restoredEntry = restored.get(expected.name);

    if (recordedEntry === undefined) {
      check(
        `backup manifest covers table: ${expected.name}`,
        false,
        'manifest is missing this table; recovery would silently skip a domain',
      );
      continue;
    }

    if (restoredEntry === undefined) {
      check(`restored table readable: ${expected.name}`, false);
      continue;
    }

    check(
      `row count preserved: ${expected.name}`,
      restoredEntry.rowCount === recordedEntry.rowCount,
      restoredEntry.rowCount === recordedEntry.rowCount
        ? undefined
        : `expected ${String(recordedEntry.rowCount)} rows, restored ${String(restoredEntry.rowCount)}`,
    );

    check(
      `content checksum preserved: ${expected.name}`,
      restoredEntry.checksum === recordedEntry.checksum,
      restoredEntry.checksum === recordedEntry.checksum
        ? undefined
        : `content changed between backup and restore (${CHECKSUM_ALGORITHM})`,
    );
  }

  return checks;
}

// Full restore verification against a manifest produced at backup time.
// Combines schema facts, data digests, and negative behavioral probes.
export async function runRestoreVerification(client, manifest) {
  const facts = await collectSchemaFacts(client);
  const digests = await collectTableDigests(client);

  const checks = [
    ...verifySchemaFacts(facts),
    ...verifyTableDigests(digests, manifest.tables),
  ];

  const probes = manifest.probes ?? {};
  if (probes.eventId !== undefined || probes.chatMessageId !== undefined) {
    const probeResults = await runNegativeProbes(client, {
      eventId: probes.eventId,
      chatMessageId: probes.chatMessageId,
      chatThreadId: probes.chatThreadId,
      foreignOwnerId: probes.foreignOwnerId,
    });
    checks.push(...probeResults);
  }

  const failures = checks.filter((entry) => !entry.passed);
  return {
    passed: failures.length === 0,
    checks,
    failures: failures.map(
      (failure) =>
        `${failure.name}${failure.detail === undefined ? '' : `: ${failure.detail}`}`,
    ),
    digestSummary: Object.fromEntries(
      digests.map((digest) => [digest.name, digest.rowCount]),
    ),
  };
}
