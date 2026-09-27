import {
  chatModelSchema,
  chatTurnCommandSchema,
  chatTurnEventSchema,
  type ChatFailureCode,
  type ChatMessage,
  type ChatModel,
  type ChatTurnEvent,
} from '../contracts/chat';
import {
  ChatTurnConflictError,
  type ChatKernel,
  type ChatTurnRecord,
} from '../domain/chat-kernel';
import { StoredRecordError } from '../domain/errors';
import {
  CHAT_MODEL_CATALOG,
  ChatModelUnavailableError,
  findChatModel,
  findChatProvider,
  type ChatGenerationRequest,
  type ChatModelIdentity,
  type ChatPromptMessage,
  type ChatProvider,
  type ChatStreamEvent,
  type ChatUsage,
} from './chat-provider';
import {
  NullMemoryProvider,
  type MemoryHit,
  type MemoryProvider,
} from './memory-provider';

/**
 * Elara's operator-assistant framing.
 *
 * Memory is context, not operational truth: current-state questions must be
 * answered from Elara's live typed reads, which this pass does not grant the
 * model. No provider SDK identity, credential, or operational mutation
 * authority is offered to the model.
 */
export const CHAT_SYSTEM_PROMPT = [
  'You are Elara Relay, the operator assistant for a field-service operations system.',
  'Answer using the conversation and any recalled context supplied below.',
  'Recalled context is historical only; it is never current operational truth.',
  'For the current state of a Job, Task, Repair, or Scheduled Action, say that the live Elara record must be read instead of guessing.',
  'Do not invent identifiers, records, or results, and do not claim to have performed an action in Elara.',
].join(' ');

const MEMORY_TAGS = ['chat'] as const;
const MAX_MEMORY_HITS = 10;
const MAX_MEMORY_HIT_CHARACTERS = 500;
const MAX_MEMORY_CONTEXT_CHARACTERS = 4_000;
const DEFAULT_MAX_HISTORY_MESSAGES = 20;
const DEFAULT_TURN_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 2_000;
const DEFAULT_MEMORY_MAX_TOKENS = 1_000;

/** Mirrors the Chat schema and database content bound for completed answers. */
const MAX_ASSISTANT_CHARACTERS = 40_000;

export interface ChatTurnCommand {
  readonly ownerId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly modelId: string;
  readonly message: string;
  readonly expectedRevision: number;
}

export interface ChatTurnStarted extends ChatTurnRecord {
  /** Absent on a replay: stored terminal state needs no provider. */
  readonly provider: ChatProvider | null;
  readonly prompt: readonly ChatPromptMessage[];
  readonly memoryHitCount: number;
}

export interface ChatOrchestratorOptions {
  readonly providers?: readonly ChatProvider[];
  readonly memoryProvider?: MemoryProvider;
  readonly maxHistoryMessages?: number;
  readonly turnTimeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly memoryMaxTokens?: number;
}

/** Counts code points, which is what the database `char_length` bound does. */
function characterLength(value: string): number {
  let count = 0;
  for (const _character of value) count += 1;
  return count;
}

function completedAtOf(message: ChatMessage): string {
  const completedAt = message.completedAt;
  if (completedAt === null) throw new StoredRecordError('ChatMessage');
  return completedAt;
}

function usageOf(
  inputTokens: number | null,
  outputTokens: number | null,
): ChatUsage | null {
  if (inputTokens === null && outputTokens === null) return null;
  return {
    ...(inputTokens === null ? {} : { inputTokens }),
    ...(outputTokens === null ? {} : { outputTokens }),
  };
}

function provenanceOf(turn: ChatTurnStarted): ChatModelIdentity & {
  readonly generationId: string;
} {
  const { providerId, modelId, generationId } = turn.assistantMessage;
  if (providerId === null || modelId === null || generationId === null) {
    throw new StoredRecordError('ChatMessage');
  }
  return { providerId, modelId, generationId };
}

function recalledContext(hits: readonly MemoryHit[]): string {
  if (hits.length === 0) return '';
  const lines = hits.slice(0, MAX_MEMORY_HITS).map((hit) => {
    const evidence = hit.evidence
      .map((reference) => `${reference.source.kind}:${reference.source.id}`)
      .join(',');
    const provenance =
      evidence === '' ? hit.layer : `${hit.layer} (${evidence})`;
    const content = [...hit.content]
      .slice(0, MAX_MEMORY_HIT_CHARACTERS)
      .join('');
    return `- [${provenance}] ${content}`;
  });
  return [
    'Recalled context (historical; not current operational truth):',
    ...lines,
  ]
    .join('\n')
    .slice(0, MAX_MEMORY_CONTEXT_CHARACTERS);
}

