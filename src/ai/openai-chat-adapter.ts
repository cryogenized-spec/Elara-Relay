/**
 * Server-only OpenAI adapter for the provider-neutral `ChatProvider` port.
 *
 * Elara model identities are resolved to OpenAI SDK model identifiers inside
 * this module. The browser never sees, supplies or stores a provider model
 * identifier, endpoint or credential.
 *
 * Protocol: OpenAI Responses API streaming (`POST /responses`, `stream: true`),
 * which OpenAI recommends for streaming because it emits typed semantic
 * events. `docs/ai-chat-runtime.md` documents the reviewed provider contract.
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
 * Elara model identity -> OpenAI SDK model identifier.
 *
 * Provider identifiers stay inside the adapter. They are never derived from,
 * or exposed as, Elara model identities, and a model absent from this table
 * fails closed rather than being forwarded to the provider.
 */
const OPENAI_MODELS = [
  { elaraModelId: 'gpt-6-luna', sdkModelId: 'gpt-6-luna' },
] as const satisfies readonly {
  readonly elaraModelId: ElaraChatModelId;
  readonly sdkModelId: string;
}[];

function openAiSdkModelId(modelId: string): string | undefined {
  return OPENAI_MODELS.find((model) => model.elaraModelId === modelId)
    ?.sdkModelId;
}

const usageSchema = z
  .object({
    input_tokens: z.number().int().nonnegative().nullable().optional(),
    output_tokens: z.number().int().nonnegative().nullable().optional(),
  })
  .passthrough();

const streamEventSchema = z
  .object({
    type: z.string().min(1),
    delta: z.string().nullable().optional(),
    response: z
      .object({ usage: usageSchema.nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export interface OpenAiChatAdapterOptions {
  /** Server-only credential. Never logged, never returned to a caller. */
  readonly apiKey: string;
  /** Validated provider origin plus API version prefix, without trailing slash. */
  readonly baseUrl: string;
  /** Overall per-generation bound covering the whole streamed response. */
  readonly requestTimeoutMs: number;
  /** Injectable for deterministic tests; defaults to the runtime `fetch`. */
  readonly fetchFn?: typeof fetch;
}

function toUsage(
  raw: z.infer<typeof usageSchema> | null | undefined,
): ChatUsage | undefined {
  const inputTokens = raw?.input_tokens ?? undefined;
  const outputTokens = raw?.output_tokens ?? undefined;
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  return {
    ...(inputTokens !== undefined && { inputTokens }),
    ...(outputTokens !== undefined && { outputTokens }),
  };
}

/** OpenAI accepts the Elara system role unchanged on Responses input items. */
function toInputItem(
  message: ChatPromptMessage,
): { readonly role: string; readonly content: string } {
  return { role: message.role, content: message.content };
}

export class OpenAiChatProvider implements ChatProvider {
  public readonly providerId = 'openai' as const;
  private readonly fetchFn: typeof fetch;

  public constructor(private readonly options: OpenAiChatAdapterOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  public async *stream(
    request: ChatGenerationRequest,
    signal: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent, void, void> {
    const modelId = this.resolveModel(request);
    const body: Record<string, unknown> = {
      model: modelId,
      input: request.messages.map(toInputItem),
      stream: true,
      // Elara owns the conversation record. OpenAI must not retain it.
      store: false,
    };
    if (request.maxOutputTokens !== undefined) {
      body['max_output_tokens'] = request.maxOutputTokens;
    }
    // `temperature` is deliberately not forwarded: current OpenAI reasoning
    // models, including gpt-6-luna, reject the parameter.

    for await (const event of streamProviderEvents(
      {
        url: `${this.options.baseUrl}/responses`,
        apiKey: this.options.apiKey,
        body,
        requestTimeoutMs: this.options.requestTimeoutMs,
        fetchFn: this.fetchFn,
      },
      signal,
    )) {
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        throw new ChatProviderFault('INVALID_RESPONSE');
      }

      const parsed = streamEventSchema.safeParse(payload);
      if (!parsed.success) throw new ChatProviderFault('INVALID_RESPONSE');

      switch (parsed.data.type) {
        case 'response.output_text.delta': {
          const delta = parsed.data.delta;
          if (typeof delta !== 'string') {
            throw new ChatProviderFault('INVALID_RESPONSE');
          }
          if (delta !== '') yield { type: 'text-delta', text: delta };
          break;
        }
        case 'response.completed': {
          const usage = toUsage(parsed.data.response?.usage);
          yield { type: 'completed', ...(usage !== undefined && { usage }) };
          return;
        }
        case 'response.incomplete':
        case 'response.failed':
        case 'error':
          // A terminal provider failure or an incomplete generation must never
          // be committed as a completed assistant answer.
          throw new ChatProviderFault('PROVIDER_FAILURE');
        default:
          // Unrecognized events are ignored so forward-compatible provider
          // additions do not break an otherwise valid stream.
          break;
      }
    }

    // A stream that never reported completion must not be treated as a
    // finished answer, because partial text is not a completed generation.
    throw new ChatProviderFault('INVALID_RESPONSE');
  }

  private resolveModel(request: ChatGenerationRequest): string {
    if (request.model.providerId !== this.providerId) {
      throw new ChatModelUnavailableError();
    }
    const modelId = openAiSdkModelId(request.model.modelId);
    if (modelId === undefined) throw new ChatModelUnavailableError();
    return modelId;
  }
}
