import { eventSchema, type DomainEvent } from '../../contracts/event';
import { jobSchema, type Job } from '../../contracts/job';
import {
  mutationReceiptSchema,
  type MutationReceipt,
} from '../../contracts/mutation';
import { partySchema, type Party } from '../../contracts/party';
import { taskSchema, type Task } from '../../contracts/task';
import { DomainNotFoundError } from '../../domain/errors';
import type {
  DomainRead,
  DomainStore,
  DomainTransaction,
  MaybePromise,
} from '../../domain/store';

export interface SqlQueryResult {
  rows: unknown[];
  rowCount: number | null;
}

export interface SqlClient {
  query(sql: string, values?: unknown[]): Promise<SqlQueryResult>;
  release(): void;
}

export interface SqlPool {
  connect(): Promise<SqlClient>;
}

function rowRecord(row: unknown): Record<string, unknown> {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    throw new TypeError('Database row must be an object');
  }
  return row as Record<string, unknown>;
}

function timestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  throw new TypeError('Database timestamp is invalid');
}

function integer(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed)) {
    throw new TypeError('Database integer is outside the safe range');
  }
  return parsed;
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return JSON.parse(value) as unknown;
}

function mapParty(row: unknown): Party {
  const value = rowRecord(row);
  return partySchema.parse({
    id: value['id'],
    name: value['name'],
    kind: value['kind'],
    createdAt: timestamp(value['createdAt']),
    updatedAt: timestamp(value['updatedAt']),
    revision: integer(value['revision']),
  });
}

function mapJob(row: unknown): Job {
  const value = rowRecord(row);
  return jobSchema.parse({
    id: value['id'],
    key: value['key'],
    title: value['title'],
    category: value['category'],
    partyId: value['partyId'] ?? null,
    createdAt: timestamp(value['createdAt']),
    updatedAt: timestamp(value['updatedAt']),
    revision: integer(value['revision']),
  });
}

function mapTask(row: unknown): Task {
  const value = rowRecord(row);
  return taskSchema.parse({
    id: value['id'],
    jobId: value['jobId'] ?? null,
    title: value['title'],
    status: value['status'],
    priority: value['priority'],
    dueAt: value['dueAt'] === null ? null : timestamp(value['dueAt']),
    followUpAt: value['followUpAt'] === null ? null : timestamp(value['followUpAt']),
    waitingOn: value['waitingOn'] ?? null,
    waitingSince:
      value['waitingSince'] === null ? null : timestamp(value['waitingSince']),
    createdAt: timestamp(value['createdAt']),
    updatedAt: timestamp(value['updatedAt']),
    revision: integer(value['revision']),
  });
}

function mapEvent(row: unknown): DomainEvent {
  const value = rowRecord(row);
  return eventSchema.parse({
    id: value['id'],
    mutationId: value['mutationId'],
    entityType: value['entityType'],
    entityId: value['entityId'],
    eventType: value['eventType'],
    actor: value['actor'],
    occurredAt: timestamp(value['occurredAt']),
    detail: value['detail'] ?? null,
    changes: jsonValue(value['changes']),
    revisionAfter: integer(value['revisionAfter']),
  });
}

function mapReceipt(row: unknown): MutationReceipt {
  const value = rowRecord(row);
  return mutationReceiptSchema.parse({
    mutationId: value['mutationId'],
    command: value['command'],
    fingerprint: value['fingerprint'],
    result: jsonValue(value['result']),
    committedAt: timestamp(value['committedAt']),
  });
}

const PARTY_SELECT = `
  select
    id::text as "id",
    name,
    kind,
    created_at as "createdAt",
    updated_at as "updatedAt",
    revision::text as "revision"
  from parties
`;

const JOB_SELECT = `
  select
    id::text as "id",
    job_key as "key",
    title,
    category,
    party_id::text as "partyId",
    created_at as "createdAt",
    updated_at as "updatedAt",
    revision::text as "revision"
  from jobs
`;

