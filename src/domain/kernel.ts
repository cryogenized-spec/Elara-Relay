import { eventSchema, type DomainEvent, type FieldChange } from '../contracts/event';
import {
  createJobInputSchema,
  type CreateJobInput,
  type Job,
} from '../contracts/job';
import {
  mutationContextSchema,
  mutationReceiptSchema,
  versionedMutationContextSchema,
  type MutationContext,
  type VersionedMutationContext,
} from '../contracts/mutation';
import {
  createPartyInputSchema,
  type CreatePartyInput,
  type Party,
} from '../contracts/party';
import { entityIdSchema, timestampSchema } from '../contracts/shared';
import {
  createTaskInputSchema,
  markTaskWaitingInputSchema,
  taskSchema,
  updateTaskPatchSchema,
  type CreateTaskInput,
  type MarkTaskWaitingInput,
  type Task,
  type UpdateTaskPatch,
} from '../contracts/task';
import { canonicalJson } from './canonical-json';
import {
  DomainNotFoundError,
  DomainValidationError,
  MutationReplayMismatchError,
} from './errors';
import { nextRevision } from './revision';
import type { DomainStore, DomainTransaction, MaybePromise } from './store';

export interface JobView {
  job: Job;
  tasks: Task[];
  events: DomainEvent[];
}

export interface TodayResult {
  asOf: string;
  tasks: Task[];
}

export interface SearchResult {
  parties: Party[];
  jobs: Job[];
  tasks: Task[];
  events: DomainEvent[];
}

export interface KernelOptions {
  clock?: () => string;
  idGenerator?: () => string;
}

