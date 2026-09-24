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
import { revisionSchema } from '../contracts/shared';
import {
  createTaskInputSchema,
  markTaskWaitingInputSchema,
  updateTaskPatchSchema,
} from '../contracts/task';
import {
  DomainNotFoundError,
  DomainValidationError,
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
      error instanceof MutationReplayMismatchError
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
