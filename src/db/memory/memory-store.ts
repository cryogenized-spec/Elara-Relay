import type { DomainEvent } from '../../contracts/event';
import type { Job } from '../../contracts/job';
import type { MutationReceipt } from '../../contracts/mutation';
import type { Party } from '../../contracts/party';
import type { Repair } from '../../contracts/repair';
import type {
  ScheduledAction,
  ScheduledActionRun,
} from '../../contracts/scheduler';
import type { Task } from '../../contracts/task';
import {
  DomainNotFoundError,
  DuplicateEntityError,
} from '../../domain/errors';
import type {
  DomainRead,
  DomainStore,
  DomainTransaction,
  MaybePromise,
} from '../../domain/store';

interface MemoryState {
  parties: Map<string, Party>;
  jobs: Map<string, Job>;
  tasks: Map<string, Task>;
  repairs: Map<string, Repair>;
  scheduledActions: Map<string, ScheduledAction>;
  scheduledActionRuns: Map<string, ScheduledActionRun>;
  events: DomainEvent[];
  receipts: Map<string, MutationReceipt>;
}

function cloneMap<T>(map: ReadonlyMap<string, T>): Map<string, T> {
  return new Map(
    [...map.entries()].map(([key, value]) => [key, structuredClone(value)]),
  );
}

function cloneState(state: MemoryState): MemoryState {
  return {
    parties: cloneMap(state.parties),
    jobs: cloneMap(state.jobs),
    tasks: cloneMap(state.tasks),
    repairs: cloneMap(state.repairs),
    scheduledActions: cloneMap(state.scheduledActions),
    scheduledActionRuns: cloneMap(state.scheduledActionRuns),
    events: structuredClone(state.events),
    receipts: cloneMap(state.receipts),
  };
}

class MemoryView implements DomainTransaction {
  public constructor(private readonly state: MemoryState) {}

  public getParty(id: string): Party | undefined {
    const value = this.state.parties.get(id);
    return value === undefined ? undefined : structuredClone(value);
  }

  public getJob(id: string): Job | undefined {
    const value = this.state.jobs.get(id);
    return value === undefined ? undefined : structuredClone(value);
  }

  public getTask(id: string): Task | undefined {
    const value = this.state.tasks.get(id);
    return value === undefined ? undefined : structuredClone(value);
  }

  public getRepair(id: string): Repair | undefined {
    const value = this.state.repairs.get(id);
    return value === undefined ? undefined : structuredClone(value);
  }

  public getRepairByJobId(jobId: string): Repair | undefined {
    const value = [...this.state.repairs.values()].find(
      (repair) => repair.jobId === jobId,
    );
    return value === undefined ? undefined : structuredClone(value);
  }

  public getScheduledAction(id: string): ScheduledAction | undefined {
    const value = this.state.scheduledActions.get(id);
    return value === undefined ? undefined : structuredClone(value);
  }

  public getScheduledActionRun(id: string): ScheduledActionRun | undefined {
    const value = this.state.scheduledActionRuns.get(id);
    return value === undefined ? undefined : structuredClone(value);
  }

  public getScheduledActionRunActionId(id: string): string | undefined {
    return this.state.scheduledActionRuns.get(id)?.scheduledActionId;
  }

  public getScheduledActionRunByOccurrenceKey(
    occurrenceKey: string,
  ): ScheduledActionRun | undefined {
    const value = [...this.state.scheduledActionRuns.values()].find(
      (run) => run.occurrenceKey === occurrenceKey,
    );
    return value === undefined ? undefined : structuredClone(value);
  }

  public getMutationReceipt(mutationId: string): MutationReceipt | undefined {
    const value = this.state.receipts.get(mutationId);
    return value === undefined ? undefined : structuredClone(value);
  }

  public listParties(): Party[] {
    return [...this.state.parties.values()].map((value) => structuredClone(value));
  }

  public listJobs(): Job[] {
    return [...this.state.jobs.values()].map((value) => structuredClone(value));
  }

  public listTasks(): Task[] {
    return [...this.state.tasks.values()].map((value) => structuredClone(value));
  }

  public listRepairs(): Repair[] {
    return [...this.state.repairs.values()].map((value) =>
      structuredClone(value),
    );
  }

  public listScheduledActions(): ScheduledAction[] {
    return [...this.state.scheduledActions.values()].map((value) =>
      structuredClone(value),
    );
  }

  public listScheduledActionRuns(): ScheduledActionRun[] {
    return [...this.state.scheduledActionRuns.values()].map((value) =>
      structuredClone(value),
    );
  }

  public listEvents(): DomainEvent[] {
    return structuredClone(this.state.events);
  }

  public insertParty(party: Party): void {
    if (this.state.parties.has(party.id)) {
      throw new DuplicateEntityError('Party', party.id);
    }
    this.state.parties.set(party.id, structuredClone(party));
  }

