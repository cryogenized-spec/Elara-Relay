import type { DomainEvent } from '../contracts/event';
import type { Job } from '../contracts/job';
import type { MutationReceipt } from '../contracts/mutation';
import type { Party } from '../contracts/party';
import type { Repair } from '../contracts/repair';
import type {
  ScheduledAction,
  ScheduledActionRun,
} from '../contracts/scheduler';
import type { Task } from '../contracts/task';

export type MaybePromise<T> = T | Promise<T>;

export interface DomainRead {
  getParty(id: string): MaybePromise<Party | undefined>;
  getJob(id: string): MaybePromise<Job | undefined>;
  getTask(id: string): MaybePromise<Task | undefined>;
  getRepair(id: string): MaybePromise<Repair | undefined>;
  getRepairByJobId(jobId: string): MaybePromise<Repair | undefined>;
  getScheduledAction(id: string): MaybePromise<ScheduledAction | undefined>;
  getScheduledActionRun(
    id: string,
  ): MaybePromise<ScheduledActionRun | undefined>;
  getScheduledActionRunByOccurrenceKey(
    occurrenceKey: string,
  ): MaybePromise<ScheduledActionRun | undefined>;
  getMutationReceipt(
    mutationId: string,
  ): MaybePromise<MutationReceipt | undefined>;
  listParties(): MaybePromise<Party[]>;
  listJobs(): MaybePromise<Job[]>;
  listTasks(): MaybePromise<Task[]>;
  listRepairs(): MaybePromise<Repair[]>;
  listScheduledActions(): MaybePromise<ScheduledAction[]>;
  listScheduledActionRuns(): MaybePromise<ScheduledActionRun[]>;
  listEvents(): MaybePromise<DomainEvent[]>;
}

export interface DomainTransaction extends DomainRead {
  insertParty(party: Party): MaybePromise<void>;
  updateParty(party: Party): MaybePromise<void>;
  insertJob(job: Job): MaybePromise<void>;
  updateJob(job: Job): MaybePromise<void>;
  insertTask(task: Task): MaybePromise<void>;
  updateTask(task: Task): MaybePromise<void>;
  insertRepair(repair: Repair): MaybePromise<void>;
  updateRepair(repair: Repair): MaybePromise<void>;
  insertScheduledAction(action: ScheduledAction): MaybePromise<void>;
  updateScheduledAction(action: ScheduledAction): MaybePromise<void>;
  insertScheduledActionRun(run: ScheduledActionRun): MaybePromise<void>;
  updateScheduledActionRun(run: ScheduledActionRun): MaybePromise<void>;
  appendEvent(event: DomainEvent): MaybePromise<void>;
  saveMutationReceipt(receipt: MutationReceipt): MaybePromise<void>;
}

export interface DomainStore {
  transact<T>(
    work: (transaction: DomainTransaction) => MaybePromise<T>,
  ): Promise<T>;
  read<T>(work: (read: DomainRead) => MaybePromise<T>): Promise<T>;
}
