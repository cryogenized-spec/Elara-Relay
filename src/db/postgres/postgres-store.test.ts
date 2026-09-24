import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../contracts/event';
import type { Job } from '../../contracts/job';
import type { MutationReceipt } from '../../contracts/mutation';
import type { Party } from '../../contracts/party';
import type { Task } from '../../contracts/task';
import { DomainNotFoundError } from '../../domain/errors';
import {
  PostgresDomainStore,
  type SqlClient,
  type SqlPool,
  type SqlQueryResult,
} from './postgres-store';

const party: Party = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Niven Naiker',
  kind: 'CUSTOMER',
  createdAt: '2026-09-24T09:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
  revision: 1,
};

const job: Job = {
  id: '20000000-0000-4000-8000-000000000002',
  key: 'JOB-20000000',
  title: 'Avenge-X regulator repair',
  category: 'ACTIVE',
  partyId: party.id,
  createdAt: '2026-09-24T09:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
  revision: 1,
};

const task: Task = {
  id: '20000000-0000-4000-8000-000000000003',
  jobId: job.id,
  title: 'Pressure test overnight',
  status: 'NEXT',
  priority: 'HIGH',
  dueAt: '2026-09-24T10:00:00.000Z',
  followUpAt: null,
  waitingOn: null,
  waitingSince: null,
  createdAt: '2026-09-24T09:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
  revision: 1,
};

const event: DomainEvent = {
  id: '20000000-0000-4000-8000-000000000004',
  mutationId: 'MUT-pg-event-0000001',
  entityType: 'TASK',
  entityId: task.id,
  eventType: 'TASK_UPDATED',
  actor: 'operator-ui',
  occurredAt: '2026-09-24T09:00:00.000Z',
  detail: null,
  changes: {
    title: {
      before: 'Pressure test',
      after: 'Pressure test overnight',
    },
  },
  revisionAfter: 1,
};

const receipt: MutationReceipt = {
  mutationId: 'MUT-pg-event-0000001',
  command: 'updateTask',
  fingerprint: '{"stable":true}',
  result: task,
  committedAt: '2026-09-24T09:00:00.000Z',
};

function partyRow() {
  return {
    id: party.id,
    name: party.name,
    kind: party.kind,
    createdAt: new Date(party.createdAt),
    updatedAt: party.updatedAt,
    revision: String(party.revision),
  };
}

function jobRow() {
  return {
    id: job.id,
    key: job.key,
    title: job.title,
    category: job.category,
    partyId: job.partyId,
    createdAt: job.createdAt,
    updatedAt: new Date(job.updatedAt),
    revision: String(job.revision),
  };
}

function taskRow() {
  return {
    id: task.id,
    jobId: task.jobId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    followUpAt: task.followUpAt,
    waitingOn: task.waitingOn,
    waitingSince: task.waitingSince,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    revision: String(task.revision),
  };
}

function eventRow() {
  return {
    id: event.id,
    mutationId: event.mutationId,
    entityType: event.entityType,
    entityId: event.entityId,
    eventType: event.eventType,
    actor: event.actor,
    occurredAt: event.occurredAt,
    detail: event.detail,
    changes: JSON.stringify(event.changes),
    revisionAfter: String(event.revisionAfter),
  };
}

function receiptRow() {
  return {
    mutationId: receipt.mutationId,
    command: receipt.command,
    fingerprint: receipt.fingerprint,
    result: JSON.stringify(receipt.result),
    committedAt: receipt.committedAt,
  };
}

class FakeClient implements SqlClient {
  public readonly queries: Array<{ sql: string; values: unknown[] }> = [];
  public released = false;

  public constructor(
    private readonly responder: (
      sql: string,
      values: unknown[],
    ) => SqlQueryResult | Promise<SqlQueryResult>,
  ) {}

  public async query(sql: string, values: unknown[] = []): Promise<SqlQueryResult> {
    this.queries.push({ sql, values });
    return this.responder(sql, values);
  }

  public release(): void {
    this.released = true;
  }
}

class FakePool implements SqlPool {
  public constructor(private readonly client: SqlClient) {}

  public connect(): Promise<SqlClient> {
    return Promise.resolve(this.client);
  }
}

function defaultResponder(sql: string): SqlQueryResult {
  const normalized = sql.replaceAll(/\\s+/g, ' ').trim().toLowerCase();

  if (normalized.includes(' from parties')) {
    return { rows: [partyRow()], rowCount: 1 };
  }
  if (normalized.includes(' from jobs')) {
    return { rows: [jobRow()], rowCount: 1 };
  }
  if (normalized.includes(' from tasks')) {
    return { rows: [taskRow()], rowCount: 1 };
  }
  if (normalized.includes(' from events')) {
    return { rows: [eventRow()], rowCount: 1 };
  }
  if (normalized.includes(' from mutation_receipts')) {
    return { rows: [receiptRow()], rowCount: 1 };
  }

  return { rows: [], rowCount: 1 };
}

