import { describe, expect, it } from 'vitest';
import { MemoryDomainStore } from '../db/memory/memory-store';
import { DomainKernel } from './kernel';
import { nextOccurrenceAfter } from './scheduler-recurrence';

function makeKernel() {
  const store = new MemoryDomainStore();
  const ids = Array.from(
    { length: 160 },
    (_, index) =>
      `${(0x82000000 + index + 1)
        .toString(16)
        .padStart(8, '0')}-0000-4000-8000-000000000001`,
  );
  let idIndex = 0;
  const kernel = new DomainKernel(store, {
    clock: () => '2026-09-24T06:00:00.000Z',
    idGenerator: () => {
      const id = ids[idIndex];
      if (id === undefined) throw new Error('Scheduler test id pool exhausted');
      idIndex += 1;
      return id;
    },
  });
  return { kernel, store };
}

async function createReminder(
  kernel: DomainKernel,
  mutationId = 'MUT-schedule-create-001',
) {
  return kernel.createScheduledAction(
    {
      mutationId,
      actor: 'operator-ui',
    },
    {
      jobId: null,
      taskId: null,
      title: 'Supplier follow-up',
      actionType: 'REMINDER',
      payload: {
        kind: 'REMINDER',
        message: 'Check seal order',
      },
      timezone: 'Africa/Johannesburg',
      recurrenceRule: null,
      runAt: '2026-09-24T07:00:00.000Z',
    },
  );
}

