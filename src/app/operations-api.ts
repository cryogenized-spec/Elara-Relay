import { z, type ZodType } from 'zod';
import { authIdentitySchema, type AuthIdentity } from '../auth/auth-verifier';
import {
  jobSchema,
  type CreateJobInput,
  type Job,
} from '../contracts/job';
import {
  partySchema,
  type CreatePartyInput,
  type Party,
} from '../contracts/party';
import {
  repairSchema,
  type CreateRepairInput,
  type Repair,
} from '../contracts/repair';
import {
  scheduledActionSchema,
  type CreateScheduledActionInput,
  type ScheduledAction,
} from '../contracts/scheduler';
import {
  taskSchema,
  type CreateTaskInput,
  type MarkTaskWaitingInput,
  type Task,
  type UpdateTaskPatch,
} from '../contracts/task';
import {
  dashboardResultSchema,
  jobViewSchema,
  repairViewSchema,
  repairsResultSchema,
  scheduleResultSchema,
  searchResultSchema,
  taskViewSchema,
  todayResultSchema,
  workResultSchema,
  type DashboardResultPayload,
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

export interface CreateMutationCommand<T> {
  mutationId: string;
  input: T;
}

export interface VersionedMutationCommand<T> {
  mutationId: string;
  expectedRevision: number;
  input: T;
}

export interface VersionedPatchCommand<T> {
  mutationId: string;
  expectedRevision: number;
  patch: T;
}

export interface VersionedMutationOnlyCommand {
  mutationId: string;
  expectedRevision: number;
}

export interface OperationsApi {
  whoAmI(): Promise<AuthIdentity>;
  createParty(command: CreateMutationCommand<CreatePartyInput>): Promise<Party>;
  createJob(command: CreateMutationCommand<CreateJobInput>): Promise<Job>;
  createTask(command: CreateMutationCommand<CreateTaskInput>): Promise<Task>;
  updateTask(
    taskId: string,
    command: VersionedPatchCommand<UpdateTaskPatch>,
  ): Promise<Task>;
  markTaskWaiting(
    taskId: string,
    command: VersionedMutationCommand<MarkTaskWaitingInput>,
  ): Promise<Task>;
  completeTask(
    taskId: string,
    command: VersionedMutationOnlyCommand,
  ): Promise<Task>;
  cancelTask(
    taskId: string,
    command: VersionedMutationOnlyCommand,
  ): Promise<Task>;
  createRepair(
    command: CreateMutationCommand<CreateRepairInput>,
  ): Promise<Repair>;
  createScheduledAction(
    command: CreateMutationCommand<CreateScheduledActionInput>,
  ): Promise<ScheduledAction>;
  dashboard(asOf: string): Promise<DashboardResultPayload>;
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
  let text: string;
  try {
    text = await response.text();
  } catch {
    return { parsed: false };
  }

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

  async function request<T>(
    path: string,
    schema: ZodType<T>,
    mutation?: {
      method: 'POST' | 'PATCH';
      body: unknown;
    },
  ): Promise<T> {
    const token = options.getAccessToken();
    if (token === null || token === '') {
      throw new OperationsApiError(
        401,
        'UNAUTHENTICATED',
        'Authentication required',
      );
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    };
    if (mutation !== undefined) {
      headers['content-type'] = 'application/json';
    }

    const response = await fetchImpl(
      `${baseUrl}${path}`,
      mutation === undefined
        ? { headers }
        : {
            method: mutation.method,
            headers,
            body: JSON.stringify(mutation.body),
          },
    );

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
    createParty: (command) =>
      request('/parties', partySchema, {
        method: 'POST',
        body: {
          mutation: { mutationId: command.mutationId },
          input: command.input,
        },
      }),
    createJob: (command) =>
      request('/jobs', jobSchema, {
        method: 'POST',
        body: {
          mutation: { mutationId: command.mutationId },
          input: command.input,
        },
      }),
    createTask: (command) =>
      request('/tasks', taskSchema, {
        method: 'POST',
        body: {
          mutation: { mutationId: command.mutationId },
          input: command.input,
        },
      }),
    updateTask: (taskId, command) =>
      request(`/tasks/${encodeURIComponent(taskId)}`, taskSchema, {
        method: 'PATCH',
        body: {
          mutation: {
            mutationId: command.mutationId,
            expectedRevision: command.expectedRevision,
          },
          patch: command.patch,
        },
      }),
    markTaskWaiting: (taskId, command) =>
      request(`/tasks/${encodeURIComponent(taskId)}/wait`, taskSchema, {
        method: 'POST',
        body: {
          mutation: {
            mutationId: command.mutationId,
            expectedRevision: command.expectedRevision,
          },
          input: command.input,
        },
      }),
    completeTask: (taskId, command) =>
      request(`/tasks/${encodeURIComponent(taskId)}/complete`, taskSchema, {
        method: 'POST',
        body: {
          mutation: {
            mutationId: command.mutationId,
            expectedRevision: command.expectedRevision,
          },
        },
      }),
    cancelTask: (taskId, command) =>
      request(`/tasks/${encodeURIComponent(taskId)}/cancel`, taskSchema, {
        method: 'POST',
        body: {
          mutation: {
            mutationId: command.mutationId,
            expectedRevision: command.expectedRevision,
          },
        },
      }),
    createRepair: (command) =>
      request('/repairs', repairSchema, {
        method: 'POST',
        body: {
          mutation: { mutationId: command.mutationId },
          input: command.input,
        },
      }),
    createScheduledAction: (command) =>
      request('/schedule', scheduledActionSchema, {
        method: 'POST',
        body: {
          mutation: { mutationId: command.mutationId },
          input: command.input,
        },
      }),
    dashboard: (asOf) =>
      request(
        `/dashboard?asOf=${encodeURIComponent(asOf)}`,
        dashboardResultSchema,
      ),
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
