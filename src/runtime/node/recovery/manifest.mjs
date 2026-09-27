// Backup manifest format.
//
// The canonical recovery artifact is the pg_dump custom-format archive plus
// this manifest. The manifest records what authoritative state must survive
// (counts, content checksums, migration digests, security posture, probe
// rows) so a restore can be *verified* rather than assumed.
//
// The manifest intentionally contains no connection strings, no passwords,
// no tokens, and no secret-bearing configuration. Only structural metadata
// and domain data digests are recorded.

import { RecoveryError } from './migrations.mjs';

export const MANIFEST_FORMAT_VERSION = 1;
export const MANIFEST_KIND = 'elara-recovery-backup';
export const REPORT_KIND = 'elara-recovery-verification';
export const REPORT_FORMAT_VERSION = 1;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Strict structural validation. Recovery fails closed on a manifest that
// does not match the reviewed format instead of guessing.
export function validateManifest(candidate) {
  const failures = [];
  const require = (condition, message) => {
    if (!condition) failures.push(message);
  };

  require(isPlainObject(candidate), 'manifest must be an object');
  if (!isPlainObject(candidate)) {
    throw new RecoveryError(`invalid backup manifest: ${failures.join('; ')}`);
  }

  require(
    candidate.kind === MANIFEST_KIND,
    `manifest kind must be ${MANIFEST_KIND}`,
  );
  require(
    candidate.formatVersion === MANIFEST_FORMAT_VERSION,
    `manifest formatVersion must be ${MANIFEST_FORMAT_VERSION}`,
  );
  require(
    typeof candidate.createdAt === 'string' &&
      !Number.isNaN(Date.parse(candidate.createdAt)),
    'manifest createdAt must be an ISO timestamp',
  );
  require(
    isPlainObject(candidate.toolVersions) &&
      typeof candidate.toolVersions.pgDump === 'string' &&
      typeof candidate.toolVersions.server === 'string',
    'manifest toolVersions must record pgDump and server versions',
  );
  require(
    isPlainObject(candidate.source) &&
      typeof candidate.source.label === 'string',
    'manifest source must record a sanitized label',
  );

  require(Array.isArray(candidate.migrations), 'migrations must be an array');
  for (const migration of candidate.migrations ?? []) {
    require(
      isPlainObject(migration) &&
        typeof migration.file === 'string' &&
        /^[0-9a-f]{64}$/.test(migration.sha256),
      'each migration entry must record file and sha256',
    );
  }

  require(Array.isArray(candidate.tables), 'tables must be an array');
  const tableNames = new Set(
    (candidate.tables ?? []).map((table) => isPlainObject(table) && table.name),
  );
  require(
    (candidate.tables ?? []).every(
      (table) =>
        isPlainObject(table) &&
        typeof table.name === 'string' &&
        Number.isInteger(table.rowCount) &&
        table.rowCount >= 0 &&
        typeof table.checksum === 'string' &&
        /^[0-9a-f]{32}$/.test(table.checksum),
    ),
    'each table entry must record name, rowCount, and an md5 checksum',
  );
  require(
    tableNames.size === (candidate.tables ?? []).length,
    'table entries must be unique',
  );

  require(
    isPlainObject(candidate.artifact) &&
      typeof candidate.artifact.file === 'string' &&
      Number.isInteger(candidate.artifact.bytes) &&
      candidate.artifact.bytes > 0 &&
      /^[0-9a-f]{64}$/.test(candidate.artifact.sha256),
    'manifest artifact must record file, bytes, and sha256',
  );

  require(
    candidate.probes === undefined || isPlainObject(candidate.probes),
    'probes must be an object when present',
  );

  if (failures.length > 0) {
    throw new RecoveryError(`invalid backup manifest: ${failures.join('; ')}`);
  }

  return candidate;
}

// Validate a restore verification report file (read back for observability).
export function validateVerificationReport(candidate) {
  const failures = [];
  const require = (condition, message) => {
    if (!condition) failures.push(message);
  };

  require(isPlainObject(candidate), 'report must be an object');
  if (!isPlainObject(candidate)) {
    throw new RecoveryError(
      `invalid recovery report: ${failures.join('; ')}`,
    );
  }

  require(
    candidate.kind === REPORT_KIND,
    `report kind must be ${REPORT_KIND}`,
  );
  require(
    candidate.formatVersion === REPORT_FORMAT_VERSION,
    `report formatVersion must be ${REPORT_FORMAT_VERSION}`,
  );
  require(
    typeof candidate.verifiedAt === 'string' &&
      !Number.isNaN(Date.parse(candidate.verifiedAt)),
    'report verifiedAt must be an ISO timestamp',
  );
  require(
    isPlainObject(candidate.result) && typeof candidate.result.passed === 'boolean',
    'report result.passed must be a boolean',
  );
  require(
    Array.isArray(candidate.result.failures),
    'report result.failures must be an array',
  );
  require(
    isPlainObject(candidate.target) && typeof candidate.target.label === 'string',
    'report target must record a sanitized label',
  );

  if (failures.length > 0) {
    throw new RecoveryError(`invalid recovery report: ${failures.join('; ')}`);
  }

  return candidate;
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function parseManifest(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RecoveryError('backup manifest is not valid JSON');
  }
  return validateManifest(parsed);
}
