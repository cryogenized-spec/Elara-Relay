import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { AuthVerifier } from '../auth/auth-verifier';
import { extractBearerToken } from '../auth/bearer';
import type { ChatTurnOrchestrator } from '../ai/chat-turn';
import {
  chatThreadDetailSchema,
  chatThreadListSchema,
  createChatThreadRequestSchema,
  startChatTurnRequestSchema,
} from '../contracts/chat';
import type { ChatKernel } from '../domain/chat-kernel';
import type { ApiEnv } from './app';
import { requestJson } from './request-body';

const MAX_THREAD_LIST_LIMIT = 100;
const DEFAULT_THREAD_LIST_LIMIT = 50;

const threadListQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(MAX_THREAD_LIST_LIMIT),
  })
  .strict();

const threadIdSchema = z.string().uuid();

function threadIdParam(context: Context<ApiEnv>): string {
  return threadIdSchema.parse(context.req.param('threadId'));
}

/**
 * The authenticated Chat boundary.
 *
 * Every route runs behind the same verified-identity middleware as the
 * operational API, and every query is scoped by that identity. A browser can
 * only name a Thread, a turn, and a catalog model; it can never name an owner,
 * a provider, or a database object.
 *
 * Chat raises typed domain errors; the API boundary remains the single
 * authority that maps them to status codes and the safe error envelope.
 */
export function createChatApi(
  kernel: ChatKernel,
  orchestrator: ChatTurnOrchestrator,
  verifier: AuthVerifier,
): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  // Chat installs the same verified-identity boundary it requires rather than
  // trusting where it happens to be mounted. Mounted on the operational API it
  // runs as a second, identical check; mounted on its own it is still the
  // only thing standing between a request and a durable conversation.
  app.use('*', async (context, next) => {
    const token = extractBearerToken(context.req.header('authorization'));
    context.set('authIdentity', await verifier.verify(token));
    await next();
  });

  app.get('/chat/models', (context) =>
    context.json({ models: orchestrator.availableModels() }),
  );

  app.post('/chat/threads', async (context) => {
    const request = createChatThreadRequestSchema.parse(
      await requestJson(context),
    );
    const created = await kernel.createThread({
      ownerId: context.get('authIdentity').userId,
      threadId: request.threadId,
      title: request.title,
    });
    return context.json(created.thread, created.replay ? 200 : 201);
  });

  app.get('/chat/threads', async (context) => {
    const query = threadListQuerySchema.parse({
      limit: context.req.query('limit') ?? DEFAULT_THREAD_LIST_LIMIT,
    });
    const threads = await kernel.listThreads(
      context.get('authIdentity').userId,
      query.limit,
    );
    return context.json(chatThreadListSchema.parse({ threads }));
  });

  app.get('/chat/threads/:threadId', async (context) => {
    const detail = await kernel.getThread(
      context.get('authIdentity').userId,
      threadIdParam(context),
    );
    return context.json(chatThreadDetailSchema.parse(detail));
  });

  /**
   * One authenticated turn. The durable claim and its conflicts resolve before
   * the stream opens, so a rejected turn is an ordinary JSON error response
   * rather than a stream that failed halfway through.
   */
  app.post('/chat/threads/:threadId/turns', async (context) => {
    const threadId = threadIdParam(context);
    const request = startChatTurnRequestSchema.parse(
      await requestJson(context),
    );
    const turn = await orchestrator.begin({
      ownerId: context.get('authIdentity').userId,
      threadId,
      turnId: request.turnId,
      modelId: request.modelId,
      message: request.message,
      expectedRevision: request.expectedRevision,
    });

    return streamSSE(context, async (stream) => {
      const controller = new AbortController();
      stream.onAbort(() => {
        controller.abort();
      });
      try {
        for await (const event of orchestrator.generate(
          turn,
          controller.signal,
        )) {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          });
        }
      } catch {
        // The response is already established. Ending the stream without a
        // terminal event tells the client to re-read authoritative Thread
        // state; internal failure detail never crosses the boundary.
        if (!stream.closed && !stream.aborted) {
          process.stderr.write(
            'elara-relay: chat turn stream ended without a terminal event\n',
          );
        }
      }
    });
  });

  return app;
}