function toPromptMessage(message: ChatMessage): ChatPromptMessage {
  return {
    role: message.role === 'USER' ? 'user' : 'assistant',
    content: message.content,
  };
}

/**
 * Resolves once the signal aborts. Exactly one listener is registered per
 * generation, so a long stream cannot accumulate abort listeners.
 */
function onceAborted(signal: AbortSignal): Promise<undefined> {
  return new Promise<undefined>((resolve) => {
    if (signal.aborted) {
      resolve(undefined);
      return;
    }
    signal.addEventListener('abort', () => resolve(undefined), { once: true });
  });
}

/**
 * Server-side Chat orchestration.
 *
 * The orchestrator owns the documented turn order: resolve the model against
 * Elara's catalog, claim the turn durably, assemble prompt context, stream the
 * provider, and finalize the assistant Message exactly once. It holds no
 * database credentials, no owner authority of its own, and no external action
 * capability.
 */
export class ChatTurnOrchestrator {
  private readonly providers: readonly ChatProvider[];
  private readonly memoryProvider: MemoryProvider;
  private readonly maxHistoryMessages: number;
  private readonly turnTimeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly memoryMaxTokens: number;

  public constructor(
    private readonly kernel: ChatKernel,
    options: ChatOrchestratorOptions = {},
  ) {
    this.providers = options.providers ?? [];
    this.memoryProvider = options.memoryProvider ?? new NullMemoryProvider();
    this.maxHistoryMessages =
      options.maxHistoryMessages ?? DEFAULT_MAX_HISTORY_MESSAGES;
    this.turnTimeoutMs = options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
    this.maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    this.memoryMaxTokens = options.memoryMaxTokens ?? DEFAULT_MEMORY_MAX_TOKENS;
  }

  /** The server-owned catalog, annotated with local adapter availability. */
  public availableModels(): ChatModel[] {
    return CHAT_MODEL_CATALOG.map((model) =>
      chatModelSchema.parse({
        modelId: model.modelId,
        providerId: model.providerId,
        available: findChatProvider(model, this.providers) !== undefined,
      }),
    );
  }

  /**
   * Claims the turn durably before any response byte is written, so a rejected
   * request never leaves a half-written conversation.
   */
  public async begin(request: ChatTurnCommand): Promise<ChatTurnStarted> {
    const command = chatTurnCommandSchema.parse(request);
    const model = findChatModel(command.modelId);
    if (model === undefined) throw new ChatModelUnavailableError();

    const record = await this.kernel.beginTurn({
      ownerId: command.ownerId,
      threadId: command.threadId,
      turnId: command.turnId,
      model,
      message: command.message,
      expectedRevision: command.expectedRevision,
    });

    // A retried turn resolves to authoritative stored state and must not
    // depend on the provider still being configured.
    if (record.kind === 'replay') {
      return { ...record, provider: null, prompt: [], memoryHitCount: 0 };
    }

    const provider = findChatProvider(model, this.providers);
    if (provider === undefined) {
      // The accepted attempt stays as history even though it cannot run.
      await this.kernel.failGeneration({
        ownerId: command.ownerId,
        messageId: record.assistantMessage.id,
        failureCode: 'PROVIDER_UNAVAILABLE',
      });
      throw new ChatModelUnavailableError();
    }

    try {
      const hits = await this.recall(command.ownerId, command.message);
      const prompt = await this.assemblePrompt(
        command.ownerId,
        command.threadId,
        hits,
      );

      return { ...record, provider, prompt, memoryHitCount: hits.length };
    } catch (error) {
      // The durable claim already exists. A post-claim prompt/history failure
      // must never strand its assistant Message in PENDING.
      await this.kernel.failGeneration({
        ownerId: command.ownerId,
        messageId: record.assistantMessage.id,
        failureCode: 'PROVIDER_FAILED',
      });
      throw error;
    }
  }

