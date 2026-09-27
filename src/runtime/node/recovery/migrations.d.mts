export declare class RecoveryError extends Error {
  constructor(message: string);
}

export interface LoadedMigration {
  readonly file: string;
  readonly sha256: string;
  readonly sql: string;
}

export declare function defaultMigrationsDir(): string;
export declare function listMigrationFiles(
  dir: string,
  options?: { readonly fs?: { readonly readdirSync: (dir: string) => string[] } },
): string[];
export declare function loadMigrations(dir: string): LoadedMigration[];