const TASK_SELECT = `
  select
    id::text as "id",
    job_id::text as "jobId",
    title,
    status,
    priority,
    due_at as "dueAt",
    follow_up_at as "followUpAt",
    waiting_on as "waitingOn",
    waiting_since as "waitingSince",
    created_at as "createdAt",
    updated_at as "updatedAt",
    revision::text as "revision"
  from tasks
`;

const EVENT_SELECT = `
  select
    id::text as "id",
    mutation_id as "mutationId",
    entity_type as "entityType",
    entity_id::text as "entityId",
    event_type as "eventType",
    actor,
    occurred_at as "occurredAt",
    detail,
    changes,
    revision_after::text as "revisionAfter"
  from events
`;

const RECEIPT_SELECT = `
  select
    mutation_id as "mutationId",
    command,
    fingerprint,
    result,
    committed_at as "committedAt"
  from mutation_receipts
`;

class PostgresRead implements DomainRead {
  public constructor(
    protected readonly client: SqlClient,
    private readonly lockRows: boolean,
  ) {}

  public async getParty(id: string): Promise<Party | undefined> {
    const result = await this.client.query(
      `${PARTY_SELECT} where id = $1${this.lockRows ? ' for update' : ''}`,
      [id],
    );
    return result.rows[0] === undefined ? undefined : mapParty(result.rows[0]);
  }

  public async getJob(id: string): Promise<Job | undefined> {
    const result = await this.client.query(
      `${JOB_SELECT} where id = $1${this.lockRows ? ' for update' : ''}`,
      [id],
    );
    return result.rows[0] === undefined ? undefined : mapJob(result.rows[0]);
  }

  public async getTask(id: string): Promise<Task | undefined> {
    const result = await this.client.query(
      `${TASK_SELECT} where id = $1${this.lockRows ? ' for update' : ''}`,
      [id],
    );
    return result.rows[0] === undefined ? undefined : mapTask(result.rows[0]);
  }

  public async getMutationReceipt(
    mutationId: string,
  ): Promise<MutationReceipt | undefined> {
    const result = await this.client.query(
      `${RECEIPT_SELECT} where mutation_id = $1`,
      [mutationId],
    );
    return result.rows[0] === undefined
      ? undefined
      : mapReceipt(result.rows[0]);
  }

  public async listParties(): Promise<Party[]> {
    const result = await this.client.query(`${PARTY_SELECT} order by name, id`);
    return result.rows.map(mapParty);
  }

  public async listJobs(): Promise<Job[]> {
    const result = await this.client.query(
      `${JOB_SELECT} order by updated_at desc, id`,
    );
    return result.rows.map(mapJob);
  }

  public async listTasks(): Promise<Task[]> {
    const result = await this.client.query(
      `${TASK_SELECT} order by updated_at desc, id`,
    );
    return result.rows.map(mapTask);
  }

  public async listEvents(): Promise<DomainEvent[]> {
    const result = await this.client.query(
      `${EVENT_SELECT} order by occurred_at, id`,
    );
    return result.rows.map(mapEvent);
  }
}

