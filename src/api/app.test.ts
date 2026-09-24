import { describe, expect, it } from 'vitest';
import type {
  AuthIdentity,
  AuthVerifier,
} from '../auth/auth-verifier';
import { AuthenticationError } from '../auth/errors';
import { MemoryDomainStore } from '../db/memory/memory-store';
import { DomainKernel } from '../domain/kernel';
import { api, createApi } from './app';

const ACCESS_TOKEN = 'header.payload.signature';

const identity: AuthIdentity = {
  userId: '30000000-0000-4000-8000-000000000001',
  sessionId: '30000000-0000-4000-8000-000000000002',
  email: 'owner@example.com',
  aal: 'aal1',
};

class TestAuthVerifier implements AuthVerifier {
  public async verify(accessToken: string): Promise<AuthIdentity> {
    if (accessToken !== ACCESS_TOKEN) {
      throw new AuthenticationError();
    }
    return identity;
  }
}

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
  return createApi(kernel, new TestAuthVerifier());
}

function authorizationHeaders(): HeadersInit {
  return {
    authorization: `Bearer ${ACCESS_TOKEN}`,
  };
}

async function jsonRequest(
  app: ReturnType<typeof createApi>,
  path: string,
  method: string,
  body?: unknown,
) {
  const init: RequestInit = {
    method,
    headers: authorizationHeaders(),
  };
  if (body !== undefined) {
    init.headers = {
      ...authorizationHeaders(),
      'content-type': 'application/json',
    };
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

  it('keeps health public while every domain route fails closed', async () => {
    const app = makeApi();

    expect((await app.request('/health')).status).toBe(200);

    const missing = await app.request('/today?asOf=2026-09-24T09:00:00.000Z');
    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toBe('Bearer');

    const malformed = await app.request(
      '/today?asOf=2026-09-24T09:00:00.000Z',
      { headers: { authorization: 'Basic nope' } },
    );
    expect(malformed.status).toBe(401);

    const invalid = await app.request(
      '/today?asOf=2026-09-24T09:00:00.000Z',
      { headers: { authorization: 'Bearer bad.token.value' } },
    );
    expect(invalid.status).toBe(401);
  });

  it('exposes only the verified identity and never trusts caller actor claims', async () => {
    const app = makeApi();

    const whoami = await app.request('/auth/whoami', {
      headers: authorizationHeaders(),
    });
    expect(whoami.status).toBe(200);
    await expect(whoami.json()).resolves.toEqual(identity);

    const spoof = await jsonRequest(app, '/parties', 'POST', {
      mutation: {
        mutationId: 'MUT-api-actor-spoof-01',
        actor: 'system',
      },
      input: {
        name: 'Spoof attempt',
        kind: 'OTHER',
      },
    });
    expect(spoof.status).toBe(400);
  });

  it('refuses to construct persistent domain routes without an AuthVerifier', () => {
    const kernel = new DomainKernel(new MemoryDomainStore());
    expect(() => createApi(kernel)).toThrow(
      'AuthVerifier is required whenever domain routes are enabled',
    );
  });

  it('runs the intent-level job/task workflow without exposing raw storage', async () => {
    const app = makeApi();

    const partyResponse = await jsonRequest(app, '/parties', 'POST', {
      mutation: {
        mutationId: 'MUT-api-party-0001',
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
      { headers: authorizationHeaders() },
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
          expectedRevision: waiting.revision,
        },
      },
    );
    expect(completeResponse.status).toBe(200);

    const cancellationTask = await jsonRequest(app, '/tasks', 'POST', {
      mutation: {
        mutationId: 'MUT-api-cancel-new-01',
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
          expectedRevision: job.revision,
        },
        detail: 'Transfer seals fitted',
      },
    );
    expect(noteResponse.status).toBe(201);

    const jobView = await app.request(`/jobs/${job.id}`, {
      headers: authorizationHeaders(),
    });
    expect(jobView.status).toBe(200);
    const view = (await jobView.json()) as { tasks: unknown[]; events: unknown[] };
    expect(view.tasks).toHaveLength(2);
    const events = (
      view as {
        events: Array<{ eventType: string; actor: string }>;
      }
    ).events;
    const eventTypes = events.map((event) => event.eventType);
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
    expect(events.every((event) => event.actor === 'operator-ui')).toBe(true);

    const search = await app.request('/search?q=transfer', {
      headers: authorizationHeaders(),
    });
    expect(search.status).toBe(200);
    const searchResult = (await search.json()) as { events: unknown[] };
    expect(searchResult.events).toHaveLength(1);
  });

  it('maps domain conflicts, missing entities, and malformed requests safely', async () => {
    const app = makeApi();

    const malformedJson = await app.request('/parties', {
      method: 'POST',
      headers: {
        ...authorizationHeaders(),
        'content-type': 'application/json',
      },
      body: '{"mutation":',
    });
    expect(malformedJson.status).toBe(400);

    const malformed = await jsonRequest(app, '/parties', 'POST', {
      mutation: {
        mutationId: 'bad',
      },
      input: {
        name: 'Bad mutation',
        kind: 'OTHER',
      },
    });
    expect(malformed.status).toBe(400);

    const missing = await app.request(
      '/jobs/10000000-0000-4000-8000-999999999999',
      { headers: authorizationHeaders() },
    );
    expect(missing.status).toBe(404);

    const partyBody = {
      mutation: {
        mutationId: 'MUT-api-replay-0001',
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
