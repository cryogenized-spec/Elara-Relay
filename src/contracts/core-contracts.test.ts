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