function toJobKey(id: string): string {
  return `JOB-${id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

function comparable(value: unknown): string {
  return canonicalJson(value);
}

export class DomainKernel {
  private readonly clock: () => string;
  private readonly idGenerator: () => string;

  public constructor(
    private readonly store: DomainStore,
    options: KernelOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
  }

  public async createParty(
    rawContext: MutationContext,
    rawInput: CreatePartyInput,
  ): Promise<Party> {
    const context = mutationContextSchema.parse(rawContext);
    const input = createPartyInputSchema.parse(rawInput);

    return this.executeOnce(context, 'createParty', input, async (transaction) => {
      const now = this.now();
      const party: Party = {
        id: this.newId(),
        name: input.name,
        kind: input.kind,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      };

      await transaction.insertParty(party);
      await transaction.appendEvent(
        this.makeEvent(context, {
          entityType: 'PARTY',
          entityId: party.id,
          eventType: 'PARTY_CREATED',
          detail: null,
          changes: {},
          revisionAfter: party.revision,
        }),
      );
      return party;
    });
  }

  public async createJob(
    rawContext: MutationContext,
    rawInput: CreateJobInput,
  ): Promise<Job> {
    const context = mutationContextSchema.parse(rawContext);
    const input = createJobInputSchema.parse(rawInput);

    return this.executeOnce(context, 'createJob', input, async (transaction) => {
      if (input.partyId !== null && (await transaction.getParty(input.partyId)) === undefined) {
        throw new DomainNotFoundError('Party', input.partyId);
      }

      const now = this.now();
      const id = this.newId();
      const job: Job = {
        id,
        key: toJobKey(id),
        title: input.title,
        category: input.category,
        partyId: input.partyId,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      };

      await transaction.insertJob(job);
      await transaction.appendEvent(
        this.makeEvent(context, {
          entityType: 'JOB',
          entityId: job.id,
          eventType: 'JOB_CREATED',
          detail: null,
          changes: {},
          revisionAfter: job.revision,
        }),
      );
      return job;
    });
  }

  public async createTask(
    rawContext: MutationContext,
    rawInput: CreateTaskInput,
  ): Promise<Task> {
    const context = mutationContextSchema.parse(rawContext);
    const input = createTaskInputSchema.parse(rawInput);

    return this.executeOnce(context, 'createTask', input, async (transaction) => {
      if (input.jobId !== null && (await transaction.getJob(input.jobId)) === undefined) {
        throw new DomainNotFoundError('Job', input.jobId);
      }

      const now = this.now();
      const task: Task = {
        id: this.newId(),
        jobId: input.jobId,
        title: input.title,
        status: 'INBOX',
        priority: input.priority,
        dueAt: input.dueAt,
        followUpAt: input.followUpAt,
        waitingOn: null,
        waitingSince: null,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      };

      await transaction.insertTask(task);
      await transaction.appendEvent(
        this.makeEvent(context, {
          entityType: 'TASK',
          entityId: task.id,
          eventType: 'TASK_CREATED',
          detail: null,
          changes: {},
          revisionAfter: task.revision,
        }),
      );
      return task;
    });
  }

  public async updateTask(
    rawContext: VersionedMutationContext,
    taskId: string,
    rawPatch: UpdateTaskPatch,
  ): Promise<Task> {
    const context = versionedMutationContextSchema.parse(rawContext);
    const id = entityIdSchema.parse(taskId);
    const patch = updateTaskPatchSchema.parse(rawPatch);

    return this.executeOnce(
      { mutationId: context.mutationId, actor: context.actor },
      'updateTask',
      { expectedRevision: context.expectedRevision, taskId: id, patch },
      async (transaction) => {
        const current = await this.requireTask(transaction, id);
        const revision = nextRevision(current.revision, context.expectedRevision);
        const now = this.now();
        const leavesWaiting =
          patch.status !== undefined && patch.status !== 'WAITING';
        const next = taskSchema.parse({
          ...current,
          ...patch,
          waitingOn: leavesWaiting ? null : current.waitingOn,
          waitingSince: leavesWaiting ? null : current.waitingSince,
          updatedAt: now,
          revision,
        });

        const changes: Record<string, FieldChange> = {};
        for (const key of [
          'title',
          'status',
          'priority',
          'dueAt',
          'followUpAt',
          'waitingOn',
          'waitingSince',
        ] as const) {
          if (comparable(current[key]) !== comparable(next[key])) {
            changes[key] = {
              before: current[key],
              after: next[key],
            };
          }
        }

        if (Object.keys(changes).length === 0) {
          throw new DomainValidationError('Task update did not change any values');
        }

        await transaction.updateTask(next);
        await transaction.appendEvent(
          this.makeEvent(context, {
            entityType: 'TASK',
            entityId: next.id,
            eventType: 'TASK_UPDATED',
            detail: null,
            changes,
            revisionAfter: next.revision,
          }),
        );
        return next;
      },
    );
  }

  public async markTaskWaiting(
    rawContext: VersionedMutationContext,
    taskId: string,
    rawInput: MarkTaskWaitingInput,
  ): Promise<Task> {
    const context = versionedMutationContextSchema.parse(rawContext);
    const id = entityIdSchema.parse(taskId);
    const input = markTaskWaitingInputSchema.parse(rawInput);

    return this.executeOnce(
      { mutationId: context.mutationId, actor: context.actor },
      'markTaskWaiting',
      { expectedRevision: context.expectedRevision, taskId: id, input },
      async (transaction) => {
        const current = await this.requireTask(transaction, id);
        const revision = nextRevision(
          current.revision,
          context.expectedRevision,
        );
        if (current.status === 'DONE' || current.status === 'CANCELLED') {
          throw new DomainValidationError(
            `Cannot mark a ${current.status.toLowerCase()} task as waiting`,
          );
        }

        const now = this.now();
        const next = taskSchema.parse({
          ...current,
          status: 'WAITING',
          waitingOn: input.waitingOn,
          waitingSince: now,
          followUpAt: input.followUpAt,
          updatedAt: now,
          revision,
        });

        await transaction.updateTask(next);
        await transaction.appendEvent(
          this.makeEvent(context, {
            entityType: 'TASK',
            entityId: next.id,
            eventType: 'TASK_WAITING',
            detail: input.waitingOn,
            changes: {
              status: { before: current.status, after: next.status },
              waitingOn: { before: current.waitingOn, after: next.waitingOn },
              waitingSince: {
                before: current.waitingSince,
                after: next.waitingSince,
              },
              followUpAt: {
                before: current.followUpAt,
                after: next.followUpAt,
              },
            },
            revisionAfter: next.revision,
          }),
        );
        return next;
      },
    );
  }

  public async completeTask(
    rawContext: VersionedMutationContext,
    taskId: string,
  ): Promise<Task> {
    const context = versionedMutationContextSchema.parse(rawContext);
    const id = entityIdSchema.parse(taskId);

    return this.executeOnce(
      { mutationId: context.mutationId, actor: context.actor },
      'completeTask',
      { expectedRevision: context.expectedRevision, taskId: id },
      async (transaction) => {
        const current = await this.requireTask(transaction, id);
        const revision = nextRevision(
          current.revision,
          context.expectedRevision,
        );
        if (current.status === 'DONE') {
          throw new DomainValidationError('Task is already complete');
        }
        if (current.status === 'CANCELLED') {
          throw new DomainValidationError('Cancelled tasks cannot be completed');
        }

        const now = this.now();
        const next = taskSchema.parse({
          ...current,
          status: 'DONE',
          waitingOn: null,
          waitingSince: null,
          updatedAt: now,
          revision,
        });

        await transaction.updateTask(next);
        await transaction.appendEvent(
          this.makeEvent(context, {
            entityType: 'TASK',
            entityId: next.id,
            eventType: 'TASK_COMPLETED',
            detail: null,
            changes: {
              status: { before: current.status, after: next.status },
              waitingOn: { before: current.waitingOn, after: next.waitingOn },
              waitingSince: {
                before: current.waitingSince,
                after: next.waitingSince,
              },
            },
            revisionAfter: next.revision,
          }),
        );
        return next;
      },
    );
  }

  public async addJobEvent(
    rawContext: VersionedMutationContext,
    jobId: string,
    detail: string,
  ): Promise<Job> {
    const context = versionedMutationContextSchema.parse(rawContext);
    const id = entityIdSchema.parse(jobId);
    const normalizedDetail = detail.trim();
    if (normalizedDetail.length === 0 || normalizedDetail.length > 4000) {
      throw new DomainValidationError('Job event detail must contain 1-4000 characters');
    }

    return this.executeOnce(
      { mutationId: context.mutationId, actor: context.actor },
      'addJobEvent',
      {
        expectedRevision: context.expectedRevision,
        jobId: id,
        detail: normalizedDetail,
      },
      async (transaction) => {
        const current = await this.requireJob(transaction, id);
        const now = this.now();
        const next: Job = {
          ...current,
          updatedAt: now,
          revision: nextRevision(current.revision, context.expectedRevision),
        };

        await transaction.updateJob(next);
        await transaction.appendEvent(
          this.makeEvent(context, {
            entityType: 'JOB',
            entityId: next.id,
            eventType: 'JOB_NOTE',
            detail: normalizedDetail,
            changes: {},
            revisionAfter: next.revision,
          }),
        );
        return next;
      },
    );
  }

  public async getJob(jobId: string): Promise<JobView> {
    const id = entityIdSchema.parse(jobId);
    return this.store.read(async (read) => {
      const job = await read.getJob(id);
      if (job === undefined) {
        throw new DomainNotFoundError('Job', id);
      }

      const [tasks, allEvents] = await Promise.all([
        read.listTasks(),
        read.listEvents(),
      ]);
      const jobTasks = tasks.filter((task) => task.jobId === id);
      const taskIds = new Set(jobTasks.map((task) => task.id));
      const events = allEvents.filter(
        (event) =>
          (event.entityType === 'JOB' && event.entityId === id) ||
          (event.entityType === 'TASK' && taskIds.has(event.entityId)),
      );

      return {
        job,
        tasks: jobTasks,
        events,
      };
    });
  }

  public async getToday(rawAsOf: string): Promise<TodayResult> {
    const asOf = timestampSchema.parse(rawAsOf);
    return this.store.read(async (read) => {
      const tasks = (await read.listTasks())
        .filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED')
        .filter((task) => {
          const candidates = [task.dueAt, task.followUpAt].filter(
            (value): value is string => value !== null,
          );
          return candidates.some((value) => value <= asOf);
        })
        .sort((left, right) => {
          const leftAt = [left.dueAt, left.followUpAt]
            .filter((value): value is string => value !== null)
            .sort()[0] ?? '';
          const rightAt = [right.dueAt, right.followUpAt]
            .filter((value): value is string => value !== null)
            .sort()[0] ?? '';
          return leftAt.localeCompare(rightAt) || left.title.localeCompare(right.title);
        });
      return { asOf, tasks };
    });
  }

  public async search(rawQuery: string): Promise<SearchResult> {
    const query = rawQuery.trim().toLocaleLowerCase();
    if (query.length === 0 || query.length > 200) {
      throw new DomainValidationError('Search query must contain 1-200 characters');
    }

    return this.store.read(async (read) => {
      const [parties, jobs, tasks, events] = await Promise.all([
        read.listParties(),
        read.listJobs(),
        read.listTasks(),
        read.listEvents(),
      ]);

      return {
        parties: parties.filter((party) =>
          party.name.toLocaleLowerCase().includes(query),
        ),
        jobs: jobs.filter(
          (job) =>
            job.key.toLocaleLowerCase().includes(query) ||
            job.title.toLocaleLowerCase().includes(query),
        ),
        tasks: tasks.filter(
          (task) =>
            task.title.toLocaleLowerCase().includes(query) ||
            (task.waitingOn?.toLocaleLowerCase().includes(query) ?? false),
        ),
        events: events.filter(
          (event) => event.detail?.toLocaleLowerCase().includes(query) ?? false,
        ),
      };
    });
  }

  private async requireTask(
    transaction: DomainTransaction,
    id: string,
  ): Promise<Task> {
    const task = await transaction.getTask(id);
    if (task === undefined) {
      throw new DomainNotFoundError('Task', id);
    }
    return task;
  }

  private async requireJob(
    transaction: DomainTransaction,
    id: string,
  ): Promise<Job> {
    const job = await transaction.getJob(id);
    if (job === undefined) {
      throw new DomainNotFoundError('Job', id);
    }
    return job;
  }

  private now(): string {
    return timestampSchema.parse(this.clock());
  }

  private newId(): string {
    return entityIdSchema.parse(this.idGenerator());
  }

  private makeEvent(
    context: MutationContext,
    input: Omit<DomainEvent, 'id' | 'mutationId' | 'actor' | 'occurredAt'>,
  ): DomainEvent {
    return eventSchema.parse({
      id: this.newId(),
      mutationId: context.mutationId,
      actor: context.actor,
      occurredAt: this.now(),
      ...input,
    });
  }

  private async executeOnce<T>(
    context: MutationContext,
    command: string,
    payload: unknown,
    work: (transaction: DomainTransaction) => MaybePromise<T>,
  ): Promise<T> {
    const fingerprint = canonicalJson({
      actor: context.actor,
      command,
      payload,
    });

    return this.store.transact(async (transaction) => {
      const existing = await transaction.getMutationReceipt(context.mutationId);
      if (existing !== undefined) {
        if (
          existing.command !== command ||
          existing.fingerprint !== fingerprint
        ) {
          throw new MutationReplayMismatchError(context.mutationId);
        }
        return structuredClone(existing.result) as T;
      }

      const result = await work(transaction);
      await transaction.saveMutationReceipt(
        mutationReceiptSchema.parse({
          mutationId: context.mutationId,
          command,
          fingerprint,
          result,
          committedAt: this.now(),
        }),
      );
      return result;
    });
  }
}
