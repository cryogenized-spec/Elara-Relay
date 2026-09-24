import { describe, expect, it } from 'vitest';
import type {
  AuthIdentity,
  AuthVerifier,
} from '../auth/auth-verifier';
import { MemoryDomainStore } from '../db/memory/memory-store';
import { DomainKernel } from '../domain/kernel';
import { createApi } from './app';

const ACCESS_TOKEN = 'scheduler.payload.signature';

const identity: AuthIdentity = {
  userId: '85000000-0000-4000-8000-000000000001',
  sessionId: '85000000-0000-4000-8000-000000000002',
  email: 'owner@example.com',
  aal: 'aal1',
};

const authVerifier: AuthVerifier = {
  verify: () => Promise.resolve(identity),
};

function makeApi() {
  const ids = Array.from(
    { length: 80 },
    (_, index) =>
      `${(0x85000100 + index + 1)
        .toString(16)
        .padStart(8, '0')}-0000-4000-8000-000000000001`,
  );
  let index = 0;
  const kernel = new DomainKernel(new MemoryDomainStore(), {
    clock: () => '2026-09-24T06:00:00.000Z',
    idGenerator: () => {
      const id = ids[index];
      if (id === undefined) throw new Error('Scheduler API id pool exhausted');
      index += 1;
      return id;
    },
  });
  return createApi(kernel, authVerifier);
}

async function jsonRequest(
  app: ReturnType<typeof createApi>,
  path: string,
  method: string,
  body?: unknown,
): Promise<Response> {
  const headers: HeadersInit = {
    authorization: `Bearer ${ACCESS_TOKEN}`,
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return app.request(path, init);
}

describe('Scheduler API', () => {
  it('manages scheduler intents through authenticated operator routes', async () => {
    const app = makeApi();

    const createResponse = await jsonRequest(app, '/schedule', 'POST', {
      mutation: {
        mutationId: 'MUT-scheduler-api-new1',
      },
      input: {
        jobId: null,
        taskId: null,
        title: 'Morning operations reminder',
        actionType: 'REMINDER',
        payload: {
          kind: 'REMINDER',
          message: 'Review Today screen',
        },
        timezone: 'Africa/Johannesburg',
        recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
        runAt: '2026-09-24T09:00:00+02:00',
      },
    });
    expect(createResponse.status).toBe(201);
    const action = (await createResponse.json()) as {
      id: string;
      revision: number;
      runAt: string;
      nextRunAt: string;
    };
    expect(action.runAt).toBe('2026-09-24T07:00:00.000Z');
    expect(action.nextRunAt).toBe(action.runAt);

    const scheduleResponse = await app.request(
      '/schedule?asOf=2026-09-24T07%3A00%3A00.000Z',
      {
        headers: {
          authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      },
    );
    expect(scheduleResponse.status).toBe(200);
    const schedule = (await scheduleResponse.json()) as {
      due: Array<{ id: string }>;
    };
    expect(schedule.due.map((value) => value.id)).toEqual([action.id]);

    const editResponse = await jsonRequest(
      app,
      `/schedule/${action.id}`,
      'PATCH',
      {
        mutation: {
          mutationId: 'MUT-scheduler-api-edit1',
          expectedRevision: action.revision,
        },
        patch: {
          title: 'Morning workshop reminder',
          runAt: '2026-09-25T09:00:00+02:00',
        },
      },
    );
    expect(editResponse.status).toBe(200);
    const edited = (await editResponse.json()) as {
      revision: number;
      nextRunAt: string;
    };

    const pauseResponse = await jsonRequest(
      app,
      `/schedule/${action.id}/pause`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-scheduler-api-pause',
          expectedRevision: edited.revision,
        },
      },
    );
    expect(pauseResponse.status).toBe(200);
    const paused = (await pauseResponse.json()) as {
      revision: number;
      status: string;
    };
    expect(paused.status).toBe('PAUSED');

    const resumeResponse = await jsonRequest(
      app,
      `/schedule/${action.id}/resume`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-scheduler-api-resume',
          expectedRevision: paused.revision,
        },
      },
    );
    expect(resumeResponse.status).toBe(200);
    const resumed = (await resumeResponse.json()) as {
      revision: number;
      status: string;
    };
    expect(resumed.status).toBe('ACTIVE');

    const cancelResponse = await jsonRequest(
      app,
      `/schedule/${action.id}/cancel`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-scheduler-api-cancel',
          expectedRevision: resumed.revision,
        },
      },
    );
    expect(cancelResponse.status).toBe(200);
    const cancelled = (await cancelResponse.json()) as {
      status: string;
      nextRunAt: null;
    };
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.nextRunAt).toBeNull();
  });

  it('keeps scheduler routes authenticated and automatic email owner-only', async () => {
    const app = makeApi();

    expect(
      (
        await app.request(
          '/schedule?asOf=2026-09-24T07%3A00%3A00.000Z',
        )
      ).status,
    ).toBe(401);

    const externalEmail = await jsonRequest(app, '/schedule', 'POST', {
      mutation: {
        mutationId: 'MUT-scheduler-api-mail1',
      },
      input: {
        jobId: null,
        taskId: null,
        title: 'Customer mail',
        actionType: 'EMAIL',
        payload: {
          kind: 'EMAIL',
          recipient: 'CUSTOMER',
          subject: 'Repair update',
          body: 'This may not be automatic in Phase 1.',
        },
        timezone: 'Africa/Johannesburg',
        recurrenceRule: null,
        runAt: '2026-09-25T09:00:00+02:00',
      },
    });
    expect(externalEmail.status).toBe(400);
  });
});