describe('Scheduler domain', () => {
  it('completes a one-time occurrence exactly once', async () => {
    const { kernel } = makeKernel();
    const action = await createReminder(kernel);

    const schedule = await kernel.getSchedule('2026-09-24T07:00:00.000Z');
    expect(schedule.due.map((value) => value.id)).toEqual([action.id]);

    const run = await kernel.claimScheduledAction(
      {
        mutationId: 'MUT-schedule-claim-001',
        actor: 'system',
      },
      action.id,
      {
        asOf: '2026-09-24T07:00:00.000Z',
        workerId: 'worker-a',
        leaseSeconds: 300,
      },
    );
    expect(run.attempt).toBe(1);
    expect(run.occurrenceKey).toContain(action.id);

    await expect(
      kernel.claimScheduledAction(
        {
          mutationId: 'MUT-schedule-claim-002',
          actor: 'system',
        },
        action.id,
        {
          asOf: '2026-09-24T07:01:00.000Z',
          workerId: 'worker-b',
          leaseSeconds: 300,
        },
      ),
    ).rejects.toThrow('already leased');

    const completed = await kernel.recordScheduledActionSuccess(
      {
        mutationId: 'MUT-schedule-success-01',
        actor: 'system',
      },
      {
        runId: run.id,
        leaseToken: run.leaseToken,
        completedAt: '2026-09-24T07:02:00.000Z',
        providerMessageId: 'delivery-001',
      },
    );

    expect(completed.status).toBe('COMPLETED');
    expect(completed.nextRunAt).toBeNull();
    expect(completed.lastRunAt).toBe('2026-09-24T07:00:00.000Z');
    expect((await kernel.getSchedule('2026-09-24T08:00:00.000Z')).due).toEqual(
      [],
    );
  });

  it('rejects a worker that completes after its lease has expired', async () => {
    const { kernel } = makeKernel();
    const action = await createReminder(
      kernel,
      'MUT-schedule-create-expired',
    );
    const run = await kernel.claimScheduledAction(
      {
        mutationId: 'MUT-schedule-expired-claim',
        actor: 'system',
      },
      action.id,
      {
        asOf: '2026-09-24T07:00:00.000Z',
        workerId: 'worker-a',
        leaseSeconds: 60,
      },
    );

    await expect(
      kernel.recordScheduledActionSuccess(
        {
          mutationId: 'MUT-schedule-expired-success',
          actor: 'system',
        },
        {
          runId: run.id,
          leaseToken: run.leaseToken,
          completedAt: '2026-09-24T07:01:01.000Z',
          providerMessageId: 'too-late',
        },
      ),
    ).rejects.toThrow('lease expired before completion');
  });

  it('reclaims stale and failed leases without creating a second occurrence', async () => {
    const { kernel, store } = makeKernel();
    const action = await createReminder(kernel, 'MUT-schedule-create-002');

    const first = await kernel.claimScheduledAction(
      {
        mutationId: 'MUT-schedule-stale-claim1',
        actor: 'system',
      },
      action.id,
      {
        asOf: '2026-09-24T07:00:00.000Z',
        workerId: 'worker-a',
        leaseSeconds: 60,
      },
    );

    const second = await kernel.claimScheduledAction(
      {
        mutationId: 'MUT-schedule-stale-claim2',
        actor: 'system',
      },
      action.id,
      {
        asOf: '2026-09-24T07:02:00.000Z',
        workerId: 'worker-b',
        leaseSeconds: 60,
      },
    );

    expect(second.id).toBe(first.id);
    expect(second.occurrenceKey).toBe(first.occurrenceKey);
    expect(second.attempt).toBe(2);
    expect(second.leaseToken).not.toBe(first.leaseToken);

    await expect(
      kernel.recordScheduledActionSuccess(
        {
          mutationId: 'MUT-schedule-stale-old1',
          actor: 'system',
        },
        {
          runId: first.id,
          leaseToken: first.leaseToken,
          completedAt: '2026-09-24T07:02:30.000Z',
          providerMessageId: null,
        },
      ),
    ).rejects.toThrow('lease token no longer owns');

    const failed = await kernel.recordScheduledActionFailure(
      {
        mutationId: 'MUT-schedule-failure-01',
        actor: 'system',
      },
      {
        runId: second.id,
        leaseToken: second.leaseToken,
        completedAt: '2026-09-24T07:02:30.000Z',
        errorCode: 'TEMPORARY',
        errorDetail: 'Provider unavailable',
      },
    );
    expect(failed.status).toBe('FAILED');

    await kernel.updateScheduledAction(
      {
        mutationId: 'MUT-schedule-retry-edit',
        actor: 'operator-ui',
        expectedRevision: action.revision,
      },
      action.id,
      {
        payload: {
          kind: 'REMINDER',
          message: 'Edited after the original occurrence was claimed',
        },
      },
    );

    const retry = await kernel.claimScheduledAction(
      {
        mutationId: 'MUT-schedule-retry-001',
        actor: 'system',
      },
      action.id,
      {
        asOf: '2026-09-24T07:03:00.000Z',
        workerId: 'worker-c',
        leaseSeconds: 60,
      },
    );
    expect(retry.id).toBe(first.id);
    expect(retry.occurrenceKey).toBe(first.occurrenceKey);
    expect(retry.attempt).toBe(3);
    expect(retry.deliverySnapshot).toEqual(first.deliverySnapshot);
    expect(retry.deliverySnapshot.payload).toMatchObject({
      message: 'Check seal order',
    });

    const snapshot = await store.read((read) =>
      read.listScheduledActionRuns(),
    );
    expect(snapshot).toHaveLength(1);
  });

  it('skips accumulated recurrence backlog after one catch-up delivery', async () => {
    expect(
      nextOccurrenceAfter(
        'FREQ=DAILY;INTERVAL=1',
        '2026-09-24T07:00:00.000Z',
        '2026-09-27T08:00:00.000Z',
      ),
    ).toBe('2026-09-28T07:00:00.000Z');

    expect(
      nextOccurrenceAfter(
        'FREQ=WEEKLY;INTERVAL=2',
        '2026-09-01T07:00:00.000Z',
        '2026-09-29T07:00:00.000Z',
      ),
    ).toBe('2026-10-13T07:00:00.000Z');

    const { kernel } = makeKernel();
    const action = await kernel.createScheduledAction(
      {
        mutationId: 'MUT-schedule-recur-create',
        actor: 'operator-ui',
      },
      {
        jobId: null,
        taskId: null,
        title: 'Daily digest',
        actionType: 'DIGEST',
        payload: {
          kind: 'DIGEST',
          scope: 'TODAY',
        },
        timezone: 'Africa/Johannesburg',
        recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
        runAt: '2026-09-24T07:00:00.000Z',
      },
    );

    const run = await kernel.claimScheduledAction(
      {
        mutationId: 'MUT-schedule-recur-claim',
        actor: 'system',
      },
      action.id,
      {
        asOf: '2026-09-27T08:00:00.000Z',
        workerId: 'worker-a',
        leaseSeconds: 300,
      },
    );

    const next = await kernel.recordScheduledActionSuccess(
      {
        mutationId: 'MUT-schedule-recur-success',
        actor: 'system',
      },
      {
        runId: run.id,
        leaseToken: run.leaseToken,
        completedAt: '2026-09-27T08:00:00.000Z',
        providerMessageId: null,
      },
    );

    expect(next.status).toBe('ACTIVE');
    expect(next.nextRunAt).toBe('2026-09-28T07:00:00.000Z');
  });

  it('preserves an operator reschedule while an older occurrence is in flight', async () => {
    const { kernel } = makeKernel();
    const action = await createReminder(
      kernel,
      'MUT-schedule-create-resched',
    );
    const run = await kernel.claimScheduledAction(
      {
        mutationId: 'MUT-schedule-resched-claim',
        actor: 'system',
      },
      action.id,
      {
        asOf: '2026-09-24T07:00:00.000Z',
        workerId: 'worker-a',
        leaseSeconds: 300,
      },
    );

    const rescheduled = await kernel.updateScheduledAction(
      {
        mutationId: 'MUT-schedule-resched-edit1',
        actor: 'operator-ui',
        expectedRevision: action.revision,
      },
      action.id,
      {
        runAt: '2026-09-25T07:00:00.000Z',
      },
    );
    expect(rescheduled.nextRunAt).toBe('2026-09-25T07:00:00.000Z');

    const afterSuccess = await kernel.recordScheduledActionSuccess(
      {
        mutationId: 'MUT-schedule-resched-success',
        actor: 'system',
      },
      {
        runId: run.id,
        leaseToken: run.leaseToken,
        completedAt: '2026-09-24T07:01:00.000Z',
        providerMessageId: 'old-occurrence-delivery',
      },
    );

    expect(afterSuccess.status).toBe('ACTIVE');
    expect(afterSuccess.nextRunAt).toBe('2026-09-25T07:00:00.000Z');
    expect(afterSuccess.lastRunAt).toBe('2026-09-24T07:00:00.000Z');
  });

  it('preserves cancellation when an in-flight delivery finishes', async () => {
    const { kernel, store } = makeKernel();
    const action = await createReminder(kernel, 'MUT-schedule-create-003');
    const run = await kernel.claimScheduledAction(
      {
        mutationId: 'MUT-schedule-cancel-claim',
        actor: 'system',
      },
      action.id,
      {
        asOf: '2026-09-24T07:00:00.000Z',
        workerId: 'worker-a',
        leaseSeconds: 300,
      },
    );

    const cancelled = await kernel.cancelScheduledAction(
      {
        mutationId: 'MUT-schedule-cancel-action',
        actor: 'operator-ui',
        expectedRevision: action.revision,
      },
      action.id,
    );
    expect(cancelled.status).toBe('CANCELLED');

    const afterSuccess = await kernel.recordScheduledActionSuccess(
      {
        mutationId: 'MUT-schedule-cancel-success',
        actor: 'system',
      },
      {
        runId: run.id,
        leaseToken: run.leaseToken,
        completedAt: '2026-09-24T07:01:00.000Z',
        providerMessageId: 'delivery-after-cancel',
      },
    );

    expect(afterSuccess.status).toBe('CANCELLED');
    expect(afterSuccess.nextRunAt).toBeNull();

    const runs = await store.read((read) =>
      read.listScheduledActionRuns(),
    );
    expect(runs[0]?.status).toBe('SUCCEEDED');
  });

  it('supports edit, pause, resume, Today, search, and reference validation', async () => {
    const { kernel } = makeKernel();
    const job = await kernel.createJob(
      {
        mutationId: 'MUT-schedule-job-00001',
        actor: 'operator-ui',
      },
      {
        title: 'Supplier order',
        category: 'ACTIVE',
        partyId: null,
      },
    );
    const task = await kernel.createTask(
      {
        mutationId: 'MUT-schedule-task-0001',
        actor: 'operator-ui',
      },
      {
        jobId: job.id,
        title: 'Order regulator seal',
        priority: 'HIGH',
        dueAt: null,
        followUpAt: null,
      },
    );

    const action = await kernel.createScheduledAction(
      {
        mutationId: 'MUT-schedule-linked-new',
        actor: 'operator-ui',
      },
      {
        jobId: job.id,
        taskId: task.id,
        title: 'Check supplier ETA',
        actionType: 'REMINDER',
        payload: {
          kind: 'REMINDER',
          message: 'Check supplier ETA for regulator seal',
        },
        timezone: 'Africa/Johannesburg',
        recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
        runAt: '2026-09-24T07:00:00.000Z',
      },
    );

    const edited = await kernel.updateScheduledAction(
      {
        mutationId: 'MUT-schedule-linked-edit',
        actor: 'operator-ui',
        expectedRevision: action.revision,
      },
      action.id,
      {
        title: 'Check seal supplier ETA',
        runAt: '2026-09-25T07:00:00.000Z',
      },
    );
    expect(edited.nextRunAt).toBe('2026-09-25T07:00:00.000Z');

    const paused = await kernel.pauseScheduledAction(
      {
        mutationId: 'MUT-schedule-linked-pause',
        actor: 'operator-ui',
        expectedRevision: edited.revision,
      },
      action.id,
    );
    expect(paused.status).toBe('PAUSED');
    const pausedSchedule = await kernel.getSchedule(
      '2026-09-26T07:00:00.000Z',
    );
    expect(pausedSchedule.due).toEqual([]);
    expect(pausedSchedule.paused.map((value) => value.id)).toEqual([
      action.id,
    ]);

    const resumed = await kernel.resumeScheduledAction(
      {
        mutationId: 'MUT-schedule-linked-resume',
        actor: 'operator-ui',
        expectedRevision: paused.revision,
      },
      action.id,
    );
    expect(resumed.status).toBe('ACTIVE');

    const today = await kernel.getToday('2026-09-26T07:00:00.000Z');
    expect(today.scheduledActions.map((value) => value.id)).toEqual([
      action.id,
    ]);
    expect((await kernel.search('supplier eta')).scheduledActions).toHaveLength(
      1,
    );

    const jobView = await kernel.getJob(job.id);
    expect(jobView.scheduledActions.map((value) => value.id)).toEqual([
      action.id,
    ]);
    expect(
      jobView.events.some(
        (event) => event.eventType === 'SCHEDULED_ACTION_CREATED',
      ),
    ).toBe(true);

    await expect(
      kernel.createScheduledAction(
        {
          mutationId: 'MUT-schedule-bad-ref1',
          actor: 'operator-ui',
        },
        {
          jobId: '8f000000-0000-4000-8000-000000000001',
          taskId: null,
          title: 'Bad ref',
          actionType: 'REMINDER',
          payload: {
            kind: 'REMINDER',
            message: 'Bad ref',
          },
          timezone: 'Africa/Johannesburg',
          recurrenceRule: null,
          runAt: '2026-09-25T07:00:00.000Z',
        },
      ),
    ).rejects.toThrow('Job not found');
  });

  it('rejects execution commands from non-system actors', async () => {
    const { kernel } = makeKernel();
    const action = await createReminder(kernel, 'MUT-schedule-create-004');

    await expect(
      kernel.claimScheduledAction(
        {
          mutationId: 'MUT-schedule-bad-actor',
          actor: 'operator-ui',
        },
        action.id,
        {
          asOf: '2026-09-24T07:00:00.000Z',
          workerId: 'browser',
          leaseSeconds: 300,
        },
      ),
    ).rejects.toThrow('require the system actor');
  });
});
