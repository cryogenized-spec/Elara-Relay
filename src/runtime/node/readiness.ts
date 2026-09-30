/**
 * Production database readiness and drain boundary.
 *
 * The API owns the public /health/ready contract. This runtime supplies the
 * bounded database probe consumed by that existing authority.
 */
export interface ReadinessSqlPool {
  readonly ending: boolean;
  readonly ended: boolean;
  query(sql: string): Promise<unknown>;
}

export type DatabaseReadinessProbe = () => Promise<void>;

export function createPostgresReadinessProbe(
  pool: ReadinessSqlPool,
  timeoutMs: number,
): DatabaseReadinessProbe {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('readiness timeoutMs must be a positive integer');
  }

  return async () => {
    if (pool.ending || pool.ended) throw new Error('database unavailable');

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        pool.query('select 1').then(
          () => 'reachable' as const,
          () => 'unreachable' as const,
        ),
        new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), timeoutMs);
        }),
      ]);
      if (outcome !== 'reachable') throw new Error('database unavailable');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}

export interface ReadinessGate {
  readonly databaseProbe: DatabaseReadinessProbe;
  drain(): void;
  isDraining(): boolean;
}

export function createReadinessGate(
  dependency: DatabaseReadinessProbe,
): ReadinessGate {
  let draining = false;

  return {
    databaseProbe: async () => {
      if (draining) throw new Error('instance draining');
      await dependency();
    },
    drain(): void {
      draining = true;
    },
    isDraining(): boolean {
      return draining;
    },
  };
}
