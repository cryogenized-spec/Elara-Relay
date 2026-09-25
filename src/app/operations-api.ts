import { z, type ZodType } from 'zod';
import { authIdentitySchema, type AuthIdentity } from '../auth/auth-verifier';
import {
  jobViewSchema,
  repairViewSchema,
  repairsResultSchema,
  scheduleResultSchema,
  searchResultSchema,
  todayResultSchema,
  workResultSchema,
  type JobViewPayload,
  type RepairViewPayload,
  type RepairsResultPayload,
  type ScheduleResultPayload,
  type SearchResultPayload,
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
  job(jobId: string): Promise<JobViewPayload>;
  repair(repairId: string): Promise<RepairViewPayload>;
}

export interface OperationsApiClientOptions {
  baseUrl: string;
  getAccessToken: () => string | null;
  fetchImpl?: typeof fetch;
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

    const raw: unknown = await response.json();

    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(raw);
      if (parsed.success) {
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

    return schema.parse(raw);
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
    job: (jobId) =>
      request(`/jobs/${encodeURIComponent(jobId)}`, jobViewSchema),
    repair: (repairId) =>
      request(
        `/repairs/${encodeURIComponent(repairId)}`,
        repairViewSchema,
      ),
  };
}
