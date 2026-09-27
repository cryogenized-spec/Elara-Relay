import type { PoolClient } from 'pg';
import type { BackupManifest } from './manifest.mjs';

export interface RecoveryCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly detail?: string;
}

export interface RecoveryVerificationResult {
  readonly passed: boolean;
  readonly checks: readonly RecoveryCheck[];
  readonly failures: readonly string[];
  readonly digestSummary: Readonly<Record<string, number>>;
}

export declare function verifySchemaFacts(facts: unknown): RecoveryCheck[];
export declare function verifyTableDigests(
  digests: readonly unknown[],
  manifestTables: BackupManifest['tables'],
): RecoveryCheck[];
export declare function runRestoreVerification(
  client: PoolClient,
  manifest: BackupManifest,
): Promise<RecoveryVerificationResult>;
