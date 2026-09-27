import { describe, expect, it } from 'vitest';

import {
  CHAT_MODEL_CATALOG,
  ChatModelUnavailableError,
  findChatModel,
  resolveChatProvider,
  type ChatProvider,
} from './chat-provider';

const openAiProvider: ChatProvider = {
  providerId: 'openai',
  async *stream() {
    yield { type: 'text-delta', text: 'Hello' };
    yield { type: 'completed', usage: { inputTokens: 3, outputTokens: 1 } };
  },
};

const museProvider: ChatProvider = {
  providerId: 'muse',
  async *stream() {
    yield { type: 'text-delta', text: 'Kia ora' };
    yield { type: 'completed' };
  },
};

describe('provider-neutral chat contract', () => {
  it('publishes the two configured Elara model identities independently of adapters', () => {
    expect(CHAT_MODEL_CATALOG).toEqual([
      { providerId: 'openai', modelId: 'gpt-6-luna' },
      {
        providerId: 'muse',
        modelId: 'muse-spark-1.3-contributor',
      },
    ]);
  });

  it('routes each stable model identity to its matching provider adapter', () => {
    const providers = [openAiProvider, museProvider];

    expect(findChatModel('gpt-6-luna')).toEqual({
      providerId: 'openai',
      modelId: 'gpt-6-luna',
    });
    expect(resolveChatProvider('gpt-6-luna', providers)).toBe(openAiProvider);
    expect(
      resolveChatProvider('muse-spark-1.3-contributor', providers),
    ).toBe(museProvider);
  });

  it('fails closed for unknown models and missing provider adapters', () => {
    expect(() => resolveChatProvider('not-configured', [])).toThrow(
      ChatModelUnavailableError,
    );
    expect(() =>
      resolveChatProvider('gpt-6-luna', [museProvider]),
    ).toThrow(ChatModelUnavailableError);
  });

  it('provides a typed streaming contract with a terminal completion event', async () => {
    const events = [];
    for await (const event of openAiProvider.stream(
      {
        model: { providerId: 'openai', modelId: 'gpt-6-luna' },
        messages: [{ role: 'user', content: 'Hello' }],
      },
      new AbortController().signal,
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'text-delta', text: 'Hello' },
      { type: 'completed', usage: { inputTokens: 3, outputTokens: 1 } },
    ]);
  });
});
