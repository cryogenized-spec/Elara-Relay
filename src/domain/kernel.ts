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
import {
  createRepairInputSchema,
  moveRepairStageInputSchema,
  recordRepairTestInputSchema,
  repairDetailsPatchSchema,
  repairSchema,
  type CreateRepairInput,
  type MoveRepairStageInput,
  type RecordRepairTestInput,
  type Repair,
  type RepairDetailsPatch,
  type RepairStage,
  type RepairWarning,
} from '../contracts/repair';
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

export interface RepairView {
  repair: Repair;
  warnings: RepairWarning[];
}

export interface JobView {
  job: Job;
  tasks: Task[];
  repair: Repair | null;
  repairWarnings: RepairWarning[];
  events: DomainEvent[];
}

export interface TodayResult {
  asOf: string;
  tasks: Task[];
  repairs: Repair[];
}

export interface SearchResult {
  parties: Party[];
  jobs: Job[];
  tasks: Task[];
  repairs: Repair[];
  events: DomainEvent[];
}

export interface KernelOptions {
  clock?: () => string;
  idGenerator?: () => string;
}

function toJobKey(id: string): string {
  return `JOB-${id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

const REPAIR_STAGE_TRANSITIONS: Readonly<
  Record<RepairStage, readonly RepairStage[]>
> = {
  RECEIVED: ['DIAGNOSING', 'AWAITING_CUSTOMER', 'CANCELLED'],
  DIAGNOSING: [
    'AWAITING_PARTS',
    'AWAITING_CUSTOMER',
    'REPAIRING',
    'TESTING',
    'CANCELLED',
  ],
  AWAITING_PARTS: ['DIAGNOSING', 'REPAIRING', 'CANCELLED'],
  AWAITING_CUSTOMER: ['DIAGNOSING', 'REPAIRING', 'CANCELLED'],
  REPAIRING: [
    'AWAITING_PARTS',
    'AWAITING_CUSTOMER',
    'TESTING',
    'CANCELLED',
  ],
  TESTING: [
    'AWAITING_PARTS',
    'AWAITING_CUSTOMER',
    'REPAIRING',
    'READY',
    'CANCELLED',
  ],
  READY: ['REPAIRING', 'TESTING', 'COLLECTED', 'CANCELLED'],
  COLLECTED: [],
  CANCELLED: [],
};

function repairWarnings(repair: Repair): RepairWarning[] {
  return repair.serialState === 'UNKNOWN' ? ['SERIAL_UNKNOWN'] : [];
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
        if (
          patch.status !== undefined &&
          (current.status === 'DONE' || current.status === 'CANCELLED')
        ) {
          throw new DomainValidationError(
            `Cannot transition a ${current.status.toLowerCase()} task through updateTask`,
          );
        }
        const now = this.now();
        const leavesWaiting = patch.status !== undefined;
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

  public async cancelTask(
    rawContext: VersionedMutationContext,
    taskId: string,
  ): Promise<Task> {
    const context = versionedMutationContextSchema.parse(rawContext);
    const id = entityIdSchema.parse(taskId);

    return this.executeOnce(
      { mutationId: context.mutationId, actor: context.actor },
      'cancelTask',
      { expectedRevision: context.expectedRevision, taskId: id },
      async (transaction) => {
        const current = await this.requireTask(transaction, id);
        const revision = nextRevision(
          current.revision,
          context.expectedRevision,
        );
        if (current.status === 'DONE') {
          throw new DomainValidationError('Completed tasks cannot be cancelled');
        }
        if (current.status === 'CANCELLED') {
          throw new DomainValidationError('Task is already cancelled');
        }

        const now = this.now();
        const next = taskSchema.parse({
          ...current,
          status: 'CANCELLED',
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
            eventType: 'TASK_CANCELLED',
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

  public async createRepair(
    rawContext: MutationContext,
    rawInput: CreateRepairInput,
  ): Promise<Repair> {
    const context = mutationContextSchema.parse(rawContext);
    const input = createRepairInputSchema.parse(rawInput);

    return this.executeOnce(
      context,
      'createRepair',
      input,
      async (transaction) => {
        const job = await transaction.getJob(input.jobId);
        if (job === undefined) {
          throw new DomainNotFoundError('Job', input.jobId);
        }
        if (job.category === 'DONE' || job.category === 'CANCELLED') {
          throw new DomainValidationError(
            'Cannot attach a repair to a terminal job',
          );
        }
        if ((await transaction.getRepairByJobId(input.jobId)) !== undefined) {
          throw new DomainValidationError('Job already has a repair');
        }

        const now = this.now();
        const repair = repairSchema.parse({
          id: this.newId(),
          jobId: input.jobId,
          stage: 'RECEIVED',
          reportedFault: input.reportedFault,
          diagnosis: null,
          currentFinding: null,
          serialState: input.serialState,
          serialValue: input.serialValue,
          storageLocation: input.storageLocation,
          waitingOn: null,
          followUpAt: null,
          finalTestResult: null,
          finalTestDetail: null,
          testedAt: null,
          receivedAt: now,
          readyAt: null,
          collectedAt: null,
          cancelledAt: null,
          createdAt: now,
          updatedAt: now,
          revision: 1,
        });

        await transaction.insertRepair(repair);
        await transaction.appendEvent(
          this.makeEvent(context, {
            entityType: 'REPAIR',
            entityId: repair.id,
            eventType: 'REPAIR_CREATED',
            detail: repair.reportedFault,
            changes: {},
            revisionAfter: repair.revision,
          }),
        );
        return repair;
      },
    );
  }

  public async updateRepairDetails(
    rawContext: VersionedMutationContext,
    repairId: string,
    rawPatch: RepairDetailsPatch,
  ): Promise<Repair> {
    const context = versionedMutationContextSchema.parse(rawContext);
    const id = entityIdSchema.parse(repairId);
    const patch = repairDetailsPatchSchema.parse(rawPatch);

    return this.executeOnce(
      { mutationId: context.mutationId, actor: context.actor },
      'updateRepairDetails',
      { expectedRevision: context.expectedRevision, repairId: id, patch },
      async (transaction) => {
        const current = await this.requireRepair(transaction, id);
        const revision = nextRevision(
          current.revision,
          context.expectedRevision,
        );
        const next = repairSchema.parse({
          ...current,
          ...patch,
          updatedAt: this.now(),
          revision,
        });

        const changes: Record<string, FieldChange> = {};
        for (const key of [
          'reportedFault',
          'diagnosis',
          'currentFinding',
          'serialState',
          'serialValue',
          'storageLocation',
        ] as const) {
          if (comparable(current[key]) !== comparable(next[key])) {
            changes[key] = {
              before: current[key],
              after: next[key],
            };
          }
        }

        if (Object.keys(changes).length === 0) {
          throw new DomainValidationError(
            'Repair detail update did not change any values',
          );
        }

        await transaction.updateRepair(next);
        await transaction.appendEvent(
          this.makeEvent(context, {
            entityType: 'REPAIR',
            entityId: next.id,
            eventType: 'REPAIR_DETAILS_UPDATED',
            detail: next.currentFinding ?? next.diagnosis,
            changes,
            revisionAfter: next.revision,
          }),
        );
        return next;
      },
    );
  }

  public async moveRepairStage(
    rawContext: VersionedMutationContext,
    repairId: string,
    rawInput: MoveRepairStageInput,
  ): Promise<Repair> {
    const context = versionedMutationContextSchema.parse(rawContext);
    const id = entityIdSchema.parse(repairId);
    const input = moveRepairStageInputSchema.parse(rawInput);

    return this.executeOnce(
      { mutationId: context.mutationId, actor: context.actor },
      'moveRepairStage',
      {
        expectedRevision: context.expectedRevision,
        repairId: id,
        input,
      },
      async (transaction) => {
        const current = await this.requireRepair(transaction, id);
        if (!REPAIR_STAGE_TRANSITIONS[current.stage].includes(input.stage)) {
          throw new DomainValidationError(
            `Invalid repair stage transition: ${current.stage} -> ${input.stage}`,
          );
        }

        const now = this.now();
        const revision = nextRevision(
          current.revision,
          context.expectedRevision,
        );
        const waiting =
          input.stage === 'AWAITING_PARTS' ||
          input.stage === 'AWAITING_CUSTOMER';
        const invalidateTest =
          input.stage === 'TESTING' ||
          (current.stage === 'READY' && input.stage === 'REPAIRING');

        const next = repairSchema.parse({
          ...current,
          stage: input.stage,
          waitingOn: waiting ? input.waitingOn : null,
          followUpAt: waiting ? input.followUpAt : null,
          finalTestResult: invalidateTest
            ? null
            : current.finalTestResult,
          finalTestDetail: invalidateTest
            ? null
            : current.finalTestDetail,
          testedAt: invalidateTest ? null : current.testedAt,
          readyAt:
            input.stage === 'READY'
              ? now
              : input.stage === 'COLLECTED'
                ? current.readyAt
                : null,
          collectedAt: input.stage === 'COLLECTED' ? now : null,
          cancelledAt: input.stage === 'CANCELLED' ? now : null,
          updatedAt: now,
          revision,
        });

        const changes: Record<string, FieldChange> = {};
        for (const key of [
          'stage',
          'waitingOn',
          'followUpAt',
          'finalTestResult',
          'finalTestDetail',
          'testedAt',
          'readyAt',
          'collectedAt',
          'cancelledAt',
        ] as const) {
          if (comparable(current[key]) !== comparable(next[key])) {
            changes[key] = {
              before: current[key],
              after: next[key],
            };
          }
        }

        await transaction.updateRepair(next);
        await transaction.appendEvent(
          this.makeEvent(context, {
            entityType: 'REPAIR',
            entityId: next.id,
            eventType: 'REPAIR_STAGE_CHANGED',
            detail: `${current.stage} -> ${next.stage}`,
            changes,
            revisionAfter: next.revision,
          }),
        );
        return next;
      },
    );
  }

  public async recordRepairTest(
    rawContext: VersionedMutationContext,
    repairId: string,
    rawInput: RecordRepairTestInput,
  ): Promise<Repair> {
    const context = versionedMutationContextSchema.parse(rawContext);
    const id = entityIdSchema.parse(repairId);
    const input = recordRepairTestInputSchema.parse(rawInput);

    return this.executeOnce(
      { mutationId: context.mutationId, actor: context.actor },
      'recordRepairTest',
      {
        expectedRevision: context.expectedRevision,
        repairId: id,
        input,
      },
      async (transaction) => {
        const current = await this.requireRepair(transaction, id);
        if (current.stage !== 'TESTING') {
          throw new DomainValidationError(
            'Final test results may only be recorded while testing',
          );
        }

        const now = this.now();
        const next = repairSchema.parse({
          ...current,
          finalTestResult: input.result,
          finalTestDetail: input.detail,
          testedAt: now,
          updatedAt: now,
          revision: nextRevision(
            current.revision,
            context.expectedRevision,
          ),
        });

        await transaction.updateRepair(next);
        await transaction.appendEvent(
          this.makeEvent(context, {
            entityType: 'REPAIR',
            entityId: next.id,
            eventType: 'REPAIR_TEST_RECORDED',
            detail: input.detail,
            changes: {
              finalTestResult: {
                before: current.finalTestResult,
                after: next.finalTestResult,
              },
              finalTestDetail: {
                before: current.finalTestDetail,
                after: next.finalTestDetail,
              },
              testedAt: {
                before: current.testedAt,
                after: next.testedAt,
              },
            },
            revisionAfter: next.revision,
          }),
        );
        return next;
      },
    );
  }

  public async getRepair(repairId: string): Promise<RepairView> {
    const id = entityIdSchema.parse(repairId);
    return this.store.read(async (read) => {
      const repair = await read.getRepair(id);
      if (repair === undefined) {
        throw new DomainNotFoundError('Repair', id);
      }
      return {
        repair,
        warnings: repairWarnings(repair),
      };
    });
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

      const [tasks, repair, allEvents] = await Promise.all([
        read.listTasks(),
        read.getRepairByJobId(id),
        read.listEvents(),
      ]);
      const jobTasks = tasks.filter((task) => task.jobId === id);
      const taskIds = new Set(jobTasks.map((task) => task.id));
      const events = allEvents.filter(
        (event) =>
          (event.entityType === 'JOB' && event.entityId === id) ||
          (event.entityType === 'TASK' && taskIds.has(event.entityId)) ||
          (event.entityType === 'REPAIR' &&
            repair !== undefined &&
            event.entityId === repair.id),
      );

      return {
        job,
        tasks: jobTasks,
        repair: repair ?? null,
        repairWarnings:
          repair === undefined ? [] : repairWarnings(repair),
        events,
      };
    });
  }

  public async getToday(rawAsOf: string): Promise<TodayResult> {
    const asOf = timestampSchema.parse(rawAsOf);
    return this.store.read(async (read) => {
      const [allTasks, allRepairs] = await Promise.all([
        read.listTasks(),
        read.listRepairs(),
      ]);
      const tasks = allTasks
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
      const repairs = allRepairs
        .filter(
          (repair) =>
            (repair.stage === 'AWAITING_PARTS' ||
              repair.stage === 'AWAITING_CUSTOMER') &&
            repair.followUpAt !== null &&
            repair.followUpAt <= asOf,
        )
        .sort(
          (left, right) =>
            (left.followUpAt ?? '').localeCompare(right.followUpAt ?? '') ||
            left.reportedFault.localeCompare(right.reportedFault),
        );
      return { asOf, tasks, repairs };
    });
  }

  public async search(rawQuery: string): Promise<SearchResult> {
    const query = rawQuery.trim().toLowerCase();
    if (query.length === 0 || query.length > 200) {
      throw new DomainValidationError('Search query must contain 1-200 characters');
    }

    return this.store.read(async (read) => {
      const [parties, jobs, tasks, repairs, events] = await Promise.all([
        read.listParties(),
        read.listJobs(),
        read.listTasks(),
        read.listRepairs(),
        read.listEvents(),
      ]);

      return {
        parties: parties.filter((party) =>
          party.name.toLowerCase().includes(query),
        ),
        jobs: jobs.filter(
          (job) =>
            job.key.toLowerCase().includes(query) ||
            job.title.toLowerCase().includes(query),
        ),
        tasks: tasks.filter(
          (task) =>
            task.title.toLowerCase().includes(query) ||
            (task.waitingOn?.toLowerCase().includes(query) ?? false),
        ),
        repairs: repairs.filter((repair) =>
          [
            repair.reportedFault,
            repair.diagnosis,
            repair.currentFinding,
            repair.serialValue,
            repair.storageLocation,
            repair.waitingOn,
          ].some((value) => value?.toLowerCase().includes(query) ?? false),
        ),
        events: events.filter(
          (event) => event.detail?.toLowerCase().includes(query) ?? false,
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

  private async requireRepair(
    transaction: DomainTransaction,
    id: string,
  ): Promise<Repair> {
    const repair = await transaction.getRepair(id);
    if (repair === undefined) {
      throw new DomainNotFoundError('Repair', id);
    }
    return repair;
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