describe('PostgresDomainStore', () => {
  it('uses a consistent read-only snapshot and maps every core row type', async () => {
    const client = new FakeClient((sql) => defaultResponder(sql));
    const store = new PostgresDomainStore(new FakePool(client));

    const result = await store.read(async (read) => {
      const [
        oneParty,
        oneJob,
        oneTask,
        oneReceipt,
        parties,
        jobs,
        tasks,
        events,
      ] = await Promise.all([
        read.getParty(party.id),
        read.getJob(job.id),
        read.getTask(task.id),
        read.getMutationReceipt(receipt.mutationId),
        read.listParties(),
        read.listJobs(),
        read.listTasks(),
        read.listEvents(),
      ]);

      return {
        oneParty,
        oneJob,
        oneTask,
        oneReceipt,
        parties,
        jobs,
        tasks,
        events,
      };
    });

    expect(result.oneParty).toEqual(party);
    expect(result.oneJob).toEqual(job);
    expect(result.oneTask).toEqual(task);
    expect(result.oneReceipt).toEqual(receipt);
    expect(result.parties).toEqual([party]);
    expect(result.jobs).toEqual([job]);
    expect(result.tasks).toEqual([task]);
    expect(result.events).toEqual([event]);

    expect(client.queries[0]?.sql.toLowerCase()).toContain(
      'begin isolation level repeatable read read only',
    );
    expect(client.queries.at(-1)?.sql.toLowerCase()).toBe('commit');
    expect(
      client.queries
        .filter((query) => query.sql.toLowerCase().includes('select'))
        .some((query) => query.sql.toLowerCase().includes('for update')),
    ).toBe(false);
    expect(client.released).toBe(true);
  });

  it('locks mutation ids and mutable rows inside write transactions', async () => {
    const client = new FakeClient((sql) => defaultResponder(sql));
    const store = new PostgresDomainStore(new FakePool(client));

    await store.transact(async (transaction) => {
      expect(await transaction.getMutationReceipt(receipt.mutationId)).toEqual(
        receipt,
      );
      expect(await transaction.getParty(party.id)).toEqual(party);
      expect(await transaction.getJob(job.id)).toEqual(job);
      expect(await transaction.getTask(task.id)).toEqual(task);

      await transaction.insertParty(party);
      await transaction.updateParty({ ...party, revision: 2 });
      await transaction.insertJob(job);
      await transaction.updateJob({ ...job, revision: 2 });
      await transaction.insertTask(task);
      await transaction.updateTask({ ...task, revision: 2 });
      await transaction.appendEvent(event);
      await transaction.saveMutationReceipt(receipt);
    });

    const sql = client.queries.map((query) =>
      query.sql.replaceAll(/\\s+/g, ' ').trim().toLowerCase(),
    );
    expect(sql[0]).toBe('begin');
    expect(sql.some((query) => query.includes('pg_advisory_xact_lock'))).toBe(
      true,
    );
    expect(sql.filter((query) => query.includes('for update')).length).toBe(3);
    expect(sql.at(-1)).toBe('commit');
    expect(client.released).toBe(true);
  });

  it('returns undefined for missing point reads', async () => {
    const client = new FakeClient((sql) => {
      const normalized = sql.replaceAll(/\s+/g, ' ').trim().toLowerCase();
      if (
        normalized.includes(' where id = $1') ||
        normalized.includes(' where mutation_id = $1')
      ) {
        return { rows: [], rowCount: 0 };
      }
      return defaultResponder(sql);
    });
    const store = new PostgresDomainStore(new FakePool(client));

    await store.read(async (read) => {
      expect(await read.getParty(party.id)).toBeUndefined();
      expect(await read.getJob(job.id)).toBeUndefined();
      expect(await read.getTask(task.id)).toBeUndefined();
      expect(
        await read.getMutationReceipt(receipt.mutationId),
      ).toBeUndefined();
    });
  });

  it('rolls back failed transactions and always releases the connection', async () => {
    const client = new FakeClient((sql) => defaultResponder(sql));
    const store = new PostgresDomainStore(new FakePool(client));

    await expect(
      store.transact(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(
      client.queries.map((query) => query.sql.toLowerCase().trim()),
    ).toEqual(['begin', 'rollback']);
    expect(client.released).toBe(true);
  });

  it('rejects updates that no longer target a row', async () => {
    const client = new FakeClient((sql) => {
      if (sql.toLowerCase().includes('update tasks')) {
        return { rows: [], rowCount: 0 };
      }
      return defaultResponder(sql);
    });
    const store = new PostgresDomainStore(new FakePool(client));

    await expect(
      store.transact(async (transaction) => {
        await transaction.updateTask(task);
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);

    expect(
      client.queries.some((query) => query.sql.toLowerCase().trim() === 'rollback'),
    ).toBe(true);
    expect(client.released).toBe(true);
  });

  it('reports rollback failure without hiding the original failure', async () => {
    const client = new FakeClient((sql) => {
      if (sql.toLowerCase().trim() === 'rollback') {
        throw new Error('rollback failed');
      }
      return defaultResponder(sql);
    });
    const store = new PostgresDomainStore(new FakePool(client));

    await expect(
      store.transact(() => {
        throw new Error('original failure');
      }),
    ).rejects.toBeInstanceOf(AggregateError);
    expect(client.released).toBe(true);
  });
});
