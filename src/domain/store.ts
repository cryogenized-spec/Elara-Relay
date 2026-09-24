import type { DomainEvent } from '../contracts/event';
import type { Job } from '../contracts/job';
import type { MutationReceipt } from '../contracts/mutation';
import type { Party } from '../contracts/party';
import type { Task } from '../contracts/task';

export type MaybePromise<T> = T | Promise<T>;

export interface DomainRead {
  getParty(id: string): MaybePromise<Party | undefined>;
  getJob(id: string): MaybePromise<Job | undefined>;
  getTask(id: string): MaybePromise<Task | undefined>;
  getMutationReceipt(
    mutationId: string,
  ): MaybePromise<MutationReceipt | undefined>;
  listParties(): MaybePromise<Party[]>;
  listJobs(): MaybePromise<Job[]>;
  listTasks(): MaybePromise<Task[]>;
  listEvents(): MaybePromise<DomainEvent[]>;
}

export interface DomainTransaction extends DomainRead {
  insertParty(party: Party): MaybePromise<void>;
  updateParty(party: Party): MaybePromise<void>;
  insertJob(job: Job): MaybePromise<void>;
  updateJob(job: Job): MaybePromise<void>;
  insertTask(task: Task): MaybePromise<void>;
  updateTask(task: Task): MaybePromise<void>;
  appendEvent(event: DomainEvent): MaybePromise<void>;
  saveMutationReceipt(receipt: MutationReceipt): MaybePromise<void>;
}

export interface DomainStore {
  transact<T>(
    work: (transaction: DomainTransaction) => MaybePromise<T>,
  ): Promise<T>;
  read<T>(work: (read: DomainRead) => MaybePromise<T>): Promise<T>;
}
