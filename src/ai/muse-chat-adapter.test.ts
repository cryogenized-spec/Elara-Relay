import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ChatModelUnavailableError,
  ChatProviderFault,
  type ChatGenerationRequest,
  type ChatProvider,
  type ChatStreamEvent,
} from './chat-provider';
import { MuseChatProvider } from './muse-chat-adapter';

/**
 * Deterministic adapter certification against mocked provider HTTP responses.
 * No live provider credential is required or used.
 */
const API_KEY = 'test-muse-adapter-key';
const BASE_URL = 'https://api.meta.ai/v1';

const encoder = new TextEncoder();
const jsonBodySchema = z.record(z.string(), z.unknown());

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function capture(
  respond: () => Response | Promise<Response>,
): { readonly fetchFn: typeof fetch; readonly calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push({ url, init });
    return Promise.resolve(respond());
  };
  return { fetchFn, calls };
}

function eventStream(chunks: readonly string[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunk));
    },
  });
}

function hangingStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull: () => new Promise<void>(() => undefined),
  });
}

function sseResponse(frames: readonly unknown[]): Response {
  return new Response(
    eventStream([
      ...frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`),
      'data: [DONE]\n\n',
    ]),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

function chunk(
  content: string | null,
  finishReason: string | null = null,
): Record<string, unknown> {
  return {
    id: 'chatcmpl_muse_1',
    object: 'chat.completion.chunk',
    model: 'muse-spark-1.3-contributor',
    choices: [
      {
        index: 0,
        delta: {
          ...(content === null ? {} : { content }),
          reasoning_content: 'private reasoning',
        },
        finish_reason: finishReason,
      },
    ],
  };
}

function provider(
  fetchFn: typeof fetch,
  requestTimeoutMs = 5_000,
): ChatProvider {
  return new MuseChatProvider({
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    requestTimeoutMs,
    fetchFn,
  });
}

const request: ChatGenerationRequest = {
  model: { providerId: 'muse', modelId: 'muse-spark-1.3-contributor' },
  messages: [
    { role: 'system', content: 'You are Elara.' },
    { role: 'assistant', content: 'Ready.' },
    { role: 'user', content: 'Summarize today.' },
  ],
  maxOutputTokens: 512,
  temperature: 1,
};

async function collect(
  instance: ChatProvider,
  generation: ChatGenerationRequest = request,
  signal: AbortSignal = new AbortController().signal,
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of instance.stream(generation, signal)) {
    events.push(event);
  }
  return events;
}

async function faultFrom(
  instance: ChatProvider,
  generation: ChatGenerationRequest = request,
  signal: AbortSignal = new AbortController().signal,
): Promise<ChatProviderFault> {
  try {
    await collect(instance, generation, signal);
  } catch (error: unknown) {
    if (error instanceof ChatProviderFault) return error;
    throw error;
  }
  throw new Error('expected the provider stream to fail');
}

function requestBodyOf(
  call: CapturedRequest | undefined,
): Record<string, unknown> {
  const body = call?.init?.body;
  if (typeof body !== 'string') throw new Error('expected a JSON request body');
  return jsonBodySchema.parse(JSON.parse(body));
}

function headerValue(
  call: CapturedRequest | undefined,
  name: string,
): string | null {
  return new Headers(call?.init?.headers).get(name);
}

describe('Muse chat adapter', () => {
  it('normalizes Chat Completions streaming chunks and final-chunk usage', async () => {
    const { fetchFn, calls } = capture(() =>
      sseResponse([
        chunk('Kia '),
        chunk('ora'),
        chunk(null, 'stop'),
        { id: 'chatcmpl_muse_1', choices: [], usage: {
          prompt_tokens: 21, completion_tokens: 5, total_tokens: 26,
          completion_tokens_details: { reasoning_tokens: 3 } } },
      ]),
    );

    const events = await collect(provider(fetchFn));

    expect(events).toEqual([
      { type: 'text-delta', text: 'Kia ' },
      { type: 'text-delta', text: 'ora' },
      { type: 'completed', usage: { inputTokens: 21, outputTokens: 5 } },
    ]);

    // Only provider-neutral fields may leave the adapter boundary.
    expect(Object.keys(events[0] ?? {}).sort()).toEqual(['text', 'type']);
    expect(Object.keys(events[2] ?? {}).sort()).toEqual(['type', 'usage']);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('reasoning');
    expect(serialized).not.toContain('chatcmpl_muse_1');
    expect(serialized).not.toContain('muse-spark');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/chat/completions`);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(headerValue(calls[0], 'authorization')).toBe(`Bearer ${API_KEY}`);
    expect(headerValue(calls[0], 'accept')).toBe('text/event-stream');

    const body = requestBodyOf(calls[0]);
    expect(body['model']).toBe('muse-spark-1.3-contributor');
    expect(body['stream']).toBe(true);
    expect(body['stream_options']).toEqual({ include_usage: true });
    // Chat Completions uses max_completion_tokens, not max_output_tokens.
    expect(body['max_completion_tokens']).toBe(512);
    expect(Object.hasOwn(body, 'max_output_tokens')).toBe(false);
    expect(body['temperature']).toBe(1);
    // Muse accepts `system` only as a compatibility alias; `developer` is the
    // documented preferred instruction role.
    expect(body['messages']).toEqual([
      { role: 'developer', content: 'You are Elara.' },
      { role: 'assistant', content: 'Ready.' },
      { role: 'user', content: 'Summarize today.' },
    ]);
    expect(JSON.stringify(body)).not.toContain(API_KEY);
  });

  it('omits usage, token and temperature parameters the caller did not supply', async () => {
    const { fetchFn, calls } = capture(() =>
      sseResponse([chunk(null, 'stop')]),
    );

    const minimal: ChatGenerationRequest = {
      model: { providerId: 'muse', modelId: 'muse-spark-1.3-contributor' },
      messages: [{ role: 'user', content: 'Hello' }],
    };
    const events = await collect(provider(fetchFn), minimal);

    expect(events).toEqual([{ type: 'completed' }]);
    const body = requestBodyOf(calls[0]);
    expect(Object.hasOwn(body, 'max_completion_tokens')).toBe(false);
    expect(Object.hasOwn(body, 'temperature')).toBe(false);
    expect(body['stream_options']).toEqual({ include_usage: true });
  });

  it('completes without usage when the provider omits the usage chunk', async () => {
    const { fetchFn } = capture(() => sseResponse([chunk('hi', 'stop')]));

    expect(await collect(provider(fetchFn))).toEqual([
      { type: 'text-delta', text: 'hi' },
      { type: 'completed' },
    ]);
  });

  it('fails closed for another provider or an unknown model without calling the provider', async () => {
    const { fetchFn, calls } = capture(() => sseResponse([]));
    const instance = provider(fetchFn);

    const openAiRequest: ChatGenerationRequest = {
      model: { providerId: 'openai', modelId: 'gpt-6-luna' },
      messages: [{ role: 'user', content: 'Hello' }],
    };
    const unknownRequest: ChatGenerationRequest = {
      model: { providerId: 'muse', modelId: 'muse-spark-9' },
      messages: [{ role: 'user', content: 'Hello' }],
    };

    await expect(collect(instance, openAiRequest)).rejects.toThrow(
      ChatModelUnavailableError,
    );
    await expect(collect(instance, unknownRequest)).rejects.toThrow(
      ChatModelUnavailableError,
    );
    expect(calls).toHaveLength(0);
  });

  it('maps provider HTTP failures to a sanitized fault', async () => {
    const providerMessage = `rate_limit_exceeded for key ${API_KEY}`;
    const { fetchFn } = capture(
      () =>
        new Response(JSON.stringify({ error: { message: providerMessage } }), {
          status: 429,
        }),
    );

    const fault = await faultFrom(provider(fetchFn));

    expect(fault.code).toBe('HTTP');
    expect(fault.status).toBe(429);
    expect(fault.message).toBe('Chat provider HTTP (429)');
    expect(fault.message).not.toContain(API_KEY);
    expect(fault.message).not.toContain('rate_limit_exceeded');
  });

  it('fails closed on a mid-stream provider error chunk', async () => {
    const { fetchFn } = capture(() =>
      sseResponse([
        chunk('partial'),
        { error: { message: `upstream ${API_KEY}`, code: 'server_error' } },
      ]),
    );

    const fault = await faultFrom(provider(fetchFn));

    expect(fault.code).toBe('PROVIDER_FAILURE');
    expect(fault.message).toBe('Chat provider PROVIDER_FAILURE');
    expect(fault.message).not.toContain(API_KEY);
  });

  it('fails closed when the stream ends without a finish reason', async () => {
    const { fetchFn } = capture(() =>
      sseResponse([chunk('partial'), { id: 'chatcmpl_muse_1', choices: [] }]),
    );

    expect((await faultFrom(provider(fetchFn))).code).toBe('INVALID_RESPONSE');
  });

  it('fails closed on an unparseable event', async () => {
    const { fetchFn } = capture(
      () =>
        new Response(eventStream(['data: not-json\n\n']), { status: 200 }),
    );

    expect((await faultFrom(provider(fetchFn))).code).toBe('INVALID_RESPONSE');
  });

  it('propagates caller cancellation to the provider request', async () => {
    const controller = new AbortController();
    let upstreamAborted = false;
    const { fetchFn } = capture(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(streamController) {
              streamController.enqueue(
                encoder.encode(`data: ${JSON.stringify(chunk('partial'))}\n\n`),
              );
            },
            cancel() {
              upstreamAborted = true;
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    );

    const events: ChatStreamEvent[] = [];
    const instance = provider(fetchFn);
    let fault: ChatProviderFault | undefined;
    try {
      for await (const event of instance.stream(request, controller.signal)) {
        events.push(event);
        controller.abort();
      }
    } catch (error: unknown) {
      if (error instanceof ChatProviderFault) fault = error;
      else throw error;
    }

    expect(events).toEqual([{ type: 'text-delta', text: 'partial' }]);
    expect(fault?.code).toBe('CANCELLED');
    expect(upstreamAborted).toBe(true);
  });

  it('bounds a stalled generation with the configured request timeout', async () => {
    const { fetchFn } = capture(
      () =>
        new Response(hangingStream(), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );

    expect((await faultFrom(provider(fetchFn, 25))).code).toBe('TIMEOUT');
  });

  it('does not leak provider configuration into normalized events', async () => {
    const { fetchFn } = capture(() => sseResponse([chunk('hi', 'stop')]));

    const serialized = JSON.stringify(await collect(provider(fetchFn)));

    expect(serialized).not.toContain('api.meta.ai');
    expect(serialized).not.toContain(API_KEY);
  });
});
