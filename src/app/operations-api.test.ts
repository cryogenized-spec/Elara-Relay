import { describe, expect, it, vi } from 'vitest';
import { createOperationsApi, OperationsApiError } from './operations-api';

const TASK_ID = '10000000-0000-4000-8000-000000000001';

describe('Operations API browser client', () => {
  it('sends the current bearer token and validates read payloads', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          asOf: '2026-09-25T02:30:00.000Z',
          tasks: [
            {
              id: TASK_ID,
              jobId: null,
              title: 'Check stock',
              status: 'NEXT',
              priority: 'NORMAL',
              dueAt: '2026-09-25T02:00:00.000Z',
              followUpAt: null,
              waitingOn: null,
              waitingSince: null,
              createdAt: '2026-09-24T09:00:00.000Z',
              updatedAt: '2026-09-24T09:00:00.000Z',
              revision: 1,
            },
          ],
          repairs: [],
          scheduledActions: [],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const api = createOperationsApi({
      baseUrl: 'https://api.example.com/',
      getAccessToken: () => 'session-token',
      fetchImpl,
    });

    const result = await api.today('2026-09-25T02:30:00.000Z');
    expect(result.tasks[0]?.title).toBe('Check stock');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/today?asOf=2026-09-25T02%3A30%3A00.000Z',
      {
        headers: {
          authorization: 'Bearer session-token',
          accept: 'application/json',
        },
      },
    );
  });

  it('validates the coherent Dashboard payload through one endpoint', async () => {
    const asOf = '2026-09-25T02:30:00.000Z';
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          today: { asOf, tasks: [], repairs: [], scheduledActions: [] },
          work: { parties: [], jobs: [], tasks: [] },
          repairs: { parties: [], jobs: [], repairs: [] },
          schedule: { asOf, due: [], upcoming: [], paused: [] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const api = createOperationsApi({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => 'session-token',
      fetchImpl,
    });

    await expect(api.dashboard(asOf)).resolves.toMatchObject({
      today: { asOf },
      schedule: { asOf },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.example.com/dashboard?asOf=2026-09-25T02%3A30%3A00.000Z',
    );
  });

  it('fails closed before a request when no session token exists', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const api = createOperationsApi({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => null,
      fetchImpl,
    });

    await expect(api.work()).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('preserves structured API authorization failures', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied',
          },
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const api = createOperationsApi({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => 'session-token',
      fetchImpl,
    });

    await expect(api.work()).rejects.toEqual(
      new OperationsApiError(403, 'FORBIDDEN', 'Access denied'),
    );
  });

  it('classifies an empty 401 before attempting to parse an error body', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 401 }),
    );

    const api = createOperationsApi({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => 'stale-session-token',
      fetchImpl,
    });

    await expect(api.work()).rejects.toEqual(
      new OperationsApiError(
        401,
        'UNAUTHENTICATED',
        'Operations API returned HTTP 401',
      ),
    );
  });

  it('classifies a non-JSON 403 before attempting to parse an error body', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html>forbidden</html>', {
        status: 403,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const api = createOperationsApi({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => 'session-token',
      fetchImpl,
    });

    await expect(api.work()).rejects.toEqual(
      new OperationsApiError(
        403,
        'FORBIDDEN',
        'Operations API returned HTTP 403',
      ),
    );
  });

  it('classifies a body-stream failure on 401 before callers can retain stale state', async () => {
    const brokenResponse = {
      status: 401,
      ok: false,
      text: vi.fn().mockRejectedValue(new Error('stream aborted')),
    } as unknown as Response;
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(brokenResponse);

    const api = createOperationsApi({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => 'expired-token',
      fetchImpl,
    });

    await expect(api.work()).rejects.toEqual(
      new OperationsApiError(
        401,
        'UNAUTHENTICATED',
        'Operations API returned HTTP 401',
      ),
    );
  });

  it('classifies a body-stream failure on 403 before callers can retain stale state', async () => {
    const brokenResponse = {
      status: 403,
      ok: false,
      text: vi.fn().mockRejectedValue(new Error('stream aborted')),
    } as unknown as Response;
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(brokenResponse);

    const api = createOperationsApi({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => 'session-token',
      fetchImpl,
    });

    await expect(api.work()).rejects.toEqual(
      new OperationsApiError(
        403,
        'FORBIDDEN',
        'Operations API returned HTTP 403',
      ),
    );
  });

  it('rejects malformed success payloads instead of trusting the server shape', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ jobs: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const api = createOperationsApi({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => 'session-token',
      fetchImpl,
    });

    await expect(api.work()).rejects.toThrow();
  });
});


describe('Operations API mutation client', () => {
  it('sends stable mutation intent in the server contract shape', async () => {
    const createdTask = {
      id: TASK_ID,
      jobId: null,
      title: 'Check stock',
      status: 'INBOX',
      priority: 'HIGH',
      dueAt: null,
      followUpAt: null,
      waitingOn: null,
      waitingSince: null,
      createdAt: '2026-09-26T05:00:00.000Z',
      updatedAt: '2026-09-26T05:00:00.000Z',
      revision: 1,
    };
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      () =>
        Promise.resolve(
          new Response(JSON.stringify(createdTask), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    );
    const api = createOperationsApi({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => 'session-token',
      fetchImpl,
    });

    const command = {
      mutationId: 'MUT-10000000-0000-4000-8000-000000000010',
      input: {
        jobId: null,
        title: 'Check stock',
        priority: 'HIGH' as const,
        dueAt: null,
        followUpAt: null,
      },
    };

    await expect(api.createTask(command)).resolves.toMatchObject({
      title: 'Check stock',
      revision: 1,
    });
    await expect(api.createTask(command)).resolves.toMatchObject({
      title: 'Check stock',
      revision: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls) {
      expect(call[0]).toBe('https://api.example.com/tasks');
      expect(call[1]).toEqual({
        method: 'POST',
        headers: {
          authorization: 'Bearer session-token',
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mutation: { mutationId: command.mutationId },
          input: command.input,
        }),
      });
    }
  });

  it('sends optimistic revision context for Task updates', async () => {
    const updatedTask = {
      id: TASK_ID,
      jobId: null,
      title: 'Check stock',
      status: 'DOING',
      priority: 'NORMAL',
      dueAt: null,
      followUpAt: null,
      waitingOn: null,
      waitingSince: null,
      createdAt: '2026-09-26T05:00:00.000Z',
      updatedAt: '2026-09-26T05:01:00.000Z',
      revision: 4,
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(updatedTask), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const api = createOperationsApi({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => 'session-token',
      fetchImpl,
    });

    await api.updateTask(TASK_ID, {
      mutationId: 'MUT-10000000-0000-4000-8000-000000000011',
      expectedRevision: 3,
      patch: { status: 'DOING' },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example.com/tasks/${TASK_ID}`,
      {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer session-token',
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mutation: {
            mutationId: 'MUT-10000000-0000-4000-8000-000000000011',
            expectedRevision: 3,
          },
          patch: { status: 'DOING' },
        }),
      },
    );
  });

  it('preserves structured revision conflicts for recovery UI', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'CONFLICT',
            message: 'Revision conflict: current=4, expected=3',
          },
        }),
        {
          status: 409,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const api = createOperationsApi({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => 'session-token',
      fetchImpl,
    });

    await expect(
      api.completeTask(TASK_ID, {
        mutationId: 'MUT-10000000-0000-4000-8000-000000000012',
        expectedRevision: 3,
      }),
    ).rejects.toEqual(
      new OperationsApiError(
        409,
        'CONFLICT',
        'Revision conflict: current=4, expected=3',
      ),
    );
  });
});
