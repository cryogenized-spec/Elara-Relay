export interface BackupOptions {
  readonly databaseUrl: string;
  readonly outputDir: string;
  readonly migrationsDir: string;
  readonly probes?: {
    readonly eventId?: string;
    readonly mutationReceiptId?: string;
    readonly occurrenceKey?: string;
    readonly runId?: string;
    readonly chatThreadId?: string;
    readonly chatMessageId?: string;
    readonly foreignOwnerId?: string;
  };
  readonly slug?: string;
  readonly now?: Date;
  readonly env?: NodeJS.ProcessEnv;
}

export interface BackupArtifact {
  readonly dumpFile: string;
  readonly manifestFile: string;
  readonly manifest: import('./manifest.mjs').BackupManifest;
}

export declare function parseTocTableDataEntries(tocText: string): string[];
export declare function createBackup(options: BackupOptions): Promise<BackupArtifact>;
export declare function loadBackupArtifact(
  dumpFile: string,
  manifestFile: string,
): Promise<{ readonly dumpFile: string; readonly manifest: import('./manifest.mjs').BackupManifest }>;