  /**
   * Streams one turn and finalizes it durably. Exactly one terminal event is
   * produced, and the stored outcome stays authoritative whether or not the
   * client received it.
   */
  public async *generate(
    turn: ChatTurnStarted,
    signal: AbortSignal,
  ): AsyncGenerator<ChatTurnEvent> {
    const assistantMessageId = turn.assistantMessage.id;
    const threadRevision = turn.thread.revision;
    const provenance = provenanceOf(turn);

    yield chatTurnEventSchema.parse({
      type: 'message.started',
      threadId: turn.thread.id,
      turnId: turn.userMessage.turnId,
      userMessageId: turn.userMessage.id,
      assistantMessageId,
      generationId: provenance.generationId,
      providerId: provenance.providerId,
      modelId: provenance.modelId,
      threadRevision,
    });

    if (turn.kind === 'replay') {
      yield this.replayedTerminalEvent(turn, provenance, threadRevision);
      return;
    }

    if (turn.provider === null) {
      yield await this.fail(
        turn,
        'PROVIDER_UNAVAILABLE',
        threadRevision,
      );
      return;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.turnTimeoutMs);
    const forwardAbort = (): void => {
      controller.abort();
    };
    if (signal.aborted) {
      // AbortSignal listeners are not retroactive. A disconnect can happen
      // while message.started is being written, before this code resumes.
      controller.abort();
    } else {
      signal.addEventListener('abort', forwardAbort, { once: true });
    }

    let content = '';
    let usage: ChatUsage | undefined;
    let sawCompletion = false;
    let failure: ChatFailureCode | null = null;

    try {
      const request: ChatGenerationRequest = {
        model: {
          providerId: provenance.providerId,
          modelId: provenance.modelId,
        },
        messages: turn.prompt,
        maxOutputTokens: this.maxOutputTokens,
      };
      for await (const event of this.streamProvider(
        turn.provider,
        request,
        controller.signal,
      )) {
        if (event.type === 'text-delta') {
          content += event.text;
          if (characterLength(content) > MAX_ASSISTANT_CHARACTERS) {
            failure = 'PROVIDER_OUTPUT_TOO_LARGE';
            break;
          }
          yield chatTurnEventSchema.parse({
            type: 'message.delta',
            assistantMessageId,
            text: event.text,
          });
        } else {
          usage = event.usage;
          sawCompletion = true;
        }
      }
    } catch {
      // Provider exception text, status codes, prompts and credentials never
      // reach the browser or the durable record.
      failure = this.cancellationCode(timedOut, signal);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', forwardAbort);
    }

    if (failure === null && (signal.aborted || controller.signal.aborted)) {
      failure = this.cancellationCode(timedOut, signal);
    }
    if (failure === null && !sawCompletion) {
      // A stream that ends without its terminal event is an incomplete
      // generation and must never be presented as a completed answer.
      failure = 'PROVIDER_FAILED';
    }
    if (failure === null && content === '') {
      failure = 'EMPTY_RESPONSE';
    }

    if (failure !== null) {
      yield await this.fail(turn, failure, threadRevision);
      return;
    }

    const completed = await this.kernel.completeGeneration({
      ownerId: turn.thread.ownerId,
      messageId: assistantMessageId,
      content,
      usage,
    });
    yield chatTurnEventSchema.parse({
      type: 'message.completed',
      assistantMessageId,
      content: completed.content,
      providerId: provenance.providerId,
      modelId: provenance.modelId,
      generationId: provenance.generationId,
      completedAt: completedAtOf(completed),
      threadRevision,
      usage: usageOf(completed.inputTokens, completed.outputTokens),
      replay: false,
    });
  }

  /**
   * Drives the provider iterator while the turn is still live. A disconnect or
   * timeout stops consuming immediately, and the iterator is always closed.
   */
  private async *streamProvider(
    provider: ChatProvider,
    request: ChatGenerationRequest,
    signal: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const stopped = onceAborted(signal);
    const iterator = provider.stream(request, signal)[Symbol.asyncIterator]();
    try {
      for (;;) {
        const step: IteratorResult<ChatStreamEvent> | undefined =
          await Promise.race([iterator.next(), stopped]);
        if (step === undefined) return;
        if (step.done === true) return;
        yield step.value;
      }
    } finally {
      // Provider cleanup is best-effort. An adapter may ignore AbortSignal
      // while an iterator.next() is still pending; AsyncGenerator.return()
      // then queues behind that call. Durable turn finalization must not wait
      // indefinitely for a non-cooperative provider to release itself.
      try {
        const closing = iterator.return?.(undefined);
        if (closing !== undefined) void closing.catch(() => undefined);
      } catch {
        // A synchronous cleanup failure cannot override Elara's normalized
        // timeout/cancellation result or prevent the durable FAILED transition.
      }
    }
  }

