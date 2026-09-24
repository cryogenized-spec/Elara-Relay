import { Hono } from 'hono';
import { z, ZodError } from 'zod';
import { createJobInputSchema } from '../contracts/job';
import {
  mutationContextSchema,
  versionedMutationContextSchema,
} from '../contracts/mutation';
import { createPartyInputSchema } from '../contracts/party';
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

const createPartyRequestSchema = z
  .object({
    mutation: mutationContextSchema,
    input: createPartyInputSchema,
  })
  .strict();

const createJobRequestSchema = z
  .object({
    mutation: mutationContextSchema,
    input: createJobInputSchema,
  })
  .strict();

const createTaskRequestSchema = z
  .object({
    mutation: mutationContextSchema,
    input: createTaskInputSchema,
  })
  .strict();

const updateTaskRequestSchema = z
  .object({
    mutation: versionedMutationContextSchema,
    patch: updateTaskPatchSchema,
  })
  .strict();

const waitTaskRequestSchema = z
  .object({
    mutation: versionedMutationContextSchema,
    input: markTaskWaitingInputSchema,
  })
  .strict();

const versionedRequestSchema = z
  .object({
    mutation: versionedMutationContextSchema,
  })
  .strict();

const addJobEventRequestSchema = z
  .object({
    mutation: versionedMutationContextSchema,
    detail: z.string(),
  })
  .strict();

function registerDomainRoutes(app: Hono, kernel: DomainKernel): void {
  app.post('/parties', async (context) => {
    const request = createPartyRequestSchema.parse(await context.req.json<unknown>());
    return context.json(
      await kernel.createParty(request.mutation, request.input),
      201,
    );
  });

  app.post('/jobs', async (context) => {
    const request = createJobRequestSchema.parse(await context.req.json<unknown>());
    return context.json(await kernel.createJob(request.mutation, request.input), 201);
  });

  app.post('/tasks', async (context) => {
    const request = createTaskRequestSchema.parse(await context.req.json<unknown>());
    return context.json(
      await kernel.createTask(request.mutation, request.input),
      201,
    );
  });

  app.patch('/tasks/:taskId', async (context) => {
    const request = updateTaskRequestSchema.parse(await context.req.json<unknown>());
    return context.json(
      await kernel.updateTask(
        request.mutation,
        context.req.param('taskId'),
        request.patch,
      ),
    );
  });

  app.post('/tasks/:taskId/wait', async (context) => {
    const request = waitTaskRequestSchema.parse(await context.req.json<unknown>());
    return context.json(
      await kernel.markTaskWaiting(
        request.mutation,
        context.req.param('taskId'),
        request.input,
      ),
    );
  });

  app.post('/tasks/:taskId/complete', async (context) => {
    const request = versionedRequestSchema.parse(await context.req.json<unknown>());
    return context.json(
      await kernel.completeTask(request.mutation, context.req.param('taskId')),
    );
  });

  app.post('/jobs/:jobId/events', async (context) => {
    const request = addJobEventRequestSchema.parse(await context.req.json<unknown>());
    return context.json(
      await kernel.addJobEvent(
        request.mutation,
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

export function createApi(kernel?: DomainKernel): Hono {
  const app = new Hono();

  app.get('/health', (context) =>
    context.json({
      service: 'elara-relay',
      status: 'ok',
      schemaVersion: 1,
    }),
  );

  if (kernel !== undefined) {
    registerDomainRoutes(app, kernel);
  }

  app.onError((error, context) => {
    if (
      error instanceof SyntaxError ||
      error instanceof ZodError ||
      error instanceof DomainValidationError
    ) {
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
