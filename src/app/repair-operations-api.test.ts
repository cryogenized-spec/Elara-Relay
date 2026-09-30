import { describe, expect, it, vi } from 'vitest';
import { createApi } from '../api/app';
import { MemoryDomainStore } from '../db/memory/memory-store';
import { DomainKernel } from '../domain/kernel';
import { createOperationsApi } from './operations-api';

async function fixture() {
  const kernel = new DomainKernel(new MemoryDomainStore());
  const { repair } = await kernel.createRepairCase(
    { mutationId: 'MUT-client-repair-case-001', actor: 'operator-ui' },
    {
      party: { mode: 'NEW_CUSTOMER', name: 'Customer' },
      jobTitle: 'Repair',
      reportedFault: 'Pressure drop',
      serialState: 'UNKNOWN',
      serialValue: null,
      storageLocation: null,
    },
  );
  const server = createApi(kernel, {
    verify: () =>
      Promise.resolve({
        userId: '30000000-0000-4000-8000-000000000001',
        sessionId: '30000000-0000-4000-8000-000000000002',
        email: 'owner@example.com',
        aal: 'aal1',
      }),
  });
  const fetchImpl = vi.fn<typeof fetch>((url, init) =>
    Promise.resolve(
      server.request(
        typeof url === 'string' ? url : url instanceof URL ? url.href : url,
        init,
      ),
    ),
  );
  const api = createOperationsApi({
    baseUrl: 'https://api.example.com',
    getAccessToken: () => 'test.payload.signature',
    fetchImpl,
  });
  return { api, fetchImpl, kernel, repair };
}

describe('Repair mutation browser API', () => {
  it('uses the existing versioned routes, validates results, and never supplies an actor', async () => {
    const { api, fetchImpl, repair } = await fixture();
    const patch = { diagnosis: 'Seal leak', currentFinding: 'Replace seal' };
    const updated = await api.updateRepairDetails(repair.id, {
      mutationId: 'MUT-client-details-001',
      expectedRevision: 1,
      patch,
    });
    expect(updated).toMatchObject({ ...patch, revision: 2 });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `https://api.example.com/repairs/${repair.id}`,
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'PATCH',
      headers: {
        authorization: 'Bearer test.payload.signature',
        'content-type': 'application/json',
      },
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        mutation: { mutationId: 'MUT-client-details-001', expectedRevision: 1 },
        patch,
      }),
    );
    await api.moveRepairStage(repair.id, {
      mutationId: 'MUT-client-stage-diag',
      expectedRevision: 2,
      input: { stage: 'DIAGNOSING' },
    });
    await api.moveRepairStage(repair.id, {
      mutationId: 'MUT-client-stage-test',
      expectedRevision: 3,
      input: { stage: 'TESTING' },
    });
    const tested = await api.recordRepairTest(repair.id, {
      mutationId: 'MUT-client-test-pass1',
      expectedRevision: 4,
      input: { result: 'PASS', detail: 'Pressure stable' },
    });
    expect(tested).toMatchObject({
      stage: 'TESTING',
      finalTestResult: 'PASS',
      finalTestDetail: 'Pressure stable',
      revision: 5,
    });
    expect(fetchImpl.mock.calls[3]?.[0]).toBe(
      `https://api.example.com/repairs/${repair.id}/test`,
    );
    expect(fetchImpl.mock.calls[3]?.[1]?.body).toBe(
      JSON.stringify({
        mutation: { mutationId: 'MUT-client-test-pass1', expectedRevision: 4 },
        input: { result: 'PASS', detail: 'Pressure stable' },
      }),
    );
  });

  it('surfaces server validation and revision conflicts without changing durable state', async () => {
    const { api, repair, kernel } = await fixture();
    await expect(
      api.moveRepairStage(repair.id, {
        mutationId: 'MUT-client-invalid-stage',
        expectedRevision: 1,
        input: { stage: 'COLLECTED' },
      }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    await expect(
      api.recordRepairTest(repair.id, {
        mutationId: 'MUT-client-invalid-test1',
        expectedRevision: 1,
        input: { result: 'PASS', detail: null },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Final test results may only be recorded while testing',
    });
    await expect(
      api.updateRepairDetails(repair.id, {
        mutationId: 'MUT-client-stale-details',
        expectedRevision: 9,
        patch: { diagnosis: 'Stale' },
      }),
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
    expect((await kernel.getRepair(repair.id)).repair).toEqual(repair);
  });

  it('strictly rejects malformed mutation successes instead of accepting an optimistic row', async () => {
    const { api, fetchImpl, repair } = await fixture();
    fetchImpl.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...repair,
          stage: 'READY',
          readyAt: repair.createdAt,
        }),
        { status: 200 },
      ),
    );
    await expect(
      api.moveRepairStage(repair.id, {
        mutationId: 'MUT-client-malformed-row',
        expectedRevision: 1,
        input: { stage: 'DIAGNOSING' },
      }),
    ).rejects.toThrow('passing final test');
  });

  it('replays an unchanged versioned Repair intent without duplicating Events', async () => {
    const { api, repair, kernel } = await fixture();
    const command = {
      mutationId: 'MUT-client-replay-details',
      expectedRevision: 1,
      patch: { currentFinding: 'A single update' },
    };
    const first = await api.updateRepairDetails(repair.id, command);
    expect(await api.updateRepairDetails(repair.id, command)).toEqual(first);
    const events = (await kernel.getJob(repair.jobId)).events;
    expect(
      events.filter((event) => event.eventType === 'REPAIR_DETAILS_UPDATED'),
    ).toHaveLength(1);
    expect(
      events.find((event) => event.eventType === 'REPAIR_DETAILS_UPDATED')
        ?.actor,
    ).toBe('operator-ui');
  });
});
