export interface RecoveryStatusSnapshot {
  status: 'VERIFIED' | 'FAILED' | 'UNVERIFIED';
  verifiedAt?: string;
  failures?: readonly string[];
  artifact?: {
    dumpFile: string;
    dumpSha256: string;
    manifestSha256: string;
  };
}

export interface RecoveryReportFilesystem {
  readonly readFile: (
    file: string,
    encoding: 'utf8',
  ) => Promise<string>;
  readonly stat: (file: string) => Promise<{ readonly mtimeMs: number }>;
}

export declare const RECOVERY_REPORT_PATH_ENV: string;
export declare function readRecoveryReportPath(
  env: NodeJS.ProcessEnv,
): string | undefined;
export declare function createFileRecoveryStatusProvider(
  reportPath: string,
  options?: { readonly fs?: RecoveryReportFilesystem },
): () => Promise<RecoveryStatusSnapshot>;
