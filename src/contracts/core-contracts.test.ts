import { describe, expect, it } from 'vitest';
import { eventSchema } from './event';
import { createJobInputSchema } from './job';
import { versionedMutationContextSchema } from './mutation';
import { taskSchema } from './task';

describe('core domain contracts', () => {
  it('keeps due and follow-up concepts separate', () => {
    const task = taskSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      jobId: null,
      title: 'Follow up',
      status: 'WAITING',
      priority: 'NORMAL',
      dueAt: null,
      followUpAt: '2026-09-25T08:00:00.000Z',
      waitingOn: 'Supplier',
      waitingSince: '2026-09-24T08:00:00.000Z',
      createdAt: '2026-09-24T08:00:00.000Z',
      updatedAt: '2026-09-24T08:00:00.000Z',
      revision: 1,
    });
    expect(task.dueAt).toBeNull();
    expect(task.followUpAt).not.toBeNull();
  });

  it('normalizes offset timestamps to one UTC representation', () => {
    const task = taskSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      jobId: null,
      title: 'Offset normalization',
      status: 'NEXT',
      priority: 'NORMAL',
      dueAt: '2026-09-24T10:00:00+02:00',
      followUpAt: null,
      waitingOn: null,
      waitingSince: null,
      createdAt: '2026-09-24T10:00:00+02:00',
      updatedAt: '2026-09-24T10:00:00+02:00',
      revision: 1,
    });

    expect(task.dueAt).toBe('2026-09-24T08:00:00.000Z');
    expect(task.createdAt).toBe('2026-09-24T08:00:00.000Z');
  });

  it('rejects inconsistent waiting metadata', () => {
    const base = {
      id: '00000000-0000-4000-8000-000000000001',
      jobId: null,
      title: 'Invalid waiting state',
      priority: 'NORMAL',
      dueAt: null,
      followUpAt: null,
      createdAt: '2026-09-24T08:00:00.000Z',
      updatedAt: '2026-09-24T08:00:00.000Z',
      revision: 1,
    };

    expect(
      taskSchema.safeParse({
        ...base,
        status: 'WAITING',
        waitingOn: null,
        waitingSince: null,
      }).success,
    ).toBe(false);

    expect(
      taskSchema.safeParse({
        ...base,
        status: 'NEXT',
        waitingOn: 'Supplier',
        waitingSince: '2026-09-24T08:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown job categories and mutation revisions outside safe range', () => {
    expect(
      createJobInputSchema.safeParse({
        title: 'Repair',
        category: 'TESTING',
        partyId: null,
      }).success,
    ).toBe(false);

    expect(
      versionedMutationContextSchema.safeParse({
        mutationId: 'MUT-invalid-revision-01',
        actor: 'chatgpt',
        expectedRevision: 0,
      }).success,
    ).toBe(false);
  });

  it('requires events to use a reviewed event type', () => {
    const result = eventSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      mutationId: 'MUT-event-contract-01',
      entityType: 'TASK',
      entityId: '00000000-0000-4000-8000-000000000002',
      eventType: 'TASK_MAGICALLY_CHANGED',
      actor: 'system',
      occurredAt: '2026-09-24T09:00:00.000Z',
      detail: null,
      changes: {},
      revisionAfter: 1,
    });
    expect(result.success).toBe(false);
  });
});
