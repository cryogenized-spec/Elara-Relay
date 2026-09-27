import {
  chatMessageSchema,
  chatThreadSchema,
  chatAssistantContentSchema,
  type ChatFailureCode,
  type ChatMessage,
  type ChatThread,
} from '../contracts/chat';
import { DomainNotFoundError, DomainValidationError } from './errors';
import { nextRevision } from './revision';
import type { ChatStore, ChatTurnMessages } from './chat-store';
import type { ChatModelIdentity, ChatUsage } from '../ai/chat-provider';

export type ChatTurnConflictReason =
  | 'THREAD_REPLAY_MISMATCH'
  | 'STALE_REVISION'
  | 'TURN_REPLAY_MISMATCH'
  | 'TURN_IN_PROGRESS'
  | 'GENERATION_FINALIZED';

/**
 * A client-visible turn conflict. The message carries the reason only: no
 * prompt, provider, or other owner content is ever included.
 */
export class ChatTurnConflictError extends Error {
  public constructor(public readonly reason: ChatTurnConflictReason) {
    super(`Chat turn conflict: ${reason}`);
    this.name = 'ChatTurnConflictError';
  }
}

export interface ChatKernelOptions {
  clock?: () => string;
  idGenerator?: () => string;
}

export interface CreateChatThreadInput {
  readonly ownerId: string;
  readonly threadId: string;
  readonly title: string | null;
}

export interface CreatedChatThread {
  readonly thread: ChatThread;
  /** True when a retried request resolved to the already-stored Thread. */
  readonly replay: boolean;
}

export interface BeginChatTurnInput {
  readonly ownerId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly model: ChatModelIdentity;
  readonly message: string;
  readonly expectedRevision: number;
}

export interface ChatTurnRecord {
  readonly kind: 'started' | 'replay';
  readonly thread: ChatThread;
  readonly userMessage: ChatMessage;
  readonly assistantMessage: ChatMessage;
}

export interface CompleteChatGenerationInput {
  readonly ownerId: string;
  readonly messageId: string;
  readonly content: string;
  readonly usage?: ChatUsage | undefined;
}

export interface FailChatGenerationInput {
  readonly ownerId: string;
  readonly messageId: string;
  readonly failureCode: ChatFailureCode;
}

export interface ChatThreadDetail {
  readonly thread: ChatThread;
  readonly messages: ChatMessage[];
}

/**
 * Durable Chat authority.
 *
 * The kernel owns owner scoping, the optimistic Thread revision, one-turn
 * identity, and the pending -> terminal assistant transition. It knows nothing
 * about providers, prompts, HTTP, or browser concerns; the AI orchestration
 * layer calls it in the documented turn order.
 */
export class ChatKernel {
  private readonly clock: () => string;
  private readonly idGenerator: () => string;

  public constructor(
    private readonly store: ChatStore,
    options: ChatKernelOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
  }

  public async createThread(
    input: CreateChatThreadInput,
  ): Promise<CreatedChatThread> {
    return this.store.transact(async (transaction) => {
      const existing = await transaction.getThread(
        input.ownerId,
        input.threadId,
      );
      if (existing !== undefined) {
        // A stable client-supplied Thread ID makes creation retry-safe without
        // a second idempotency authority. Reuse requires identical intent.
        if (existing.title !== input.title) {
          throw new ChatTurnConflictError('THREAD_REPLAY_MISMATCH');
        }
        return { thread: existing, replay: true };
      }

      const now = this.now();
      const thread: ChatThread = chatThreadSchema.parse({
        id: input.threadId,
        ownerId: input.ownerId,
        title: input.title,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      });
      await transaction.insertThread(thread);
      return { thread, replay: false };
    });
  }

  public async listThreads(
    ownerId: string,
    limit: number,
  ): Promise<ChatThread[]> {
    return this.store.read((read) => read.listThreads(ownerId, limit));
  }

  public async getThread(
    ownerId: string,
    threadId: string,
  ): Promise<ChatThreadDetail> {
    return this.store.read(async (read) => {
      const thread = await read.getThread(ownerId, threadId);
      if (thread === undefined) {
        throw new DomainNotFoundError('ChatThread', threadId);
      }
      return { thread, messages: await read.listMessages(ownerId, threadId) };
    });
  }

  public async listMessages(
    ownerId: string,
    threadId: string,
  ): Promise<ChatMessage[]> {
    return this.store.read((read) => read.listMessages(ownerId, threadId));
  }

