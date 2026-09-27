import type { ReadinessProbe } from '../../api/readiness';

/**
 * Readiness boundary.
 *
 * Liveness (`/health`) answers "is this process serving?" and never touches a
 * dependency. Readiness (`/ready`) answers "should a gateway route traffic
 * here?" and is the only endpoint allowed to observe PostgreSQL.
 *
 * Both answers are coarse by contract: a readiness response carries a fixed
 * status word and nothing else. Hostnames, driver messages, query text, and
 * stack traces stay server-side so an unauthenticated probe can never become
 * an infrastructure disclosure channel.
 */

/**
 * Minimal PostgreSQL surface a readiness check may use.
 *
 * Declared structurally rather than as `Pick<Pool, ...>` so the probe depends
 * on the two facts it actually needs — pool lifecycle state and a bounded
 * round trip — and stays testable without a driver instance.
 */
export interface ReadinessSqlPool {
  readonly ending: boolean;
  readonly ended: boolean;
  query(sql: string): Promise<unknown>;
}

/**
 * Bound a dependency check so a wedged database cannot pin a probe worker.
 *
 * The query is raced against a timer rather than cancelled: `pg` has no
 * per-query abort signal, and abandoning the race is enough to answer the
 * probe. The pool's own statement and connection timeouts remain the
 * authority that eventually reclaims the connection.
 */
export function createPostgresReadinessProbe(
  pool: ReadinessSqlPool,
  timeoutMs: number,
): ReadinessProbe {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('readiness timeoutMs must be a positive integer');
  }

  return {
    async check(): Promise<boolean> {
      // A closing or closed pool can never serve new work.
      if (pool.ending || pool.ended) return false;

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
        return outcome === 'reachable';
      } catch {
        return false;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  };
}

export interface ReadinessGate {
  /** Probe to hand to the API surface. */
  readonly probe: ReadinessProbe;
  /** Stop reporting ready while in-flight requests continue to be served. */
  drain(): void;
  isDraining(): boolean;
}

/**
 * Lifecycle wrapper around a dependency probe.
 *
 * Draining is what makes a rolling deploy and a rollback non-lossy: the
 * instance reports not-ready the moment it receives a termination signal, so
 * the gateway stops sending new work before connections are drained.
 */
export function createReadinessGate(
  dependency: ReadinessProbe,
): ReadinessGate {
  let draining = false;

  return {
    probe: {
      async check(): Promise<boolean> {
        if (draining) return false;
        // A probe must answer, never throw: an exploding dependency check is
        // itself proof that the instance is not ready.
        try {
          return await dependency.check();
        } catch {
          return false;
        }
      },
    },
    drain(): void {
      draining = true;
    },
    isDraining(): boolean {
      return draining;
    },
  };
}
