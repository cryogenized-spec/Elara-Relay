import { describe, expect, it } from 'vitest';
import {
  createScheduledActionInputSchema,
  scheduledActionRunSchema,
  scheduledActionSchema,
} from './scheduler';

const ACTION_ID = '81000000-0000-4000-8000-000000000001';
const RUN_ID = '81000000-0000-4000-8000-000000000002';
const LEASE_ID = '81000000-0000-4000-8000-000000000003';

describe('Scheduler contracts', () => {
  it('keeps timezone and recurrence syntax deliberately narrow in v1', () => {
    const parsed = createScheduledActionInputSchema.parse({
      title: 'Follow up supplier',
      actionType: 'REMINDER',
      payload: {
        kind: 'REMINDER',
        message: 'Check seal order',
      },
      runAt: '2026-09-25T09:00:00+02:00',
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
    });

    expect(parsed.timezone).toBe('Africa/Johannesburg');
    expect(parsed.runAt).toBe('2026-09-25T07:00:00.000Z');

    expect(() =>
      createScheduledActionInputSchema.parse({
        title: 'Wrong zone',
        actionType: 'REMINDER',
        payload: {
          kind: 'REMINDER',
          message: 'Nope',
        },
        timezone: 'Europe/London',
        runAt: '2026-09-25T09:00:00+02:00',
      }),
    ).toThrow();

    expect(() =>
      createScheduledActionInputSchema.parse({
        title: 'Unsupported recurrence',
        actionType: 'REMINDER',
        payload: {
          kind: 'REMINDER',
          message: 'Nope',
        },
        runAt: '2026-09-25T09:00:00+02:00',
        recurrenceRule: 'FREQ=MONTHLY;INTERVAL=1',
      }),
    ).toThrow('Recurrence must use');
  });

  it('keeps delivery payload kind aligned with action type and email owner-only', () => {
    expect(() =>
      createScheduledActionInputSchema.parse({
        title: 'Mismatched',
        actionType: 'REMINDER',
        payload: {
          kind: 'DIGEST',
          scope: 'TODAY',
        },
        runAt: '2026-09-25T09:00:00+02:00',
      }),
    ).toThrow('payload kind must match');

    expect(() =>
      createScheduledActionInputSchema.parse({
        title: 'External mail',
        actionType: 'EMAIL',
        payload: {
          kind: 'EMAIL',
          recipient: 'CUSTOMER',
          subject: 'Update',
          body: 'Not allowed automatically',
        },
        runAt: '2026-09-25T09:00:00+02:00',
      }),
    ).toThrow();

    expect(
      createScheduledActionInputSchema.parse({
        title: 'Owner mail',
        actionType: 'EMAIL',
        payload: {
          kind: 'EMAIL',
          recipient: 'OWNER',
          subject: 'Daily brief',
          body: 'Today items',
        },
        runAt: '2026-09-25T09:00:00+02:00',
      }).payload,
    ).toMatchObject({ recipient: 'OWNER' });
  });

  it('requires terminal actions to clear nextRunAt', () => {
    expect(() =>
      scheduledActionSchema.parse({
        id: ACTION_ID,
        jobId: null,
        taskId: null,
        title: 'One time',
        actionType: 'REMINDER',
        payload: {
          kind: 'REMINDER',
          message: 'Do thing',
        },
        timezone: 'Africa/Johannesburg',
        recurrenceRule: null,
        status: 'COMPLETED',
        runAt: '2026-09-25T07:00:00.000Z',
        nextRunAt: '2026-09-25T07:00:00.000Z',
        lastRunAt: '2026-09-25T07:00:00.000Z',
        createdAt: '2026-09-24T07:00:00.000Z',
        updatedAt: '2026-09-25T07:00:00.000Z',
        revision: 2,
      }),
    ).toThrow('must clear nextRunAt');
  });

  it('rejects completion timestamps outside the lease window', () => {
    const baseRun = {
      id: RUN_ID,
      scheduledActionId: ACTION_ID,
      occurrenceKey: `OCC-${ACTION_ID}-2026-09-25T07:00:00.000Z`,
      scheduledFor: '2026-09-25T07:00:00.000Z',
      deliverySnapshot: {
        title: 'Lease-window fixture',
        actionType: 'REMINDER' as const,
        payload: {
          kind: 'REMINDER' as const,
          message: 'Lease-window fixture',
        },
        timezone: 'Africa/Johannesburg' as const,
      },
      status: 'SUCCEEDED' as const,
      leaseToken: LEASE_ID,
      workerId: 'worker-a',
      leaseExpiresAt: '2026-09-25T07:05:00.000Z',
      attempt: 1,
      providerMessageId: null,
      errorCode: null,
      errorDetail: null,
      claimedAt: '2026-09-25T07:00:00.000Z',
    };

    expect(() =>
      scheduledActionRunSchema.parse({
        ...baseRun,
        completedAt: '2026-09-25T06:59:59.000Z',
      }),
    ).toThrow('within the current lease window');

    expect(() =>
      scheduledActionRunSchema.parse({
        ...baseRun,
        completedAt: '2026-09-25T07:05:01.000Z',
      }),
    ).toThrow('within the current lease window');
  });

  it('keeps run completion metadata consistent with run status', () => {
    expect(
      scheduledActionRunSchema.parse({
        id: RUN_ID,
        scheduledActionId: ACTION_ID,
        occurrenceKey: `OCC-${ACTION_ID}-2026-09-25T07:00:00.000Z`,
        scheduledFor: '2026-09-25T07:00:00.000Z',
        deliverySnapshot: {
          title: 'Do thing',
          actionType: 'REMINDER',
          payload: {
            kind: 'REMINDER',
            message: 'Do thing',
          },
          timezone: 'Africa/Johannesburg',
        },
        status: 'CLAIMED',
        leaseToken: LEASE_ID,
        workerId: 'worker-a',
        leaseExpiresAt: '2026-09-25T07:05:00.000Z',
        attempt: 1,
        providerMessageId: null,
        errorCode: null,
        errorDetail: null,
        claimedAt: '2026-09-25T07:00:00.000Z',
        completedAt: null,
      }).status,
    ).toBe('CLAIMED');

    expect(() =>
      scheduledActionRunSchema.parse({
        id: RUN_ID,
        scheduledActionId: ACTION_ID,
        occurrenceKey: `OCC-${ACTION_ID}-2026-09-25T07:00:00.000Z`,
        scheduledFor: '2026-09-25T07:00:00.000Z',
        deliverySnapshot: {
          title: 'Do thing',
          actionType: 'REMINDER',
          payload: {
            kind: 'REMINDER',
            message: 'Do thing',
          },
          timezone: 'Africa/Johannesburg',
        },
        status: 'FAILED',
        leaseToken: LEASE_ID,
        workerId: 'worker-a',
        leaseExpiresAt: '2026-09-25T07:05:00.000Z',
        attempt: 1,
        providerMessageId: null,
        errorCode: null,
        errorDetail: null,
        claimedAt: '2026-09-25T07:00:00.000Z',
        completedAt: '2026-09-25T07:01:00.000Z',
      }),
    ).toThrow('Failed runs require');
  });
});