  public updateParty(party: Party): void {
    if (!this.state.parties.has(party.id)) {
      throw new DomainNotFoundError('Party', party.id);
    }
    this.state.parties.set(party.id, structuredClone(party));
  }

  public insertJob(job: Job): void {
    if (this.state.jobs.has(job.id)) {
      throw new DuplicateEntityError('Job', job.id);
    }
    if ([...this.state.jobs.values()].some((value) => value.key === job.key)) {
      throw new DuplicateEntityError('JobKey', job.key);
    }
    this.state.jobs.set(job.id, structuredClone(job));
  }

  public updateJob(job: Job): void {
    if (!this.state.jobs.has(job.id)) {
      throw new DomainNotFoundError('Job', job.id);
    }
    this.state.jobs.set(job.id, structuredClone(job));
  }

  public insertTask(task: Task): void {
    if (this.state.tasks.has(task.id)) {
      throw new DuplicateEntityError('Task', task.id);
    }
    this.state.tasks.set(task.id, structuredClone(task));
  }

  public updateTask(task: Task): void {
    if (!this.state.tasks.has(task.id)) {
      throw new DomainNotFoundError('Task', task.id);
    }
    this.state.tasks.set(task.id, structuredClone(task));
  }

  public insertRepair(repair: Repair): void {
    if (this.state.repairs.has(repair.id)) {
      throw new DuplicateEntityError('Repair', repair.id);
    }
    if (
      [...this.state.repairs.values()].some(
        (value) => value.jobId === repair.jobId,
      )
    ) {
      throw new DuplicateEntityError('RepairJob', repair.jobId);
    }
    this.state.repairs.set(repair.id, structuredClone(repair));
  }

  public updateRepair(repair: Repair): void {
    if (!this.state.repairs.has(repair.id)) {
      throw new DomainNotFoundError('Repair', repair.id);
    }
    this.state.repairs.set(repair.id, structuredClone(repair));
  }

  public insertScheduledAction(action: ScheduledAction): void {
    if (this.state.scheduledActions.has(action.id)) {
      throw new DuplicateEntityError('ScheduledAction', action.id);
    }
    this.state.scheduledActions.set(action.id, structuredClone(action));
  }

  public updateScheduledAction(action: ScheduledAction): void {
    if (!this.state.scheduledActions.has(action.id)) {
      throw new DomainNotFoundError('ScheduledAction', action.id);
    }
    this.state.scheduledActions.set(action.id, structuredClone(action));
  }

  public insertScheduledActionRun(run: ScheduledActionRun): void {
    if (this.state.scheduledActionRuns.has(run.id)) {
      throw new DuplicateEntityError('ScheduledActionRun', run.id);
    }
    if (
      [...this.state.scheduledActionRuns.values()].some(
        (value) => value.occurrenceKey === run.occurrenceKey,
      )
    ) {
      throw new DuplicateEntityError(
        'ScheduledActionOccurrence',
        run.occurrenceKey,
      );
    }
    this.state.scheduledActionRuns.set(run.id, structuredClone(run));
  }

  public updateScheduledActionRun(run: ScheduledActionRun): void {
    if (!this.state.scheduledActionRuns.has(run.id)) {
      throw new DomainNotFoundError('ScheduledActionRun', run.id);
    }
    this.state.scheduledActionRuns.set(run.id, structuredClone(run));
  }

  public appendEvent(event: DomainEvent): void {
    if (this.state.events.some((value) => value.id === event.id)) {
      throw new DuplicateEntityError('Event', event.id);
    }
    if (
      this.state.events.some(
        (value) => value.mutationId === event.mutationId,
      )
    ) {
      throw new DuplicateEntityError('EventMutation', event.mutationId);
    }
    this.state.events.push(structuredClone(event));
  }

  public saveMutationReceipt(receipt: MutationReceipt): void {
    if (this.state.receipts.has(receipt.mutationId)) {
      throw new DuplicateEntityError('MutationReceipt', receipt.mutationId);
    }
    this.state.receipts.set(receipt.mutationId, structuredClone(receipt));
  }
}

export class MemoryDomainStore implements DomainStore {
  private state: MemoryState = {
    parties: new Map(),
    jobs: new Map(),
    tasks: new Map(),
    repairs: new Map(),
    scheduledActions: new Map(),
    scheduledActionRuns: new Map(),
    events: [],
    receipts: new Map(),
  };

  private tail: Promise<void> = Promise.resolve();

  public async transact<T>(
    work: (transaction: DomainTransaction) => MaybePromise<T>,
  ): Promise<T> {
    const previous = this.tail;
    let release = (): void => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      const draft = cloneState(this.state);
      const result = await work(new MemoryView(draft));
      const safeResult = structuredClone(result);
      this.state = draft;
      return safeResult;
    } finally {
      release();
    }
  }

  public async read<T>(work: (read: DomainRead) => MaybePromise<T>): Promise<T> {
    await this.tail;
    const snapshot = cloneState(this.state);
    return structuredClone(await work(new MemoryView(snapshot)));
  }
}
