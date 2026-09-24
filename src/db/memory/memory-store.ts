import type { DomainEvent } from '../../contracts/event';
import type { Job } from '../../contracts/job';
import type { MutationReceipt } from '../../contracts/mutation';
import type { Party } from '../../contracts/party';
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

  public appendEvent(event: DomainEvent): void {
    if (this.state.events.some((value) => value.id === event.id)) {
      throw new DuplicateEntityError('Event', event.id);
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
