export interface DatabaseReadinessProbe {
  readonly database: 'up' | 'down';
  readonly schema: 'ready' | 'incomplete' | 'unknown';
}

export declare function probeDatabaseReadiness(
  connect: () => Promise<{
    query(sql: string, values?: unknown[]): Promise<unknown>;
    release(): void;
  }>,
): Promise<DatabaseReadinessProbe>;

export declare function summarizeReadiness(probe: DatabaseReadinessProbe): {
  readonly ready: boolean;
  readonly status: 'ready' | 'degraded';
};
