import type { Pool } from 'pg';

export declare function describeDatabaseLabel(databaseUrl: string): string;

export declare function withRecoveryPool<T>(
  databaseUrl: string,
  work: (pool: Pool) => Promise<T>,
  options?: { readonly max?: number },
): Promise<T>;

export declare function withChecksumSession<T>(
  client: { query(sql: string, values?: unknown[]): Promise<unknown> },
  work: () => Promise<T>,
): Promise<T>;
