// Recovery module entry points. Server/operator use only: nothing in this
// directory may be imported by browser code.
export {
  EXPECTED_TABLES,
  EXPECTED_TRIGGERS,
  EXPECTED_UNIQUE_CONSTRAINTS,
  EXPECTED_FOREIGN_KEYS,
  BROWSER_ROLE_NAMES,
  TABLE_NAMES,
  getTableContract,
  isKnownTableName,
} from './schema-contract.mjs';
export {
  RecoveryError,
  defaultMigrationsDir,
  listMigrationFiles,
  loadMigrations,
} from './migrations.mjs';
export {
  sanitizeToolOutput,
  runPgTool,
  toolEnvName,
  resolvePgTool,
  getPgToolVersion,
} from './pg-tools.mjs';
export {
  describeDatabaseLabel,
  withChecksumSession,
  withRecoveryPool,
} from './db.mjs';
export {
  CHECKSUM_ALGORITHM,
  collectSchemaFacts,
  collectTableDigests,
  listPublicTables,
  runNegativeProbes,
} from './schema-facts.mjs';
export {
  verifySchemaFacts,
  verifyTableDigests,
  runRestoreVerification,
} from './verify.mjs';
export {
  MANIFEST_FORMAT_VERSION,
  MANIFEST_KIND,
  REPORT_FORMAT_VERSION,
  REPORT_KIND,
  validateManifest,
  validateVerificationReport,
  serializeManifest,
  parseManifest,
} from './manifest.mjs';
export {
  parseTocTableDataEntries,
  createBackup,
  loadBackupArtifact,
} from './backup.mjs';
export { restoreBackup } from './restore.mjs';
export { probeDatabaseReadiness, summarizeReadiness } from './readiness.mjs';