class PostgresTransaction
  extends PostgresRead
  implements DomainTransaction
{
  public constructor(client: SqlClient) {
    super(client, true);
  }

  public override async getMutationReceipt(
    mutationId: string,
  ): Promise<MutationReceipt | undefined> {
    await this.client.query(
      'select pg_advisory_xact_lock(hashtextextended($1, 0))',
      [mutationId],
    );
    return super.getMutationReceipt(mutationId);
  }

  public async insertParty(party: Party): Promise<void> {
    await this.client.query(
      `insert into parties
        (id, name, kind, created_at, updated_at, revision)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        party.id,
        party.name,
        party.kind,
        party.createdAt,
        party.updatedAt,
        party.revision,
      ],
    );
  }

  public async updateParty(party: Party): Promise<void> {
    const result = await this.client.query(
      `update parties
       set name = $2, kind = $3, updated_at = $4, revision = $5
       where id = $1`,
      [party.id, party.name, party.kind, party.updatedAt, party.revision],
    );
    this.requireUpdated(result, 'Party', party.id);
  }

  public async insertJob(job: Job): Promise<void> {
    await this.client.query(
      `insert into jobs
        (id, job_key, title, category, party_id, created_at, updated_at, revision)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        job.id,
        job.key,
        job.title,
        job.category,
        job.partyId,
        job.createdAt,
        job.updatedAt,
        job.revision,
      ],
    );
  }

  public async updateJob(job: Job): Promise<void> {
    const result = await this.client.query(
      `update jobs
       set job_key = $2, title = $3, category = $4, party_id = $5,
           updated_at = $6, revision = $7
       where id = $1`,
      [
        job.id,
        job.key,
        job.title,
        job.category,
        job.partyId,
        job.updatedAt,
        job.revision,
      ],
    );
    this.requireUpdated(result, 'Job', job.id);
  }

  public async insertTask(task: Task): Promise<void> {
    await this.client.query(
      `insert into tasks
        (id, job_id, title, status, priority, due_at, follow_up_at,
         waiting_on, waiting_since, created_at, updated_at, revision)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        task.id,
        task.jobId,
        task.title,
        task.status,
        task.priority,
        task.dueAt,
        task.followUpAt,
        task.waitingOn,
        task.waitingSince,
        task.createdAt,
        task.updatedAt,
        task.revision,
      ],
    );
  }

  public async updateTask(task: Task): Promise<void> {
    const result = await this.client.query(
      `update tasks
       set job_id = $2, title = $3, status = $4, priority = $5,
           due_at = $6, follow_up_at = $7, waiting_on = $8,
           waiting_since = $9, updated_at = $10, revision = $11
       where id = $1`,
      [
        task.id,
        task.jobId,
        task.title,
        task.status,
        task.priority,
        task.dueAt,
        task.followUpAt,
        task.waitingOn,
        task.waitingSince,
        task.updatedAt,
        task.revision,
      ],
    );
    this.requireUpdated(result, 'Task', task.id);
  }

  public async appendEvent(event: DomainEvent): Promise<void> {
    await this.client.query(
      `insert into events
        (id, mutation_id, entity_type, entity_id, event_type, actor,
         occurred_at, detail, changes, revision_after)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
      [
        event.id,
        event.mutationId,
        event.entityType,
        event.entityId,
        event.eventType,
        event.actor,
        event.occurredAt,
        event.detail,
        JSON.stringify(event.changes),
        event.revisionAfter,
      ],
    );
  }

  public async saveMutationReceipt(receipt: MutationReceipt): Promise<void> {
    await this.client.query(
      `insert into mutation_receipts
        (mutation_id, command, fingerprint, result, committed_at)
       values ($1, $2, $3, $4::jsonb, $5)`,
      [
        receipt.mutationId,
        receipt.command,
        receipt.fingerprint,
        JSON.stringify(receipt.result),
        receipt.committedAt,
      ],
    );
  }

  private requireUpdated(
    result: SqlQueryResult,
    entity: string,
    id: string,
  ): void {
    if (result.rowCount !== 1) {
      throw new DomainNotFoundError(entity, id);
    }
  }
}

async function rollback(
  client: SqlClient,
  originalError: unknown,
): Promise<never> {
  try {
    await client.query('rollback');
  } catch (rollbackError) {
    throw new AggregateError(
      [originalError, rollbackError],
      'Database transaction and rollback both failed',
      { cause: rollbackError },
    );
  }
  throw originalError;
}

export class PostgresDomainStore implements DomainStore {
  public constructor(private readonly pool: SqlPool) {}

  public async transact<T>(
    work: (transaction: DomainTransaction) => MaybePromise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      try {
        const result = await work(new PostgresTransaction(client));
        await client.query('commit');
        return result;
      } catch (error) {
        return await rollback(client, error);
      }
    } finally {
      client.release();
    }
  }

  public async read<T>(
    work: (read: DomainRead) => MaybePromise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      try {
        const result = await work(new PostgresRead(client, false));
        await client.query('commit');
        return result;
      } catch (error) {
        return await rollback(client, error);
      }
    } finally {
      client.release();
    }
  }
}
