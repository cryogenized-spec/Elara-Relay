import { describe, expect, it } from 'vitest';
import { MemoryDomainStore } from '../db/memory/memory-store';
import { MutationReplayMismatchError } from './errors';
import { DomainKernel } from './kernel';
import { RevisionConflictError } from './revision';

const IDS = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000008',
  '00000000-0000-4000-8000-000000000009',
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000013',
  '00000000-0000-4000-8000-000000000014',
  '00000000-0000-4000-8000-000000000015',
  '00000000-0000-4000-8000-000000000016',
] as const;

function makeKernel() {
  const store = new MemoryDomainStore();
  let idIndex = 0;
  const kernel = new DomainKernel(store, {
    clock: () => '2026-09-24T09:00:00.000Z',
    idGenerator: () => {
      const id = IDS[idIndex];
      if (id === undefined) throw new Error('Test id pool exhausted');
      idIndex += 1;
      return id;
    },
  });
  return { kernel, store };
}

describe('domain kernel', () => {
  it('makes a successful mutation exactly-once by mutation id', async () => {
    const { kernel, store } = makeKernel();
    const context = {
      mutationId: 'MUT-create-party-0001',
      actor: 'operator-ui' as const,
    };

    const first = await kernel.createParty(context, {
      name: 'Niven Naiker',
      kind: 'CUSTOMER',
    });
    const replay = await kernel.createParty(context, {
      kind: 'CUSTOMER',
      name: 'Niven Naiker',
    });

    expect(replay).toEqual(first);
    const snapshot = await store.read(async (read) => ({
      parties: read.listParties(),
      events: read.listEvents(),
      receipts: read.getMutationReceipt(context.mutationId),
    }));
    expect(snapshot.parties).toHaveLength(1);
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.receipts?.command).toBe('createParty');
  });

  it('rejects reuse of a mutation id for different intent', async () => {
    const { kernel } = makeKernel();
    const context = {
      mutationId: 'MUT-replay-mismatch-01',
      actor: 'chatgpt' as const,
    };

    await kernel.createParty(context, {
      name: 'First',
      kind: 'OTHER',
    });

    await expect(
      kernel.createParty(context, {
        name: 'Second',
        kind: 'OTHER',
      }),
    ).rejects.toBeInstanceOf(MutationReplayMismatchError);
  });

  it('rejects task creation against a nonexistent job atomically', async () => {
    const { kernel, store } = makeKernel();

    await expect(
      kernel.createTask(
        {
          mutationId: 'MUT-orphan-task-0001',
          actor: 'embedded-ai',
        },
        {
          jobId: '00000000-0000-4000-8000-999999999999',
          title: 'Orphan task',
          priority: 'NORMAL',
          dueAt: null,
          followUpAt: null,
        },
      ),
    ).rejects.toThrow('Job not found');

    const snapshot = await store.read(async (read) => ({
      tasks: read.listTasks(),
      events: read.listEvents(),
      receipt: read.getMutationReceipt('MUT-orphan-task-0001'),
    }));
    expect(snapshot.tasks).toEqual([]);
    expect(snapshot.events).toEqual([]);
    expect(snapshot.receipt).toBeUndefined();
  });

  it('allows only one of two stale concurrent writers to commit', async () => {
    const { kernel, store } = makeKernel();
    const task = await kernel.createTask(
      {
        mutationId: 'MUT-create-task-0001',
        actor: 'operator-ui',
      },
      {
        jobId: null,
        title: 'Pressure test overnight',
        priority: 'HIGH',
        dueAt: '2026-09-24T08:30:00.000Z',
        followUpAt: null,
      },
    );

    const results = await Promise.allSettled([
      kernel.completeTask(
        {
          mutationId: 'MUT-complete-a-0001',
          actor: 'operator-ui',
          expectedRevision: task.revision,
        },
        task.id,
      ),
      kernel.completeTask(
        {
          mutationId: 'MUT-complete-b-0001',
          actor: 'chatgpt',
          expectedRevision: task.revision,
        },
        task.id,
      ),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toBeDefined();
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(RevisionConflictError);
    }

    const snapshot = await store.read(async (read) => ({
      task: read.getTask(task.id),
      events: read.listEvents(),
    }));
    expect(snapshot.task?.revision).toBe(2);
    expect(snapshot.task?.status).toBe('DONE');
    expect(snapshot.events.filter((event) => event.eventType === 'TASK_COMPLETED')).toHaveLength(1);
  });

  it('surfaces due and follow-up work while excluding completed work', async () => {
    const { kernel } = makeKernel();
    const due = await kernel.createTask(
      {
        mutationId: 'MUT-due-task-0001',
        actor: 'operator-ui',
      },
      {
        jobId: null,
        title: 'Call supplier',
        priority: 'NORMAL',
        dueAt: '2026-09-24T08:00:00.000Z',
        followUpAt: null,
      },
    );
    await kernel.createTask(
      {
        mutationId: 'MUT-future-task-0001',
        actor: 'operator-ui',
      },
      {
        jobId: null,
        title: 'Future job',
        priority: 'LOW',
        dueAt: '2026-09-25T08:00:00.000Z',
        followUpAt: null,
      },
    );

    const today = await kernel.getToday('2026-09-24T09:00:00.000Z');
    expect(today.tasks.map((task) => task.id)).toEqual([due.id]);
  });

  it('searches durable job, task, party, and event text', async () => {
    const { kernel } = makeKernel();
    const party = await kernel.createParty(
      {
        mutationId: 'MUT-party-search-0001',
        actor: 'operator-ui',
      },
      {
        name: 'Niven Naiker',
        kind: 'CUSTOMER',
      },
    );
    const job = await kernel.createJob(
      {
        mutationId: 'MUT-job-search-0001',
        actor: 'operator-ui',
      },
      {
        title: 'Avenge-X regulator repair',
        category: 'ACTIVE',
        partyId: party.id,
      },
    );
    await kernel.addJobEvent(
      {
        mutationId: 'MUT-note-search-0001',
        actor: 'operator-ui',
        expectedRevision: job.revision,
      },
      job.id,
      'Transfer seals fitted and holding pressure',
    );

    expect((await kernel.search('naiker')).parties).toHaveLength(1);
    expect((await kernel.search('avenge')).jobs).toHaveLength(1);
    expect((await kernel.search('holding pressure')).events).toHaveLength(1);
  });
});
