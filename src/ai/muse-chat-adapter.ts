/**
 * Server-only Muse adapter for the provider-neutral `ChatProvider` port.
 *
 * The `muse` provider boundary is served by Meta's Model API
 * (`https://api.meta.ai/v1`), which hosts the Muse Spark family. Elara model
 * identities are resolved to Meta model identifiers inside this module; the
 * browser never sees, supplies or stores a provider model identifier,
 * endpoint or credential.
 *
 * Protocol: OpenAI-compatible Chat Completions streaming
 * (`POST /chat/completions`, `stream: true`), which is the surface the Meta
 * Model API documents for incremental output and final-chunk usage.
 * `docs/ai-chat-runtime.md` documents the reviewed provider contract.
 */
import { z } from 'zod';
import {
  ChatModelUnavailableError,
  ChatProviderFault,
  type ChatGenerationRequest,
  type ChatPromptMessage,
  type ChatProvider,
  type ChatStreamEvent,
  type ChatUsage,
  type ElaraChatModelId,
} from './chat-provider';
import { streamProviderEvents } from './chat-http';

/**
 * Elara model identity -> Meta Model API model identifier.
 *
 * Provider identifiers stay inside the adapter. They are never derived from,
 * or exposed as, Elara model identities, and a model absent from this table
 * fails closed rather than being forwarded to the provider.
 */
const MUSE_MODELS = [
  {
    elaraModelId: 'muse-spark-1.3-contributor',
    sdkModelId: 'muse-spark-1.3-contributor',
  },
] as const satisfies readonly {
  readonly elaraModelId: ElaraChatModelId;
  readonly sdkModelId: string;
}[];

function museSdkModelId(modelId: string): string | undefined {
  return MUSE_MODELS.find((model) => model.elaraModelId === modelId)
    ?.sdkModelId;
}

const chunkSchema = z
  .object({
    object: z.string().optional(),
    choices: z
      .array(
        z
          .object({
            delta: z
              .object({ content: z.string().nullable().optional() })
              .passthrough()
              .nullable()
              .optional(),
            finish_reason: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
    usage: z
      .object({
        prompt_tokens: z.number().int().nonnegative().nullable().optional(),
        completion_tokens: z.number().int().nonnegative().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    error: z.unknown().nullable().optional(),
  })
  .passthrough();

/** Sentinel Meta and OpenAI-compatible providers use to end a stream. */
const DONE_SENTINEL = '[DONE]';

export interface MuseChatAdapterOptions {
  /** Server-only credential. Never logged, never returned to a caller. */
  readonly apiKey: string;
  /** Validated provider origin plus API version prefix, without trailing slash. */
  readonly baseUrl: string;
  /** Overall per-generation bound covering the whole streamed response. */
  readonly requestTimeoutMs: number;
  /** Injectable for deterministic tests; defaults to the runtime `fetch`. */
  readonly fetchFn?: typeof fetch;
}

/**
 * Muse treats `system` as an OpenAI-compatibility alias for the higher
 * precedence `developer` role, and documents `developer` as the preferred
 * instruction role. Elara's provider-neutral `system` role maps to it.
 */
function toProviderMessage(message: ChatPromptMessage): {
  readonly role: string;
  readonly content: string;
} {
  return {
    role: message.role === 'system' ? 'developer' : message.role,
    content: message.content,
  };
}

export class MuseChatProvider implements ChatProvider {
  public readonly providerId = 'muse' as const;
  private readonly fetchFn: typeof fetch;

  public constructor(private readonly options: MuseChatAdapterOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  public async *stream(
    request: ChatGenerationRequest,
    signal: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent, void, void> {
    const modelId = this.resolveModel(request);
    const body: Record<string, unknown> = {
      model: modelId,
      messages: request.messages.map(toProviderMessage),
      stream: true,
      // Ask for token usage in the final chunk; Muse omits it otherwise.
      stream_options: { include_usage: true },
    };
    if (request.maxOutputTokens !== undefined) {
      // Chat Completions uses max_completion_tokens; the Responses API name
      // max_output_tokens is rejected here.
      body['max_completion_tokens'] = request.maxOutputTokens;
    }
    if (request.temperature !== undefined) {
      body['temperature'] = request.temperature;
    }

    let usage: ChatUsage | undefined;
    let terminal = false;

    for await (const event of streamProviderEvents(
      {
        url: `${this.options.baseUrl}/chat/completions`,
        apiKey: this.options.apiKey,
        body,
        requestTimeoutMs: this.options.requestTimeoutMs,
        fetchFn: this.fetchFn,
      },
      signal,
    )) {
      if (event.data === DONE_SENTINEL) {
        if (!terminal) throw new ChatProviderFault('INVALID_RESPONSE');
        yield { type: 'completed', ...(usage !== undefined && { usage }) };
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        throw new ChatProviderFault('INVALID_RESPONSE');
      }

      const parsed = chunkSchema.safeParse(payload);
      if (!parsed.success) throw new ChatProviderFault('INVALID_RESPONSE');

      if (parsed.data.error !== undefined && parsed.data.error !== null) {
        throw new ChatProviderFault('PROVIDER_FAILURE');
      }

      for (const choice of parsed.data.choices ?? []) {
        const content = choice.delta?.content;
        if (typeof content === 'string' && content !== '') {
          yield { type: 'text-delta', text: content };
        }
        if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
          terminal = true;
        }
      }

      const chunkUsage = parsed.data.usage;
      if (chunkUsage !== undefined && chunkUsage !== null) {
        const inputTokens = chunkUsage.prompt_tokens ?? undefined;
        const outputTokens = chunkUsage.completion_tokens ?? undefined;
        if (inputTokens !== undefined || outputTokens !== undefined) {
          usage = {
            ...(inputTokens !== undefined && { inputTokens }),
            ...(outputTokens !== undefined && { outputTokens }),
          };
          terminal = true;
        }
      }
    }

    // A stream that never reported a finish reason must not be committed as a
    // completed assistant answer, because partial text is not a generation.
    if (!terminal) throw new ChatProviderFault('INVALID_RESPONSE');
    yield { type: 'completed', ...(usage !== undefined && { usage }) };
  }

  private resolveModel(request: ChatGenerationRequest): string {
    if (request.model.providerId !== this.providerId) {
      throw new ChatModelUnavailableError();
    }
    const modelId = museSdkModelId(request.model.modelId);
    if (modelId === undefined) throw new ChatModelUnavailableError();
    return modelId;
  }
}
