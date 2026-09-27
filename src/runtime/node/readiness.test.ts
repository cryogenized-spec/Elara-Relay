import { describe, expect, it } from 'vitest';
import {
  createPostgresReadinessProbe,
  createReadinessGate,
  type ReadinessSqlPool,
} from './readiness';

interface FakePool extends ReadinessSqlPool { calls: number; }

function pool(options: {
  query?: () => Promise<unknown>;
  ending?: boolean;
  ended?: boolean;
} = {}): FakePool {
  const fake: FakePool = {
    ending: options.ending ?? false,
    ended: options.ended ?? false,
    calls: 0,
    query: () => {
      fake.calls += 1;
      return options.query?.() ?? Promise.resolve({ rows: [], rowCount: 1 });
    },
  };
  return fake;
}

describe('postgres readiness probe', () => {
  it('resolves only when the bounded dependency check succeeds', async () => {
    const reachable = pool({ query: () => Promise.resolve({ rowCount: 1 }) });
    await expect(createPostgresReadinessProbe(reachable, 1_000)()).resolves.toBeUndefined();
    expect(reachable.calls).toBe(1);
  });

  it('rejects safely when the dependency rejects or times out', async () => {
    const broken = pool({ query: () => Promise.reject(new Error('driver detail')) });
    await expect(createPostgresReadinessProbe(broken, 1_000)()).rejects.toThrow(
      'database unavailable',
    );

    const wedged = pool({ query: () => new Promise(() => undefined) });
    const started = Date.now();
    await expect(createPostgresReadinessProbe(wedged, 25)()).rejects.toThrow(
      'database unavailable',
    );
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('rejects a closing pool without querying it', async () => {
    for (const closing of [pool({ ending: true }), pool({ ended: true })]) {
      await expect(createPostgresReadinessProbe(closing, 1_000)()).rejects.toThrow(
        'database unavailable',
      );
      expect(closing.calls).toBe(0);
    }
  });

  it('rejects a non-positive timeout at construction', () => {
    for (const timeout of [0, -1, 1.5]) {
      expect(() => createPostgresReadinessProbe(pool({}), timeout)).toThrow(
        'readiness timeoutMs must be a positive integer',
      );
    }
  });
});

describe('readiness gate', () => {
  it('passes dependency readiness until draining and then fails closed', async () => {
    let healthy = true;
    const gate = createReadinessGate(() =>
      healthy ? Promise.resolve() : Promise.reject(new Error('unavailable')),
    );

    await expect(gate.databaseProbe()).resolves.toBeUndefined();
    healthy = false;
    await expect(gate.databaseProbe()).rejects.toThrow('unavailable');

    healthy = true;
    gate.drain();
    expect(gate.isDraining()).toBe(true);
    await expect(gate.databaseProbe()).rejects.toThrow('instance draining');
  });
});
