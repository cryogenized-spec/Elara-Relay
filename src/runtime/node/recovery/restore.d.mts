import type { BackupManifest, RecoveryVerificationReport } from './manifest.mjs';
import type { RecoveryVerificationResult } from './verify.mjs';

export interface RestoreOptions {
  readonly databaseUrl: string;
  readonly dumpFile: string;
  readonly manifest: BackupManifest;
  readonly replaceTarget?: boolean;
  readonly reportPath?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: Date;
}

export declare function restoreBackup(options: RestoreOptions): Promise<{
  readonly report: RecoveryVerificationReport;
  readonly verification: RecoveryVerificationResult;
}>;
