export declare const MANIFEST_FORMAT_VERSION: 1;
export declare const MANIFEST_KIND: 'elara-recovery-backup';
export declare const REPORT_KIND: 'elara-recovery-verification';
export declare const REPORT_FORMAT_VERSION: 1;

export interface BackupManifest {
  readonly kind: 'elara-recovery-backup';
  readonly formatVersion: 1;
  readonly createdAt: string;
  readonly toolVersions: {
    readonly pgDump: string;
    readonly server: string;
  };
  readonly source: {
    readonly label: string;
  };
  readonly migrations: readonly {
    readonly file: string;
    readonly sha256: string;
  }[];
  readonly tables: readonly {
    readonly name: string;
    readonly rowCount: number;
    readonly checksum: string;
  }[];
  readonly artifact: {
    readonly file: string;
    readonly bytes: number;
    readonly sha256: string;
  };
  readonly probes?: {
    readonly eventId?: string;
    readonly mutationReceiptId?: string;
    readonly occurrenceKey?: string;
    readonly runId?: string;
    readonly chatThreadId?: string;
    readonly chatMessageId?: string;
    readonly foreignOwnerId?: string;
  };
}

export interface RecoveryVerificationReport {
  readonly kind: 'elara-recovery-verification';
  readonly formatVersion: 1;
  readonly verifiedAt: string;
  readonly artifact: {
    readonly dumpFile: string;
    readonly dumpSha256: string;
    readonly manifestSha256: string;
  };
  readonly result: {
    readonly passed: boolean;
    readonly checksTotal: number;
    readonly checksPassed: number;
    readonly failures: readonly string[];
  };
  readonly digestSummary: Readonly<Record<string, number>>;
  readonly target: {
    readonly label: string;
  };
}

export declare function validateManifest(candidate: unknown): BackupManifest;
export declare function validateVerificationReport(
  candidate: unknown,
): RecoveryVerificationReport;
export declare function serializeManifest(manifest: BackupManifest): string;
export declare function parseManifest(text: string): BackupManifest;