  /**
   * Claims one turn. The user Message, the pending assistant Message, and the
   * single Thread revision advance commit together or not at all, so a crash
   * can never leave a half-written turn.
   */
  public async beginTurn(input: BeginChatTurnInput): Promise<ChatTurnRecord> {
    return this.store.transact(async (transaction) => {
      const thread = await transaction.getThread(input.ownerId, input.threadId);
      if (thread === undefined) {
        throw new DomainNotFoundError('ChatThread', input.threadId);
      }

      const replayed = await transaction.findTurnMessages(
        input.ownerId,
        input.threadId,
        input.turnId,
      );
      if (replayed !== undefined) {
        return this.replayTurn(thread, replayed, input);
      }

      if (thread.revision !== input.expectedRevision) {
        throw new ChatTurnConflictError('STALE_REVISION');
      }

      const now = this.now();
      const revision = nextRevision(thread.revision, input.expectedRevision);
      const userMessage = chatMessageSchema.parse({
        id: this.newId(),
        threadId: thread.id,
        ownerId: input.ownerId,
        turnId: input.turnId,
        role: 'USER',
        status: 'COMPLETED',
        content: input.message,
        providerId: null,
        modelId: null,
        generationId: null,
        createdAt: now,
        completedAt: now,
        inputTokens: null,
        outputTokens: null,
        failureCode: null,
      });
      const assistantMessage = chatMessageSchema.parse({
        id: this.newId(),
        threadId: thread.id,
        ownerId: input.ownerId,
        turnId: input.turnId,
        role: 'ASSISTANT',
        status: 'PENDING',
        content: '',
        providerId: input.model.providerId,
        modelId: input.model.modelId,
        generationId: this.newId(),
        createdAt: now,
        completedAt: null,
        inputTokens: null,
        outputTokens: null,
        failureCode: null,
      });

      await transaction.insertMessage(userMessage);
      await transaction.insertMessage(assistantMessage);
      const advanced = chatThreadSchema.parse({
        ...thread,
        updatedAt: now,
        revision,
      });
      if (
        !(
          await transaction.advanceThreadRevision(
            advanced,
            input.expectedRevision,
          )
        )
      ) {
        throw new ChatTurnConflictError('STALE_REVISION');
      }

      return {
        kind: 'started',
        thread: advanced,
        userMessage,
        assistantMessage,
      };
    });
  }

  public async completeGeneration(
    input: CompleteChatGenerationInput,
  ): Promise<ChatMessage> {
    const content = chatAssistantContentSchema.safeParse(input.content);
    if (!content.success) {
      throw new DomainValidationError(
        'Completed assistant content exceeds the stored limit',
      );
    }

    return this.finalize(input.ownerId, input.messageId, (message, now) =>
      chatMessageSchema.parse({
        ...message,
        status: 'COMPLETED',
        content: content.data,
        completedAt: now,
        inputTokens: input.usage?.inputTokens ?? null,
        outputTokens: input.usage?.outputTokens ?? null,
        failureCode: null,
      }),
    );
  }

  public async failGeneration(
    input: FailChatGenerationInput,
  ): Promise<ChatMessage> {
    return this.finalize(input.ownerId, input.messageId, (message, now) =>
      chatMessageSchema.parse({
        ...message,
        status: 'FAILED',
        content: '',
        completedAt: now,
        inputTokens: null,
        outputTokens: null,
        failureCode: input.failureCode,
      }),
    );
  }

  /**
   * Single terminal transition. A completed Message is never rewritten: a
   * second attempt to finalize the same generation is reported as a conflict
   * instead of overwriting history.
   */
  private async finalize(
    ownerId: string,
    messageId: string,
    build: (message: ChatMessage, now: string) => ChatMessage,
  ): Promise<ChatMessage> {
    return this.store.transact(async (transaction) => {
      const stored = await transaction.getMessage(ownerId, messageId);
      if (stored === undefined) {
        throw new DomainNotFoundError('ChatMessage', messageId);
      }
      if (stored.role !== 'ASSISTANT' || stored.status !== 'PENDING') {
        throw new ChatTurnConflictError('GENERATION_FINALIZED');
      }

      const terminal = build(stored, this.now());
      const applied =
        terminal.status === 'COMPLETED'
          ? await transaction.completeMessage(terminal)
          : await transaction.failMessage(terminal);
      if (!applied) {
        throw new ChatTurnConflictError('GENERATION_FINALIZED');
      }
      return terminal;
    });
  }

  private replayTurn(
    thread: ChatThread,
    replayed: ChatTurnMessages,
    input: BeginChatTurnInput,
  ): ChatTurnRecord {
    const sameIntent =
      replayed.userMessage.content === input.message &&
      replayed.assistantMessage.providerId === input.model.providerId &&
      replayed.assistantMessage.modelId === input.model.modelId;
    if (!sameIntent) {
      throw new ChatTurnConflictError('TURN_REPLAY_MISMATCH');
    }
    if (replayed.assistantMessage.status === 'PENDING') {
      throw new ChatTurnConflictError('TURN_IN_PROGRESS');
    }
    return {
      kind: 'replay',
      thread,
      userMessage: replayed.userMessage,
      assistantMessage: replayed.assistantMessage,
    };
  }

  private now(): string {
    return this.clock();
  }

  private newId(): string {
    return this.idGenerator();
  }
}
