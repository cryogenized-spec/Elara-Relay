import { describe, expect, it } from 'vitest';
import {
  createPostgresReadinessProbe,
  createReadinessGate,
  type ReadinessSqlPool,
} from './readiness';

interface FakePool extends ReadinessSqlPool {
  calls: number;
}

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
  it('reports ready only when the bounded dependency check succeeds', async () => {
    const reachable = pool({ query: () => Promise.resolve({ rowCount: 1 }) });
    await expect(
      createPostgresReadinessProbe(reachable, 1_000).check(),
    ).resolves.toBe(true);
    expect(reachable.calls).toBe(1);
  });

  it('reports unavailable when the dependency rejects', async () => {
    const broken = pool({
      query: () => Promise.reject(new Error('password authentication failed')),
    });
    await expect(
      createPostgresReadinessProbe(broken, 1_000).check(),
    ).resolves.toBe(false);
  });

  it('reports unavailable instead of stalling when the check times out', async () => {
    const wedged = pool({ query: () => new Promise(() => undefined) });
    const started = Date.now();
    await expect(
      createPostgresReadinessProbe(wedged, 25).check(),
    ).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('reports unavailable for a closing pool without querying it', async () => {
    for (const closing of [
      pool({ ending: true }),
      pool({ ended: true }),
    ]) {
      await expect(
        createPostgresReadinessProbe(closing, 1_000).check(),
      ).resolves.toBe(false);
      expect(closing.calls).toBe(0);
    }
  });

  it('rejects a non-positive timeout at construction', () => {
    for (const timeout of [0, -1, 1.5]) {
      expect(() =>
        createPostgresReadinessProbe(pool({}), timeout),
      ).toThrow('readiness timeoutMs must be a positive integer');
    }
  });
});

describe('readiness gate', () => {
  it('reports the dependency state until the instance starts draining', async () => {
    let healthy = true;
    const dependency = {
      check: () => Promise.resolve(healthy),
    };
    const gate = createReadinessGate(dependency);

    await expect(gate.probe.check()).resolves.toBe(true);
    expect(gate.isDraining()).toBe(false);

    healthy = false;
    await expect(gate.probe.check()).resolves.toBe(false);

    healthy = true;
    gate.drain();
    expect(gate.isDraining()).toBe(true);
    // A draining instance must never accept traffic again, even if the
    // dependency recovers mid-shutdown.
    await expect(gate.probe.check()).resolves.toBe(false);
    expect(gate.drain()).toBeUndefined();
  });

  it('reports unavailable when the dependency probe throws', async () => {
    const gate = createReadinessGate({
      check: () => Promise.reject(new Error('probe exploded')),
    });
    await expect(gate.probe.check()).resolves.toBe(false);
  });
});
