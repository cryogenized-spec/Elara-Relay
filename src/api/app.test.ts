import { describe, expect, it } from 'vitest';
import { MemoryDomainStore } from '../db/memory/memory-store';
import { DomainKernel } from '../domain/kernel';
import { api, createApi } from './app';

const ids = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000007',
  '10000000-0000-4000-8000-000000000008',
  '10000000-0000-4000-8000-000000000009',
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000013',
  '10000000-0000-4000-8000-000000000014',
  '10000000-0000-4000-8000-000000000015',
  '10000000-0000-4000-8000-000000000016',
] as const;

function makeApi() {
  let index = 0;
  const kernel = new DomainKernel(new MemoryDomainStore(), {
    clock: () => '2026-09-24T09:00:00.000Z',
    idGenerator: () => {
      const id = ids[index];
      if (id === undefined) throw new Error('API test id pool exhausted');
      index += 1;
      return id;
    },
  });
  return createApi(kernel);
}

async function jsonRequest(
  app: ReturnType<typeof createApi>,
  path: string,
  method: string,
  body?: unknown,
) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return app.request(path, init);
}

describe('API foundation', () => {
  it('exposes a deterministic health response', async () => {
    const response = await api.request('/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: 'elara-relay',
      status: 'ok',
      schemaVersion: 1,
    });
  });

  it('runs the intent-level job/task workflow without exposing raw storage', async () => {
    const app = makeApi();

    const partyResponse = await jsonRequest(app, '/parties', 'POST', {
      mutation: {
        mutationId: 'MUT-api-party-0001',
        actor: 'operator-ui',
      },
      input: {
        name: 'Niven Naiker',
        kind: 'CUSTOMER',
      },
    });
    expect(partyResponse.status).toBe(201);
    const party = (await partyResponse.json()) as { id: string };

    const jobResponse = await jsonRequest(app, '/jobs', 'POST', {
      mutation: {
        mutationId: 'MUT-api-job-000001',
        actor: 'operator-ui',
      },
      input: {
        title: 'Avenge-X regulator repair',
        category: 'ACTIVE',
        partyId: party.id,
      },
    });
    expect(jobResponse.status).toBe(201);
    const job = (await jobResponse.json()) as { id: string; revision: number };

    const taskResponse = await jsonRequest(app, '/tasks', 'POST', {
      mutation: {
        mutationId: 'MUT-api-task-00001',
        actor: 'chatgpt',
      },
      input: {
        jobId: job.id,
        title: 'Pressure test overnight',
        priority: 'HIGH',
        dueAt: '2026-09-24T08:00:00.000Z',
        followUpAt: null,
      },
    });
    expect(taskResponse.status).toBe(201);
    const task = (await taskResponse.json()) as {
      id: string;
      revision: number;
    };

    const updateResponse = await jsonRequest(
      app,
      `/tasks/${task.id}`,
      'PATCH',
      {
        mutation: {
          mutationId: 'MUT-api-update-0001',
          actor: 'operator-ui',
          expectedRevision: task.revision,
        },
        patch: {
          title: 'Pressure test through lunch',
        },
      },
    );
    expect(updateResponse.status).toBe(200);
    const updated = (await updateResponse.json()) as { revision: number };

    const waitResponse = await jsonRequest(
      app,
      `/tasks/${task.id}/wait`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-api-wait-000001',
          actor: 'operator-ui',
          expectedRevision: updated.revision,
        },
        input: {
          waitingOn: 'Pressure stability',
          followUpAt: '2026-09-24T09:00:00.000Z',
        },
      },
    );
    expect(waitResponse.status).toBe(200);
    const waiting = (await waitResponse.json()) as { revision: number };

    const todayResponse = await app.request(
      '/today?asOf=2026-09-24T09%3A00%3A00.000Z',
    );
    expect(todayResponse.status).toBe(200);
    const today = (await todayResponse.json()) as { tasks: unknown[] };
    expect(today.tasks).toHaveLength(1);

    const completeResponse = await jsonRequest(
      app,
      `/tasks/${task.id}/complete`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-api-complete-001',
          actor: 'operator-ui',
          expectedRevision: waiting.revision,
        },
      },
    );
    expect(completeResponse.status).toBe(200);

    const cancellationTask = await jsonRequest(app, '/tasks', 'POST', {
      mutation: {
        mutationId: 'MUT-api-cancel-new-01',
        actor: 'operator-ui',
      },
      input: {
        jobId: job.id,
        title: 'Temporary follow-up',
        priority: 'LOW',
        dueAt: null,
        followUpAt: null,
      },
    });
    expect(cancellationTask.status).toBe(201);
    const cancellable = (await cancellationTask.json()) as {
      id: string;
      revision: number;
    };

    const cancellation = await jsonRequest(
      app,
      `/tasks/${cancellable.id}/cancel`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-api-cancel-run-01',
          actor: 'operator-ui',
          expectedRevision: cancellable.revision,
        },
      },
    );
    expect(cancellation.status).toBe(200);

    const noteResponse = await jsonRequest(
      app,
      `/jobs/${job.id}/events`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-api-job-note-001',
          actor: 'chatgpt',
          expectedRevision: job.revision,
        },
        detail: 'Transfer seals fitted',
      },
    );
    expect(noteResponse.status).toBe(201);

    const jobView = await app.request(`/jobs/${job.id}`);
    expect(jobView.status).toBe(200);
    const view = (await jobView.json()) as { tasks: unknown[]; events: unknown[] };
    expect(view.tasks).toHaveLength(2);
    const eventTypes = (view as { events: Array<{ eventType: string }> }).events.map(
      (event) => event.eventType,
    );
    expect(eventTypes).toEqual([
      'JOB_CREATED',
      'TASK_CREATED',
      'TASK_UPDATED',
      'TASK_WAITING',
      'TASK_COMPLETED',
      'TASK_CREATED',
      'TASK_CANCELLED',
      'JOB_NOTE',
    ]);

    const search = await app.request('/search?q=transfer');
    expect(search.status).toBe(200);
    const searchResult = (await search.json()) as { events: unknown[] };
    expect(searchResult.events).toHaveLength(1);
  });

  it('maps domain conflicts, missing entities, and malformed requests safely', async () => {
    const app = makeApi();

    const malformedJson = await app.request('/parties', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"mutation":',
    });
    expect(malformedJson.status).toBe(400);

    const malformed = await jsonRequest(app, '/parties', 'POST', {
      mutation: {
        mutationId: 'bad',
        actor: 'operator-ui',
      },
      input: {
        name: 'Bad mutation',
        kind: 'OTHER',
      },
    });
    expect(malformed.status).toBe(400);

    const missing = await app.request(
      '/jobs/10000000-0000-4000-8000-999999999999',
    );
    expect(missing.status).toBe(404);

    const partyBody = {
      mutation: {
        mutationId: 'MUT-api-replay-0001',
        actor: 'operator-ui',
      },
      input: {
        name: 'First',
        kind: 'OTHER',
      },
    };
    expect((await jsonRequest(app, '/parties', 'POST', partyBody)).status).toBe(201);

    const conflict = await jsonRequest(app, '/parties', 'POST', {
      ...partyBody,
      input: {
        name: 'Changed intent',
        kind: 'OTHER',
      },
    });
    expect(conflict.status).toBe(409);
  });
});
