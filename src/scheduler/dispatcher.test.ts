import { describe, expect, it } from 'vitest';
import { MemoryDomainStore } from '../db/memory/memory-store';
import { DomainKernel } from '../domain/kernel';
import type {
  DeliveryProvider,
  DeliveryRequest,
} from './delivery-provider';
import { SchedulerDispatcher } from './dispatcher';

function makeFixture(provider: DeliveryProvider) {
  const ids = Array.from(
    { length: 120 },
    (_, index) =>
      `${(0x84000000 + index + 1)
        .toString(16)
        .padStart(8, '0')}-0000-4000-8000-000000000001`,
  );
  let idIndex = 0;
  let mutationIndex = 0;
  const kernel = new DomainKernel(new MemoryDomainStore(), {
    clock: () => '2026-09-24T07:00:00.000Z',
    idGenerator: () => {
      const id = ids[idIndex];
      if (id === undefined) throw new Error('Dispatcher id pool exhausted');
      idIndex += 1;
      return id;
    },
  });
  const dispatcher = new SchedulerDispatcher(kernel, provider, {
    mutationIdGenerator: () => {
      mutationIndex += 1;
      return `MUT-DISPATCH-0000-${String(mutationIndex).padStart(4, '0')}`;
    },
    completedAt: () => '2026-09-24T07:01:00.000Z',
    leaseSeconds: 300,
  });
  return { kernel, dispatcher };
}

describe('SchedulerDispatcher', () => {
  it('uses the occurrence key as the provider idempotency key across retry', async () => {
    const requests: DeliveryRequest[] = [];
    let attempt = 0;
    const provider: DeliveryProvider = {
      deliver: (request) => {
        requests.push(structuredClone(request));
        attempt += 1;
        if (attempt === 1) {
          return Promise.reject(new Error('temporary provider failure'));
        }
        return Promise.resolve({
          providerMessageId: 'provider-message-1',
        });
      },
    };
    const { kernel, dispatcher } = makeFixture(provider);

    const action = await kernel.createScheduledAction(
      {
        mutationId: 'MUT-dispatch-create-01',
        actor: 'operator-ui',
      },
      {
        jobId: null,
        taskId: null,
        title: 'Owner reminder',
        actionType: 'REMINDER',
        payload: {
          kind: 'REMINDER',
          message: 'Check repair shelf',
        },
        timezone: 'Africa/Johannesburg',
        recurrenceRule: null,
        runAt: '2026-09-24T07:00:00.000Z',
      },
    );

    const first = await dispatcher.dispatchDue(
      '2026-09-24T07:00:00.000Z',
      'worker-a',
    );
    expect(first).toHaveLength(1);
    expect(first[0]?.actionId).toBe(action.id);
    expect(first[0]?.outcome).toBe('FAILED');
    expect(typeof first[0]?.runId).toBe('string');

    const second = await dispatcher.dispatchDue(
      '2026-09-24T07:02:00.000Z',
      'worker-b',
    );
    expect(second).toEqual([
      {
        actionId: action.id,
        outcome: 'SUCCEEDED',
        runId: first[0]?.runId,
      },
    ]);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.idempotencyKey).toBe(
      requests[1]?.idempotencyKey,
    );
    expect(requests[0]?.run.occurrenceKey).toBe(
      requests[1]?.run.occurrenceKey,
    );
  });

  it('does not call delivery providers for leased occurrences', async () => {
    const requests: DeliveryRequest[] = [];
    const provider: DeliveryProvider = {
      deliver: (request) => {
        requests.push(structuredClone(request));
        return Promise.resolve({ providerMessageId: null });
      },
    };
    const { kernel, dispatcher } = makeFixture(provider);

    const action = await kernel.createScheduledAction(
      {
        mutationId: 'MUT-dispatch-create-02',
        actor: 'operator-ui',
      },
      {
        jobId: null,
        taskId: null,
        title: 'Leased reminder',
        actionType: 'REMINDER',
        payload: {
          kind: 'REMINDER',
          message: 'Already leased',
        },
        timezone: 'Africa/Johannesburg',
        recurrenceRule: null,
        runAt: '2026-09-24T07:00:00.000Z',
      },
    );

    await kernel.claimScheduledAction(
      {
        mutationId: 'MUT-dispatch-preclaim1',
        actor: 'system',
      },
      action.id,
      {
        asOf: '2026-09-24T07:00:00.000Z',
        workerId: 'other-worker',
        leaseSeconds: 300,
      },
    );

    const result = await dispatcher.dispatchDue(
      '2026-09-24T07:01:00.000Z',
      'worker-a',
    );
    expect(result).toEqual([
      {
        actionId: action.id,
        outcome: 'SKIPPED',
        runId: null,
      },
    ]);
    expect(requests).toEqual([]);
  });
});
