import { describe, expect, it } from 'vitest';
import { eventSchema } from './event';

const BASE_EVENT = {
  id: '10000000-0000-4000-8000-000000000301',
  mutationId: 'MUT-event-schema-test-0001',
  entityType: 'JOB' as const,
  entityId: '10000000-0000-4000-8000-000000000302',
  eventType: 'JOB_CREATED' as const,
  actor: 'operator-ui' as const,
  occurredAt: '2026-09-26T04:00:00.000Z',
  detail: null,
  changes: {},
  revisionAfter: 1,
};

describe('eventSchema', () => {
  it('requires every creation Event to record revision one', () => {
    for (const [entityType, eventType] of [
      ['PARTY', 'PARTY_CREATED'],
      ['JOB', 'JOB_CREATED'],
      ['TASK', 'TASK_CREATED'],
      ['REPAIR', 'REPAIR_CREATED'],
      ['SCHEDULED_ACTION', 'SCHEDULED_ACTION_CREATED'],
    ] as const) {
      expect(
        eventSchema.parse({
          ...BASE_EVENT,
          entityType,
          eventType,
          revisionAfter: 1,
        }),
      ).toBeTruthy();

      expect(() =>
        eventSchema.parse({
          ...BASE_EVENT,
          entityType,
          eventType,
          revisionAfter: 2,
        }),
      ).toThrow('Creation Events must record revisionAfter 1');
    }
  });

  it('allows later revisions for non-creation Events', () => {
    expect(
      eventSchema.parse({
        ...BASE_EVENT,
        eventType: 'JOB_NOTE',
        revisionAfter: 2,
      }),
    ).toBeTruthy();
  });
});
