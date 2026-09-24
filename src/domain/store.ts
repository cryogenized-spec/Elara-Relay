import type { DomainEvent } from '../contracts/event';
import type { Job } from '../contracts/job';
import type { MutationReceipt } from '../contracts/mutation';
import type { Party } from '../contracts/party';
import type { Task } from '../contracts/task';

export interface DomainRead {
  getParty(id: string): Party | undefined;
  getJob(id: string): Job | undefined;
  getTask(id: string): Task | undefined;
  getMutationReceipt(mutationId: string): MutationReceipt | undefined;
  listParties(): Party[];
  listJobs(): Job[];
  listTasks(): Task[];
  listEvents(): DomainEvent[];
}

export interface DomainTransaction extends DomainRead {
  insertParty(party: Party): void;
  updateParty(party: Party): void;
  insertJob(job: Job): void;
  updateJob(job: Job): void;
  insertTask(task: Task): void;
  updateTask(task: Task): void;
  appendEvent(event: DomainEvent): void;
  saveMutationReceipt(receipt: MutationReceipt): void;
}

export interface DomainStore {
  transact<T>(
    work: (transaction: DomainTransaction) => Promise<T>,
  ): Promise<T>;
  read<T>(work: (read: DomainRead) => Promise<T>): Promise<T>;
}
