export type ChatProviderId = 'openai' | 'muse';

export interface ChatModelIdentity {
  readonly providerId: ChatProviderId;
  readonly modelId: string;
}

/**
 * Elara's stable model identities are separate from provider adapter names.
 * Provider SDK identifiers and credentials stay inside server adapters.
 */
export const CHAT_MODEL_CATALOG = [
  {
    providerId: 'openai',
    modelId: 'gpt-6-luna',
  },
  {
    providerId: 'muse',
    modelId: 'muse-spark-1.3-contributor',
  },
] as const satisfies readonly ChatModelIdentity[];

export type ElaraChatModelId =
  (typeof CHAT_MODEL_CATALOG)[number]['modelId'];

export type ChatMessageRole = 'system' | 'user' | 'assistant';

export interface ChatPromptMessage {
  readonly role: ChatMessageRole;
  readonly content: string;
}

export interface ChatGenerationRequest {
  readonly model: ChatModelIdentity;
  readonly messages: readonly ChatPromptMessage[];
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
}

export interface ChatUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export type ChatStreamEvent =
  | {
      readonly type: 'text-delta';
      readonly text: string;
    }
  | {
      readonly type: 'completed';
      readonly usage?: ChatUsage;
    };

/**
 * Each adapter may only serve models assigned to its providerId. The stream
 * yields content deltas followed by one completed event; transport cancellation
 * is communicated through AbortSignal.
 */
export interface ChatProvider {
  readonly providerId: ChatProviderId;
  stream(
    request: ChatGenerationRequest,
    signal: AbortSignal,
  ): AsyncIterable<ChatStreamEvent>;
}

export interface ChatGenerationProvenance extends ChatModelIdentity {
  readonly generationId: string;
  readonly completedAt: string;
  readonly usage?: ChatUsage;
}

export class ChatModelUnavailableError extends Error {
  public constructor() {
    super('Requested chat model is unavailable');
    this.name = 'ChatModelUnavailableError';
  }
}

export function findChatModel(
  modelId: string,
): ChatModelIdentity | undefined {
  return CHAT_MODEL_CATALOG.find((model) => model.modelId === modelId);
}

export function resolveChatProvider(
  modelId: string,
  providers: readonly ChatProvider[],
): ChatProvider {
  const model = findChatModel(modelId);
  if (model === undefined) throw new ChatModelUnavailableError();

  const provider = providers.find(
    (candidate) => candidate.providerId === model.providerId,
  );
  if (provider === undefined) throw new ChatModelUnavailableError();

  return provider;
}
