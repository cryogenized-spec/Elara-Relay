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
  public verify(accessToken: string): Promise<AuthIdentity> {
    if (accessToken !== ACCESS_TOKEN) {
      throw new AuthenticationError();
    }
    return Promise.resolve(identity);
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

function makeApi(options?: { allowedOrigins?: readonly string[] }) {
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
  return createApi(kernel, new TestAuthVerifier(), options);
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


  it('handles restricted browser CORS before bearer verification', async () => {
    const app = makeApi({
      allowedOrigins: ['http://127.0.0.1:4173'],
    });

    const allowed = await app.request('/work', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://127.0.0.1:4173',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'http://127.0.0.1:4173',
    );
    expect(
      allowed.headers.get('access-control-allow-headers')?.toLowerCase(),
    ).toContain('authorization');

    const denied = await app.request('/work', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://attacker.example',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
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

    const taskView = await app.request(`/tasks/${task.id}`, {
      headers: authorizationHeaders(),
    });
    expect(taskView.status).toBe(200);
    const taskDetail = (await taskView.json()) as {
      task: { id: string; title: string };
      job: { id: string; title: string } | null;
    };
    expect(taskDetail.task).toMatchObject({
      id: task.id,
      title: 'Pressure test through lunch',
    });
    expect(taskDetail.job).toMatchObject({
      id: job.id,
      title: 'Avenge-X regulator repair',
    });

    const jobView = await app.request(`/jobs/${job.id}`, {
      headers: authorizationHeaders(),
    });
    expect(jobView.status).toBe(200);
    const view = (await jobView.json()) as {
      party: { id: string; name: string };
      tasks: unknown[];
      events: unknown[];
    };
    expect(view.party).toEqual({
      id: party.id,
      name: 'Niven Naiker',
      kind: 'CUSTOMER',
      createdAt: '2026-09-24T09:00:00.000Z',
      updatedAt: '2026-09-24T09:00:00.000Z',
      revision: 1,
    });
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

    const dashboard = await app.request(
      '/dashboard?asOf=2026-09-24T09%3A00%3A00.000Z',
      { headers: authorizationHeaders() },
    );
    expect(dashboard.status).toBe(200);
    const dashboardResult = (await dashboard.json()) as {
      today: { asOf: string; tasks: unknown[] };
      work: { parties: unknown[]; jobs: unknown[]; tasks: unknown[] };
      repairs: { parties: unknown[]; jobs: unknown[]; repairs: unknown[] };
      schedule: {
        asOf: string;
        due: unknown[];
        upcoming: unknown[];
        paused: unknown[];
      };
    };
    expect(dashboardResult.today.asOf).toBe('2026-09-24T09:00:00.000Z');
    expect(dashboardResult.schedule.asOf).toBe(dashboardResult.today.asOf);
    expect(dashboardResult.work.jobs).toHaveLength(1);
    expect(dashboardResult.repairs.jobs).toHaveLength(1);

    const work = await app.request('/work', {
      headers: authorizationHeaders(),
    });
    expect(work.status).toBe(200);
    const workResult = (await work.json()) as {
      parties: unknown[];
      jobs: unknown[];
      tasks: unknown[];
    };
    expect(workResult.parties).toHaveLength(1);
    expect(workResult.jobs).toHaveLength(1);
    expect(workResult.tasks).toHaveLength(2);

    const repairs = await app.request('/repairs', {
      headers: authorizationHeaders(),
    });
    expect(repairs.status).toBe(200);
    const repairsResult = (await repairs.json()) as {
      parties: Array<{
        id: string;
        name: string;
        kind: string;
        createdAt: string;
        updatedAt: string;
        revision: number;
      }>;
      jobs: Array<{
        id: string;
        key: string;
        title: string;
        category: string;
        partyId: string | null;
        createdAt: string;
        updatedAt: string;
        revision: number;
      }>;
      repairs: unknown[];
    };
    expect(repairsResult.parties).toEqual([
      {
        id: party.id,
        name: 'Niven Naiker',
        kind: 'CUSTOMER',
        createdAt: '2026-09-24T09:00:00.000Z',
        updatedAt: '2026-09-24T09:00:00.000Z',
        revision: 1,
      },
    ]);
    expect(repairsResult.jobs).toHaveLength(1);
    expect(repairsResult.jobs[0]).toMatchObject({
      id: job.id,
      title: 'Avenge-X regulator repair',
      category: 'ACTIVE',
      partyId: party.id,
      createdAt: '2026-09-24T09:00:00.000Z',
      updatedAt: '2026-09-24T09:00:00.000Z',
      revision: 2,
    });
    expect(repairsResult.jobs[0]?.key).toMatch(/^JOB-[A-F0-9]{8}$/);
    expect(repairsResult.repairs).toEqual([]);
  });

  it('creates a Repair case through replay-safe composite steps', async () => {
    const app = makeApi();
    const request = {
      mutation: { mutationId: 'MUT-repaircase-0001' },
      input: {
        party: {
          mode: 'NEW_CUSTOMER',
          name: 'Atomic Repair Customer',
        },
        jobTitle: 'Atomic Repair Job',
        reportedFault: 'Valve leak',
        serialState: 'UNKNOWN',
        serialValue: null,
        storageLocation: 'Workshop shelf',
      },
    };

    const first = await jsonRequest(app, '/repair-cases', 'POST', request);
    expect(first.status).toBe(201);
    const result = (await first.json()) as {
      party: { id: string; name: string };
      job: { id: string; title: string; partyId: string };
      repair: { id: string; jobId: string; reportedFault: string };
    };
    expect(result.party.name).toBe('Atomic Repair Customer');
    expect(result.job).toMatchObject({
      title: 'Atomic Repair Job',
      partyId: result.party.id,
    });
    expect(result.repair).toMatchObject({
      jobId: result.job.id,
      reportedFault: 'Valve leak',
    });

    const replay = await jsonRequest(app, '/repair-cases', 'POST', request);
    expect(replay.status).toBe(201);
    await expect(replay.json()).resolves.toEqual(result);

    const changedIntent = await jsonRequest(app, '/repair-cases', 'POST', {
      ...request,
      input: {
        ...request.input,
        jobTitle: 'Changed Repair Job',
      },
    });
    expect(changedIntent.status).toBe(409);

    const repairs = await app.request('/repairs', {
      headers: authorizationHeaders(),
    });
    const repairState = (await repairs.json()) as {
      parties: Array<{ id: string }>;
      jobs: Array<{ id: string }>;
      repairs: Array<{ id: string }>;
    };
    expect(repairState.parties).toHaveLength(1);
    expect(repairState.jobs).toHaveLength(1);
    expect(repairState.repairs).toHaveLength(1);
    expect(repairState.repairs[0]?.id).toBe(result.repair.id);
  });

  it('reuses an existing Party in a composite Repair case without duplicating it', async () => {
    const app = makeApi();
    const partyResponse = await jsonRequest(app, '/parties', 'POST', {
      mutation: { mutationId: 'MUT-repaircase-party-0001' },
      input: { name: 'Existing Customer', kind: 'CUSTOMER' },
    });
    const party = (await partyResponse.json()) as { id: string };

    const response = await jsonRequest(app, '/repair-cases', 'POST', {
      mutation: { mutationId: 'MUT-repaircase-0002' },
      input: {
        party: { mode: 'EXISTING', partyId: party.id },
        jobTitle: 'Existing customer repair',
        reportedFault: 'Pressure loss',
        serialState: 'KNOWN',
        serialValue: 'SER-100',
        storageLocation: null,
      },
    });
    expect(response.status).toBe(201);

    const repairs = await app.request('/repairs', {
      headers: authorizationHeaders(),
    });
    const repairState = (await repairs.json()) as {
      parties: Array<{ id: string }>;
      jobs: Array<{ partyId: string | null }>;
      repairs: unknown[];
    };
    expect(repairState.parties).toHaveLength(1);
    expect(repairState.jobs).toHaveLength(1);
    expect(repairState.jobs[0]?.partyId).toBe(party.id);
    expect(repairState.repairs).toHaveLength(1);
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
