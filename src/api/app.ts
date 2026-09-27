import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { z, ZodError } from 'zod';
import type {
  AuthIdentity,
  AuthVerifier,
} from '../auth/auth-verifier';
import { extractBearerToken } from '../auth/bearer';
import {
  AuthenticationError,
  AuthorizationError,
} from '../auth/errors';
import { createJobInputSchema } from '../contracts/job';
import { createRepairCaseInputSchema } from '../contracts/repair-case';
import { mutationIdSchema } from '../contracts/mutation';
import { createPartyInputSchema } from '../contracts/party';
import {
  createRepairInputSchema,
  moveRepairStageInputSchema,
  recordRepairTestInputSchema,
  repairDetailsPatchSchema,
} from '../contracts/repair';
import {
  createScheduledActionInputSchema,
  updateScheduledActionPatchSchema,
} from '../contracts/scheduler';
import { revisionSchema } from '../contracts/shared';
import {
  createTaskInputSchema,
  markTaskWaitingInputSchema,
  updateTaskPatchSchema,
} from '../contracts/task';
import {
  DomainNotFoundError,
  DomainValidationError,
  DuplicateEntityError,
  MutationReplayMismatchError,
} from '../domain/errors';
import type { DomainKernel } from '../domain/kernel';
import { RevisionConflictError } from '../domain/revision';
import type {
  ApiHealthOptions,
  AuthenticationConfigurationStatus,
  DatabaseHealthStatus,
  ReadinessBody,
  SchedulerHealthStatus,
} from '../observability/health';
import {
  logSafely,
  noopStructuredLogger,
  type ApiFailureCategory,
  type StructuredLogger,
} from '../observability/logger';

type ApiEnv = {
  Variables: {
    authIdentity: AuthIdentity;
    requestId: string;
  };
};

type ApiContext = Context<ApiEnv>;

export interface ApiOptions {
  allowedOrigins?: readonly string[] | undefined;
  health?: ApiHealthOptions | undefined;
  logger?: StructuredLogger | undefined;
}

const mutationRequestSchema = z
  .object({
    mutationId: mutationIdSchema,
  })
  .strict();

const versionedMutationRequestSchema = z
  .object({
    mutationId: mutationIdSchema,
    expectedRevision: revisionSchema,
  })
  .strict();

const createPartyRequestSchema = z
  .object({
    mutation: mutationRequestSchema,
    input: createPartyInputSchema,
  })
  .strict();

const createJobRequestSchema = z
  .object({
    mutation: mutationRequestSchema,
    input: createJobInputSchema,
  })
  .strict();

const createTaskRequestSchema = z
  .object({
    mutation: mutationRequestSchema,
    input: createTaskInputSchema,
  })
  .strict();

const createRepairCaseRequestSchema = z
  .object({
    mutation: mutationRequestSchema,
    input: createRepairCaseInputSchema,
  })
  .strict();

const createRepairRequestSchema = z
  .object({
    mutation: mutationRequestSchema,
    input: createRepairInputSchema,
  })
  .strict();

const updateRepairDetailsRequestSchema = z
  .object({
    mutation: versionedMutationRequestSchema,
    patch: repairDetailsPatchSchema,
  })
  .strict();

const moveRepairStageRequestSchema = z
  .object({
    mutation: versionedMutationRequestSchema,
    input: moveRepairStageInputSchema,
  })
  .strict();

const recordRepairTestRequestSchema = z
  .object({
    mutation: versionedMutationRequestSchema,
    input: recordRepairTestInputSchema,
  })
  .strict();

const createScheduledActionRequestSchema = z
  .object({
    mutation: mutationRequestSchema,
    input: createScheduledActionInputSchema,
  })
  .strict();

const updateScheduledActionRequestSchema = z
  .object({
    mutation: versionedMutationRequestSchema,
    patch: updateScheduledActionPatchSchema,
  })
  .strict();

const updateTaskRequestSchema = z
  .object({
    mutation: versionedMutationRequestSchema,
    patch: updateTaskPatchSchema,
  })
  .strict();

