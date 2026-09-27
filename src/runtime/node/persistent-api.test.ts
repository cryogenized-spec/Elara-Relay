import { describe, expect, it } from 'vitest';
import type { AuthIdentity, AuthVerifier } from '../../auth/auth-verifier';
import type { MemoryProvider } from '../../ai/memory-provider';
import { OptionalMemoryProvider } from '../../ai/optional-memory';
import type {
  SqlPool,
  SqlQueryResult,
} from '../../db/postgres/postgres-store';
import type { SafeLogEvent, StructuredLogger } from '../../observability/logger';
import type { NodePostgresResources } from './postgres-pool';
import { createPersistentApiFromResources } from './persistent-api';

const identity: AuthIdentity = {
  userId: '550e8400-e29b-41d4-a716-446655440000',
  sessionId: '550e8400-e29b-41d4-a716-446655440001',
  email: null,
  aal: 'aal1',
};

const verifier: AuthVerifier = {
  verify: () => Promise.resolve(identity),
};

function makeResources(
  query: (sql: string) => Promise<SqlQueryResult>,
) {
  const queries: string[] = [];
  let releases = 0;
  const sqlPool: SqlPool = {
    connect: () =>
      Promise.resolve({
        query: (sql: string) => {
          queries.push(sql);
          return query(sql);
        },
        release: () => {
          releases += 1;
        },
      }),
  };
  const resources: NodePostgresResources = {
    sqlPool,
    rawPool: {} as NodePostgresResources['rawPool'],
    close: () => Promise.resolve(),
  };
  return {
    resources,
    queries,
    get releases() {
      return releases;
    },
  };
}

const memoryRecall = {
  query: 'reminder context',
  scope: { ownerId: identity.userId, tags: [] },
  maxTokens: 100,
};

describe('persistent API observability assembly', () => {
  it('probes PostgreSQL with a constant-only query and reports safe readiness', async () => {
    const resources = makeResources(() =>
      Promise.resolve({
        rows: [{ privateValue: 'not exposed' }],
        rowCount: 1,
      }),
    );
    const runtime = createPersistentApiFromResources(
      resources.resources,
      verifier,
      [],
      undefined,
      {
        buildInfo: { version: '1.2.3', buildSha: 'abcdef0123456789' },
        schedulerProbe: () => Promise.resolve('operational'),
      },
    );

    const response = await runtime.app.request('/health/ready');
    expect(response.status).toBe(200);
    const responseBody: unknown = await response.json();
    expect(responseBody).toEqual({
      service: 'elara-relay',
      status: 'ready',
      version: '1.2.3',
      buildSha: 'abcdef0123456789',
      schemaVersion: 1,
      checks: {
        database: 'available',
        authentication: 'valid',
        scheduler: 'operational',
        optionalProviders: { memory: 'disabled' },
      },
    });
    expect(JSON.stringify(responseBody)).not.toContain('not exposed');
    expect(resources.queries).toEqual(['SELECT 1']);
    expect(resources.releases).toBe(1);
    await runtime.close();
  });

  it('reports an enabled optional provider as configured without probing it', async () => {
    const resources = makeResources(() =>
      Promise.resolve({ rows: [], rowCount: 1 }),
    );
    const configuredMemory = new OptionalMemoryProvider(
      {
        retain: () => Promise.resolve(),
        recall: () =>
          Promise.resolve({
            hits: [],
            truncated: false,
          }),
      },
      () => undefined,
    );
    const runtime = createPersistentApiFromResources(
      resources.resources,
      verifier,
      [],
      configuredMemory,
      { buildInfo: { version: '1.2.3', buildSha: 'abcdef0123456789' } },
    );

    const response = await runtime.app.request('/health/ready');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ready',
      checks: { optionalProviders: { memory: 'configured' } },
    });
    await runtime.close();
  });

  it('keeps optional memory failure isolated and excludes provider errors from health/logs', async () => {
    const secret =
      'postgresql://operator:db-password@db.example.test/private eyJhbGciOiJIUzI1NiJ9.private.jwt';
    const resources = makeResources(() =>
      Promise.resolve({ rows: [{ secret }], rowCount: 1 }),
    );
    const events: SafeLogEvent[] = [];
    const logger: StructuredLogger = {
      log: (event) => events.push(event),
    };
    const failingMemory: MemoryProvider = {
      retain: () => Promise.reject(new Error(secret)),
      recall: () => Promise.reject(new Error(secret)),
    };
    const optionalMemory = new OptionalMemoryProvider(
      failingMemory,
      (operation, code) => {
        events.push({
          event: 'optional_provider.failure',
          provider: 'memory',
          operation,
          code,
        });
      },
    );
    const runtime = createPersistentApiFromResources(
      resources.resources,
      verifier,
      [],
      optionalMemory,
      {
        logger,
        buildInfo: { version: '1.2.3', buildSha: 'abcdef0123456789' },
      },
    );

    await expect(optionalMemory.recall(memoryRecall)).resolves.toEqual({
      hits: [],
      truncated: false,
    });
    expect(optionalMemory.healthStatus).toBe('unavailable');

    const response = await runtime.app.request('/health/ready');
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      status: 'ready',
      checks: {
        database: 'available',
        authentication: 'valid',
        optionalProviders: { memory: 'unavailable' },
      },
    });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(events)).not.toContain(secret);
    await runtime.close();
  });

  it('marks database reachability degraded without returning raw driver errors', async () => {
    const secret =
      'postgresql://operator:db-password@db.example.test/private';
    const resources = makeResources(() => Promise.reject(new Error(secret)));
    const events: SafeLogEvent[] = [];
    const runtime = createPersistentApiFromResources(
      resources.resources,
      verifier,
      [],
      undefined,
      {
        logger: { log: (event) => events.push(event) },
        buildInfo: { version: '1.2.3', buildSha: 'abcdef0123456789' },
      },
    );

    const response = await runtime.app.request('/health/ready');
    expect(response.status).toBe(503);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      status: 'not_ready',
      checks: { database: 'unavailable', authentication: 'valid' },
    });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(events)).not.toContain(secret);
    expect(resources.releases).toBe(1);
    await runtime.close();
  });
});
