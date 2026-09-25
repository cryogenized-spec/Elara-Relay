import { Hono, type Context } from 'hono';
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

type ApiEnv = {
  Variables: {
    authIdentity: AuthIdentity;
  };
};

type ApiContext = Context<ApiEnv>;

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

async function requestJson(context: ApiContext): Promise<unknown> {
  try {
    return await context.req.json<unknown>();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new DomainValidationError('Request body must be valid JSON');
    }
    throw error;
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

export function createApi(
  kernel?: DomainKernel,
  authVerifier?: AuthVerifier,
): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.get('/health', (context) =>
    context.json({
      service: 'elara-relay',
      status: 'ok',
      schemaVersion: 1,
    }),
  );

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