const waitTaskRequestSchema = z
  .object({
    mutation: versionedMutationRequestSchema,
    input: markTaskWaitingInputSchema,
  })
  .strict();

const versionedRequestSchema = z
  .object({
    mutation: versionedMutationRequestSchema,
  })
  .strict();

const addJobEventRequestSchema = z
  .object({
    mutation: versionedMutationRequestSchema,
    detail: z.string(),
  })
  .strict();

// The largest legitimate request field is 12KB; anything past 1MB is abuse,
// so the body is streamed with a running total instead of buffered blindly.
const MAX_REQUEST_BODY_BYTES = 1_000_000;

async function readBoundedBodyText(
  body: ReadableStream<Uint8Array> | null,
): Promise<string> {
  if (body === null) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new DomainValidationError('Request body is too large');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function requestJson(context: ApiContext): Promise<unknown> {
  let text: string;
  try {
    text = await readBoundedBodyText(context.req.raw.body);
  } catch (error) {
    if (error instanceof DomainValidationError) throw error;
    throw new DomainValidationError('Request body must be valid JSON');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DomainValidationError('Request body must be valid JSON');
  }
}

function operatorMutation(mutation: z.infer<typeof mutationRequestSchema>) {
  return {
    ...mutation,
    actor: 'operator-ui' as const,
  };
}

function operatorVersionedMutation(
  mutation: z.infer<typeof versionedMutationRequestSchema>,
) {
  return {
    ...mutation,
    actor: 'operator-ui' as const,
  };
}

function registerDomainRoutes(
  app: Hono<ApiEnv>,
  kernel: DomainKernel,
): void {
  app.get('/auth/whoami', (context) =>
    context.json(context.get('authIdentity')),
  );

  app.post('/parties', async (context) => {
    const request = createPartyRequestSchema.parse(await requestJson(context));
    return context.json(
      await kernel.createParty(
        operatorMutation(request.mutation),
        request.input,
      ),
      201,
    );
  });

  app.post('/jobs', async (context) => {
    const request = createJobRequestSchema.parse(await requestJson(context));
    return context.json(
      await kernel.createJob(
        operatorMutation(request.mutation),
        request.input,
      ),
      201,
    );
  });

  app.post('/tasks', async (context) => {
    const request = createTaskRequestSchema.parse(await requestJson(context));
    return context.json(
      await kernel.createTask(
        operatorMutation(request.mutation),
        request.input,
      ),
      201,
    );
  });

  app.get('/tasks/:taskId', async (context) =>
    context.json(await kernel.getTask(context.req.param('taskId'))),
  );

  app.post('/repair-cases', async (context) => {
    const request = createRepairCaseRequestSchema.parse(
      await requestJson(context),
    );
    return context.json(
      await kernel.createRepairCase(
        operatorMutation(request.mutation),
        request.input,
      ),
      201,
    );
  });

  app.post('/repairs', async (context) => {
    const request = createRepairRequestSchema.parse(await requestJson(context));
    return context.json(
      await kernel.createRepair(
        operatorMutation(request.mutation),
        request.input,
      ),
      201,
    );
  });

  app.patch('/repairs/:repairId', async (context) => {
    const request = updateRepairDetailsRequestSchema.parse(
      await requestJson(context),
    );
    return context.json(
      await kernel.updateRepairDetails(
        operatorVersionedMutation(request.mutation),
        context.req.param('repairId'),
        request.patch,
      ),
    );
  });

  app.post('/repairs/:repairId/stage', async (context) => {
    const request = moveRepairStageRequestSchema.parse(
      await requestJson(context),
    );
    return context.json(
      await kernel.moveRepairStage(
        operatorVersionedMutation(request.mutation),
        context.req.param('repairId'),
        request.input,
      ),
    );
  });

  app.post('/repairs/:repairId/test', async (context) => {
    const request = recordRepairTestRequestSchema.parse(
      await requestJson(context),
    );
    return context.json(
      await kernel.recordRepairTest(
        operatorVersionedMutation(request.mutation),
        context.req.param('repairId'),
        request.input,
      ),
    );
  });

  app.get('/repairs', async (context) =>
    context.json(await kernel.getRepairs()),
  );

  app.get('/repairs/:repairId', async (context) =>
    context.json(await kernel.getRepair(context.req.param('repairId'))),
  );

  app.post('/schedule', async (context) => {
    const request = createScheduledActionRequestSchema.parse(
      await requestJson(context),
    );
    return context.json(
      await kernel.createScheduledAction(
        operatorMutation(request.mutation),
        request.input,
      ),
      201,
    );
  });

  app.patch('/schedule/:actionId', async (context) => {
    const request = updateScheduledActionRequestSchema.parse(
      await requestJson(context),
    );
    return context.json(
      await kernel.updateScheduledAction(
        operatorVersionedMutation(request.mutation),
        context.req.param('actionId'),
        request.patch,
      ),
    );
  });

  app.post('/schedule/:actionId/pause', async (context) => {
    const request = versionedRequestSchema.parse(await requestJson(context));
    return context.json(
      await kernel.pauseScheduledAction(
        operatorVersionedMutation(request.mutation),
        context.req.param('actionId'),
      ),
    );
  });

  app.post('/schedule/:actionId/resume', async (context) => {
    const request = versionedRequestSchema.parse(await requestJson(context));
    return context.json(
      await kernel.resumeScheduledAction(
        operatorVersionedMutation(request.mutation),
        context.req.param('actionId'),
      ),
    );
  });

  app.post('/schedule/:actionId/cancel', async (context) => {
    const request = versionedRequestSchema.parse(await requestJson(context));
    return context.json(
      await kernel.cancelScheduledAction(
        operatorVersionedMutation(request.mutation),
        context.req.param('actionId'),
      ),
    );
  });

  app.get('/schedule', async (context) => {
    const asOf = z.string().parse(context.req.query('asOf'));
    return context.json(await kernel.getSchedule(asOf));
  });

  app.patch('/tasks/:taskId', async (context) => {
    const request = updateTaskRequestSchema.parse(await requestJson(context));
    return context.json(
      await kernel.updateTask(
        operatorVersionedMutation(request.mutation),
        context.req.param('taskId'),
        request.patch,
      ),
    );
  });

  app.post('/tasks/:taskId/wait', async (context) => {
    const request = waitTaskRequestSchema.parse(await requestJson(context));
    return context.json(
      await kernel.markTaskWaiting(
        operatorVersionedMutation(request.mutation),
        context.req.param('taskId'),
        request.input,
      ),
    );
  });

  app.post('/tasks/:taskId/complete', async (context) => {
    const request = versionedRequestSchema.parse(await requestJson(context));
    return context.json(
      await kernel.completeTask(
        operatorVersionedMutation(request.mutation),
        context.req.param('taskId'),
      ),
    );
  });

  app.post('/tasks/:taskId/cancel', async (context) => {
    const request = versionedRequestSchema.parse(await requestJson(context));
    return context.json(
      await kernel.cancelTask(
        operatorVersionedMutation(request.mutation),
        context.req.param('taskId'),
      ),
    );
  });

  app.post('/jobs/:jobId/events', async (context) => {
    const request = addJobEventRequestSchema.parse(await requestJson(context));
    return context.json(
      await kernel.addJobEvent(
        operatorVersionedMutation(request.mutation),
        context.req.param('jobId'),
        request.detail,
      ),
      201,
    );
  });

  app.get('/jobs/:jobId', async (context) =>
    context.json(await kernel.getJob(context.req.param('jobId'))),
  );

  app.get('/work', async (context) =>
    context.json(await kernel.getWork()),
  );

  app.get('/dashboard', async (context) => {
    const asOf = z.string().parse(context.req.query('asOf'));
    return context.json(await kernel.getDashboard(asOf));
  });

  app.get('/today', async (context) => {
    const asOf = z.string().parse(context.req.query('asOf'));
    return context.json(await kernel.getToday(asOf));
  });

  app.get('/search', async (context) => {
    const query = z.string().parse(context.req.query('q'));
    return context.json(await kernel.search(query));
  });
}

function registerProtectedDomainApi(
  app: Hono<ApiEnv>,
  kernel: DomainKernel,
  verifier: AuthVerifier,
): void {
  const protectedApp = new Hono<ApiEnv>();

  protectedApp.use('*', async (context, next) => {
    const token = extractBearerToken(
      context.req.header('authorization'),
    );
    context.set('authIdentity', await verifier.verify(token));
    await next();
  });

  registerDomainRoutes(protectedApp, kernel);
  app.route('/', protectedApp);
}

const versionPattern =
  /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const buildShaPattern = /^[0-9a-f]{7,40}$/i;
const optionalProviderNames = [
  'memory',
  'ai',
  'chat',
  'delivery',
  'email',
  'storage',
  'workspace',
  'calendar',
  'notifications',
] as const;

function publicVersion(value: string | undefined): string {
  return value !== undefined && value.length <= 64 && versionPattern.test(value)
    ? value
    : 'unknown';
}

function publicBuildSha(value: string | undefined): string {
  return value !== undefined && buildShaPattern.test(value)
    ? value.toLowerCase()
    : 'unknown';
}

function isAuthenticationConfigurationStatus(
  value: unknown,
): value is 'valid' | 'invalid' | 'not_configured' {
  return (
    value === 'valid' ||
    value === 'invalid' ||
    value === 'not_configured'
  );
}

function isOptionalProviderHealthStatus(
  value: unknown,
): value is 'configured' | 'unavailable' | 'disabled' {
  return (
    value === 'configured' ||
    value === 'unavailable' ||
    value === 'disabled'
  );
}

function safeOptionalProviderStatuses(
  health: ApiHealthOptions,
): Readonly<Record<string, 'configured' | 'unavailable' | 'disabled'>> {
  const result: Record<string, 'configured' | 'unavailable' | 'disabled'> = {
    memory: 'disabled',
  };
  if (health.optionalProviders === undefined) return result;

  try {
    const candidates: unknown = health.optionalProviders();
    if (typeof candidates !== 'object' || candidates === null) return result;
    const values = candidates as Record<string, unknown>;
    for (const name of optionalProviderNames) {
      const status = values[name];
      if (isOptionalProviderHealthStatus(status)) result[name] = status;
    }
  } catch {
    return { memory: 'unavailable' };
  }
  return result;
}

function setHealthResponseHeaders(context: ApiContext): void {
  context.header('Cache-Control', 'no-store');
  context.header('X-Content-Type-Options', 'nosniff');
}

function logApiFailure(
  logger: StructuredLogger,
  context: ApiContext,
  category: ApiFailureCategory,
  status: number,
): void {
  logSafely(logger, {
    event: 'api.failure',
    requestId: context.get('requestId'),
    category,
    status,
  });
}

export function createApi(
  kernel?: DomainKernel,
  authVerifier?: AuthVerifier,
  options: ApiOptions = {},
): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const allowedOrigins = [...(options.allowedOrigins ?? [])];
  const logger = options.logger ?? noopStructuredLogger;
  const health = options.health ?? {};
  const version = publicVersion(health.version);
  const buildSha = publicBuildSha(health.buildSha);

  app.use('*', async (context, next) => {
    const requestId = crypto.randomUUID();
    context.set('requestId', requestId);
    context.header('X-Request-ID', requestId);
    await next();
  });

  if (allowedOrigins.length > 0) {
    app.use(
      '*',
      cors({
        origin: allowedOrigins,
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: ['GET', 'HEAD', 'POST', 'PATCH', 'OPTIONS'],
        exposeHeaders: ['X-Request-ID'],
        maxAge: 600,
      }),
    );
  }

  const liveness = (context: ApiContext) => {
    setHealthResponseHeaders(context);
    return context.json({
      service: 'elara-relay',
      status: 'ok',
      version,
      buildSha,
      schemaVersion: 1,
    });
  };

  app.get('/health', liveness);
  app.get('/health/live', liveness);
  app.get('/health/ready', async (context) => {
    setHealthResponseHeaders(context);

    let databaseStatus: DatabaseHealthStatus = 'not_configured';
    if (health.databaseProbe !== undefined) {
      try {
        await health.databaseProbe();
        databaseStatus = 'available';
      } catch {
        databaseStatus = 'unavailable';
        logSafely(logger, {
          event: 'health.dependency_unavailable',
          requestId: context.get('requestId'),
          dependency: 'database',
          category: 'readiness_probe_failed',
        });
      }
    }

    const configuredAuthStatus = health.authenticationConfiguration;
    const authenticationStatus: AuthenticationConfigurationStatus =
      isAuthenticationConfigurationStatus(configuredAuthStatus)
        ? configuredAuthStatus
        : authVerifier === undefined
          ? 'not_configured'
          : 'valid';

    let schedulerStatus: SchedulerHealthStatus = 'not_configured';
    if (health.schedulerProbe !== undefined) {
      try {
        const candidate: unknown = await health.schedulerProbe();
        schedulerStatus =
          candidate === 'operational' ||
          candidate === 'unavailable' ||
          candidate === 'disabled' ||
          candidate === 'not_configured'
            ? candidate
            : 'unavailable';
      } catch {
        schedulerStatus = 'unavailable';
      }
      if (schedulerStatus === 'unavailable') {
        logSafely(logger, {
          event: 'health.dependency_unavailable',
          requestId: context.get('requestId'),
          dependency: 'scheduler',
          category: 'readiness_probe_failed',
        });
      }
    }

    const ready =
      kernel !== undefined &&
      authVerifier !== undefined &&
      databaseStatus === 'available' &&
      authenticationStatus === 'valid';
    const body: ReadinessBody = {
      service: 'elara-relay',
      status: ready ? 'ready' : 'not_ready',
      version,
      buildSha,
      schemaVersion: 1,
      checks: {
        database: databaseStatus,
        authentication: authenticationStatus,
        scheduler: schedulerStatus,
        optionalProviders: safeOptionalProviderStatuses(health),
      },
    };

    return context.json(body, ready ? 200 : 503);
  });

  if (kernel !== undefined) {
    if (authVerifier === undefined) {
      throw new Error(
        'AuthVerifier is required whenever domain routes are enabled',
      );
    }
    registerProtectedDomainApi(app, kernel, authVerifier);
  }

  app.onError((error, context) => {
    if (error instanceof AuthenticationError) {
      logApiFailure(logger, context, 'authentication', 401);
      context.header('WWW-Authenticate', 'Bearer');
      return context.json(
        {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required',
          },
        },
        401,
      );
    }

    if (error instanceof AuthorizationError) {
      logApiFailure(logger, context, 'authorization', 403);
      return context.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied',
          },
        },
        403,
      );
    }

    if (error instanceof ZodError || error instanceof DomainValidationError) {
      logApiFailure(logger, context, 'validation', 400);
      return context.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: error.message,
          },
        },
        400,
      );
    }

    if (error instanceof DomainNotFoundError) {
      logApiFailure(logger, context, 'not_found', 404);
      return context.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        },
        404,
      );
    }

    if (
      error instanceof RevisionConflictError ||
      error instanceof MutationReplayMismatchError ||
      error instanceof DuplicateEntityError
    ) {
      logApiFailure(logger, context, 'conflict', 409);
      return context.json(
        {
          error: {
            code: 'CONFLICT',
            message: error.message,
          },
        },
        409,
      );
    }

    logApiFailure(logger, context, 'unexpected', 500);
    return context.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected server error',
        },
      },
      500,
    );
  });

  return app;
}

export const api = createApi();
