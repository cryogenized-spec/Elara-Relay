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
