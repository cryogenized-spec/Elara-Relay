import { z } from 'zod';
import { revisionSchema, timestampSchema } from './shared';

/**
 * Chat record contracts.
 *
 * The database owns the durable truth for Threads and Messages; these schemas
 * are the single typed boundary used by the durable adapters, the server
 * orchestration layer, and the browser client. They intentionally restate the
 * `0006_ai_chat` lifecycle constraints so a corrupt stored row is rejected
 * before it can reach a caller.
 */

export const chatMessageRoleSchema = z.enum(['USER', 'ASSISTANT']);

export const chatMessageStatusSchema = z.enum([
  'PENDING',
  'COMPLETED',
  'FAILED',
]);

export const chatProviderIdSchema = z.enum(['openai', 'muse']);

/**
 * Safe, durable failure vocabulary. These codes are stored, returned to the
 * browser, and are the only provider failure information that ever crosses the
 * API boundary: provider messages, status text, prompts and credentials stay
 * server-side.
 */
export const chatFailureCodeSchema = z.enum([
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_FAILED',
  'PROVIDER_TIMEOUT',
  'PROVIDER_OUTPUT_TOO_LARGE',
  'EMPTY_RESPONSE',
  'GENERATION_CANCELLED',
]);

export type ChatFailureCode = z.infer<typeof chatFailureCodeSchema>;

export const chatTitleSchema = z.string().min(1).max(200);

export const chatUserContentSchema = z.string().min(1).max(12_000);

export const chatAssistantContentSchema = z.string().min(1).max(40_000);

export const chatThreadSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    title: chatTitleSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    revision: revisionSchema,
  })
  .strict()
  .superRefine((thread, context) => {
    if (thread.updatedAt < thread.createdAt) {
      context.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'Thread updatedAt must not precede createdAt',
      });
    }
  });

export const chatMessageSchema = z
  .object({
    id: z.string().uuid(),
    threadId: z.string().uuid(),
    ownerId: z.string().uuid(),
    turnId: z.string().uuid(),
    role: chatMessageRoleSchema,
    status: chatMessageStatusSchema,
    content: z.string(),
    providerId: chatProviderIdSchema.nullable(),
    modelId: z.string().min(1).max(64).nullable(),
    generationId: z.string().uuid().nullable(),
    createdAt: timestampSchema,
    completedAt: timestampSchema.nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    failureCode: chatFailureCodeSchema.nullable(),
  })
  .strict()
  .superRefine((message, context) => {
    const issue = (path: string, detail: string): void => {
      context.addIssue({ code: 'custom', path: [path], message: detail });
    };

    if (message.role === 'USER') {
      if (message.status !== 'COMPLETED') {
        issue('status', 'User messages are complete on insertion');
      }
      if (
        !chatUserContentSchema.safeParse(message.content).success ||
        message.completedAt === null
      ) {
        issue('content', 'User messages require content and a completion time');
      }
      if (
        message.providerId !== null ||
        message.modelId !== null ||
        message.generationId !== null ||
        message.inputTokens !== null ||
        message.outputTokens !== null ||
        message.failureCode !== null
      ) {
        issue('providerId', 'User messages carry no model provenance');
      }
      return;
    }

    // Assistant provenance is assigned before generation starts and is
    // immutable afterwards. The provider/model pairing itself is owned by the
    // Elara model catalog and the `0006_ai_chat` constraint.
    if (
      message.providerId === null ||
      message.modelId === null ||
      message.generationId === null
    ) {
      issue('generationId', 'Assistant messages require generation provenance');
      return;
    }

    if (message.status === 'PENDING') {
      if (
        message.content !== '' ||
        message.completedAt !== null ||
        message.inputTokens !== null ||
        message.outputTokens !== null ||
        message.failureCode !== null
      ) {
        issue('status', 'Pending assistant messages carry no result');
      }
      return;
    }

    if (message.completedAt === null) {
      issue(
        'completedAt',
        'Terminal assistant messages need a completion time',
      );
    }

    if (message.status === 'COMPLETED') {
      if (!chatAssistantContentSchema.safeParse(message.content).success) {
        issue('content', 'Completed assistant messages require content');
      }
      if (message.failureCode !== null) {
        issue('failureCode', 'Completed assistant messages carry no failure');
      }
    } else if (
      message.content !== '' ||
      message.failureCode === null ||
      message.inputTokens !== null ||
      message.outputTokens !== null
    ) {
      issue('status', 'Failed assistant messages retain no partial answer');
    }
  });

export type ChatThread = z.infer<typeof chatThreadSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatMessageRole = z.infer<typeof chatMessageRoleSchema>;
export type ChatMessageStatus = z.infer<typeof chatMessageStatusSchema>;

export const chatModelSchema = z
  .object({
    modelId: z.string().min(1).max(64),
    providerId: chatProviderIdSchema,
    available: z.boolean(),
  })
  .strict();

export const chatModelListSchema = z
  .object({
    models: z.array(chatModelSchema),
  })
  .strict();

export const chatThreadListSchema = z
  .object({
    threads: z.array(chatThreadSchema),
  })
  .strict();

export const chatThreadDetailSchema = z
  .object({
    thread: chatThreadSchema,
    messages: z.array(chatMessageSchema),
  })
  .strict();

/**
 * A browser-supplied `ownerId` is not a request field. Owner is always derived
 * from the verified `AuthIdentity`, so any attempt to send one is rejected as
 * an unknown property by these strict request schemas.
 */
export const createChatThreadRequestSchema = z
  .object({
    threadId: z.string().uuid(),
    title: chatTitleSchema.nullable(),
  })
  .strict();

export const startChatTurnRequestSchema = z
  .object({
    turnId: z.string().uuid(),
    modelId: z.string().min(1).max(64),
    message: chatUserContentSchema,
    expectedRevision: revisionSchema,
  })
  .strict();

/**
 * The server-side turn command. `threadId` comes from the request path and
 * `ownerId` from the verified `AuthIdentity`; neither is browser-supplied.
 */
export const chatTurnCommandSchema = startChatTurnRequestSchema
  .extend({
    threadId: z.string().uuid(),
    ownerId: z.string().uuid(),
  })
  .strict();

export const chatUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
  })
  .strict();

export const chatTurnEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('message.started'),
      threadId: z.string().uuid(),
      turnId: z.string().uuid(),
      userMessageId: z.string().uuid(),
      assistantMessageId: z.string().uuid(),
      generationId: z.string().uuid(),
      providerId: chatProviderIdSchema,
      modelId: z.string().min(1).max(64),
      threadRevision: revisionSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('message.delta'),
      assistantMessageId: z.string().uuid(),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal('message.completed'),
      assistantMessageId: z.string().uuid(),
      content: chatAssistantContentSchema,
      providerId: chatProviderIdSchema,
      modelId: z.string().min(1).max(64),
      generationId: z.string().uuid(),
      completedAt: timestampSchema,
      threadRevision: revisionSchema,
      usage: chatUsageSchema.nullable(),
      replay: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('message.failed'),
      assistantMessageId: z.string().uuid(),
      code: chatFailureCodeSchema,
      threadRevision: revisionSchema,
      replay: z.boolean(),
    })
    .strict(),
]);

export type ChatTurnEvent = z.infer<typeof chatTurnEventSchema>;
export type ChatModel = z.infer<typeof chatModelSchema>;
