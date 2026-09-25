import { z, type ZodType } from 'zod';
import { authIdentitySchema, type AuthIdentity } from '../auth/auth-verifier';
import {
  jobViewSchema,
  repairViewSchema,
  repairsResultSchema,
  scheduleResultSchema,
  searchResultSchema,
  taskViewSchema,
  todayResultSchema,
  workResultSchema,
  type JobViewPayload,
  type RepairViewPayload,
  type RepairsResultPayload,
  type ScheduleResultPayload,
  type SearchResultPayload,
  type TaskViewPayload,
  type TodayResultPayload,
  type WorkResultPayload,
} from '../contracts/read-model';

const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export class OperationsApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OperationsApiError';
  }
}

export interface OperationsApi {
  whoAmI(): Promise<AuthIdentity>;
  today(asOf: string): Promise<TodayResultPayload>;
  work(): Promise<WorkResultPayload>;
  repairs(): Promise<RepairsResultPayload>;
  schedule(asOf: string): Promise<ScheduleResultPayload>;
  search(query: string): Promise<SearchResultPayload>;
  task(taskId: string): Promise<TaskViewPayload>;
  job(jobId: string): Promise<JobViewPayload>;
  repair(repairId: string): Promise<RepairViewPayload>;
}

export interface OperationsApiClientOptions {
  baseUrl: string;
  getAccessToken: () => string | null;
  fetchImpl?: typeof fetch;
}

type ParsedResponseBody =
  | { parsed: true; value: unknown }
  | { parsed: false };

async function readResponseBody(response: Response): Promise<ParsedResponseBody> {
  const text = await response.text();
  if (text.trim() === '') return { parsed: false };

  try {
    return { parsed: true, value: JSON.parse(text) as unknown };
  } catch {
    return { parsed: false };
  }
}

export function createOperationsApi(
  options: OperationsApiClientOptions,
): OperationsApi {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, '');

  async function request<T>(path: string, schema: ZodType<T>): Promise<T> {
    const token = options.getAccessToken();
    if (token === null || token === '') {
      throw new OperationsApiError(
        401,
        'UNAUTHENTICATED',
        'Authentication required',
      );
    }

    const response = await fetchImpl(`${baseUrl}${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
    });

    if (response.status === 401 || response.status === 403) {
      const body = await readResponseBody(response);
      const parsed =
        body.parsed ? apiErrorSchema.safeParse(body.value) : null;
      if (parsed?.success === true) {
        throw new OperationsApiError(
          response.status,
          parsed.data.error.code,
          parsed.data.error.message,
        );
      }

      throw new OperationsApiError(
        response.status,
        response.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
        `Operations API returned HTTP ${response.status}`,
      );
    }

    const body = await readResponseBody(response);

    if (!response.ok) {
      const parsed =
        body.parsed ? apiErrorSchema.safeParse(body.value) : null;
      if (parsed?.success === true) {
        throw new OperationsApiError(
          response.status,
          parsed.data.error.code,
          parsed.data.error.message,
        );
      }
      throw new OperationsApiError(
        response.status,
        'INVALID_ERROR_RESPONSE',
        `Operations API returned HTTP ${response.status}`,
      );
    }

    if (!body.parsed) {
      throw new OperationsApiError(
        response.status,
        'INVALID_JSON_RESPONSE',
        'Operations API returned a non-JSON success response',
      );
    }

    return schema.parse(body.value);
  }

  return {
    whoAmI: () => request('/auth/whoami', authIdentitySchema),
    today: (asOf) =>
      request(
        `/today?asOf=${encodeURIComponent(asOf)}`,
        todayResultSchema,
      ),
    work: () => request('/work', workResultSchema),
    repairs: () => request('/repairs', repairsResultSchema),
    schedule: (asOf) =>
      request(
        `/schedule?asOf=${encodeURIComponent(asOf)}`,
        scheduleResultSchema,
      ),
    search: (query) =>
      request(`/search?q=${encodeURIComponent(query)}`, searchResultSchema),
    task: (taskId) =>
      request(`/tasks/${encodeURIComponent(taskId)}`, taskViewSchema),
    job: (jobId) =>
      request(`/jobs/${encodeURIComponent(jobId)}`, jobViewSchema),
    repair: (repairId) =>
      request(
        `/repairs/${encodeURIComponent(repairId)}`,
        repairViewSchema,
      ),
  };
}