  private cancellationCode(
    timedOut: boolean,
    signal: AbortSignal,
  ): ChatFailureCode {
    if (timedOut) return 'PROVIDER_TIMEOUT';
    if (signal.aborted) return 'GENERATION_CANCELLED';
    return 'PROVIDER_FAILED';
  }

  private async fail(
    turn: ChatTurnStarted,
    failureCode: ChatFailureCode,
    threadRevision: number,
  ): Promise<ChatTurnEvent> {
    const failed = await this.kernel.failGeneration({
      ownerId: turn.thread.ownerId,
      messageId: turn.assistantMessage.id,
      failureCode,
    });
    return chatTurnEventSchema.parse({
      type: 'message.failed',
      assistantMessageId: turn.assistantMessage.id,
      code: failed.failureCode ?? failureCode,
      threadRevision,
      replay: false,
    });
  }

  /**
   * Finalize a claimed generation when the transport stops consuming the
   * stream before the orchestrator can emit its terminal event.
   *
   * The durable Chat kernel remains the only state-transition authority. A
   * terminal race is harmless: if the generation already completed or failed,
   * this operation becomes a no-op instead of rewriting history.
   */
  public async abandon(turn: ChatTurnStarted): Promise<void> {
    if (turn.kind === 'replay') return;

    try {
      await this.kernel.failGeneration({
        ownerId: turn.thread.ownerId,
        messageId: turn.assistantMessage.id,
        failureCode: 'GENERATION_CANCELLED',
      });
    } catch (error) {
      if (
        error instanceof ChatTurnConflictError &&
        error.reason === 'GENERATION_FINALIZED'
      ) {
        return;
      }
      throw error;
    }
  }

  /**
   * Optional context only. A memory outage, block, or timeout yields an empty
   * context; Chat never fails because memory is unavailable.
   */
  private async recall(
    ownerId: string,
    query: string,
  ): Promise<readonly MemoryHit[]> {
    try {
      const result = await this.memoryProvider.recall({
        query,
        scope: { ownerId, tags: [...MEMORY_TAGS] },
        maxTokens: this.memoryMaxTokens,
      });
      return result.hits;
    } catch {
      return [];
    }
  }

  private async assemblePrompt(
    ownerId: string,
    threadId: string,
    hits: readonly MemoryHit[],
  ): Promise<readonly ChatPromptMessage[]> {
    const context = recalledContext(hits);
    const system: ChatPromptMessage = {
      role: 'system',
      content:
        context === ''
          ? CHAT_SYSTEM_PROMPT
          : `${CHAT_SYSTEM_PROMPT}\n\n${context}`,
    };
    const stored = await this.kernel.listMessages(ownerId, threadId);
    // Failed attempts remain in history but are not conversation truth, and an
    // in-flight generation has no content yet.
    const completed = stored
      .filter((message) => message.status === 'COMPLETED')
      .slice(-this.maxHistoryMessages);
    return [system, ...completed.map(toPromptMessage)];
  }

  private replayedTerminalEvent(
    turn: ChatTurnStarted,
    provenance: ChatModelIdentity & { readonly generationId: string },
    threadRevision: number,
  ): ChatTurnEvent {
    const stored = turn.assistantMessage;
    if (stored.status === 'COMPLETED') {
      return chatTurnEventSchema.parse({
        type: 'message.completed',
        assistantMessageId: stored.id,
        content: stored.content,
        providerId: provenance.providerId,
        modelId: provenance.modelId,
        generationId: provenance.generationId,
        completedAt: completedAtOf(stored),
        threadRevision,
        usage: usageOf(stored.inputTokens, stored.outputTokens),
        replay: true,
      });
    }
    return chatTurnEventSchema.parse({
      type: 'message.failed',
      assistantMessageId: stored.id,
      code: stored.failureCode ?? 'PROVIDER_FAILED',
      threadRevision,
      replay: true,
    });
  }
}
