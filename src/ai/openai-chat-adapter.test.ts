import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ChatModelUnavailableError,
  ChatProviderFault,
  type ChatGenerationRequest,
  type ChatProvider,
  type ChatStreamEvent,
} from './chat-provider';
import { OpenAiChatProvider } from './openai-chat-adapter';

/**
 * Deterministic adapter certification against mocked provider HTTP responses.
 * No live provider credential is required or used.
 */
const API_KEY = 'test-openai-adapter-key';
const BASE_URL = 'https://api.openai.com/v1';

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

function sseFrames(frames: readonly unknown[]): string[] {
  return frames.map(
    (frame) => `data: ${JSON.stringify(frame)}\n\n`,
  );
}

function sseResponse(frames: readonly unknown[]): Response {
  return new Response(eventStream(sseFrames(frames)), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function provider(
  fetchFn: typeof fetch,
  requestTimeoutMs = 5_000,
): ChatProvider {
  return new OpenAiChatProvider({
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    requestTimeoutMs,
    fetchFn,
  });
}

const request: ChatGenerationRequest = {
  model: { providerId: 'openai', modelId: 'gpt-6-luna' },
  messages: [
    { role: 'system', content: 'You are Elara.' },
    { role: 'user', content: 'Summarize today.' },
  ],
  maxOutputTokens: 256,
  temperature: 0.2,
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

function requestBodyOf(call: CapturedRequest | undefined): Record<string, unknown> {
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

describe('OpenAI chat adapter', () => {
  it('normalizes Responses streaming events and reports usage', async () => {
    const { fetchFn, calls } = capture(() =>
      sseResponse([
        { type: 'response.created', response: { id: 'resp_1', model: 'gpt-6-luna' } },
        { type: 'response.reasoning_summary_text.delta', delta: 'thinking' },
        { type: 'response.output_text.delta', delta: 'Kia ' },
        { type: 'response.output_text.delta', delta: 'ora' },
        { type: 'response.output_text.annotation.added', annotation: {} },
        { type: 'response.output_text.delta', delta: '' },
        {
          type: 'response.completed',
          response: {
            usage: {
              input_tokens: 12,
              output_tokens: 4,
              total_tokens: 16,
              output_tokens_details: { reasoning_tokens: 2 },
            },
            output: [{ content: [{ text: 'Kia ora' }] }],
          },
        },
      ]),
    );

    const events = await collect(provider(fetchFn));

    expect(events).toEqual([
      { type: 'text-delta', text: 'Kia ' },
      { type: 'text-delta', text: 'ora' },
      { type: 'completed', usage: { inputTokens: 12, outputTokens: 4 } },
    ]);

    // Only provider-neutral fields may leave the adapter boundary.
    expect(Object.keys(events[0] ?? {}).sort()).toEqual(['text', 'type']);
    expect(Object.keys(events[2] ?? {}).sort()).toEqual(['type', 'usage']);
    expect(JSON.stringify(events)).not.toContain('resp_1');
    expect(JSON.stringify(events)).not.toContain('reasoning');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/responses`);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(headerValue(calls[0], 'authorization')).toBe(`Bearer ${API_KEY}`);
    expect(headerValue(calls[0], 'accept')).toBe('text/event-stream');

    const body = requestBodyOf(calls[0]);
    expect(body['model']).toBe('gpt-6-luna');
    expect(body['stream']).toBe(true);
    // Elara owns conversation state: OpenAI must not retain the response.
    expect(body['store']).toBe(false);
    expect(body['max_output_tokens']).toBe(256);
    // gpt-6-luna rejects temperature, so the adapter never forwards it.
    expect(Object.hasOwn(body, 'temperature')).toBe(false);
    expect(body['input']).toEqual([
      { role: 'system', content: 'You are Elara.' },
      { role: 'user', content: 'Summarize today.' },
    ]);
    expect(JSON.stringify(body)).not.toContain(API_KEY);
  });

  it('omits optional parameters the caller did not supply', async () => {
    const { fetchFn, calls } = capture(() =>
      sseResponse([
        { type: 'response.output_text.delta', delta: 'Hi' },
        { type: 'response.completed', response: { usage: null } },
      ]),
    );

    const minimal: ChatGenerationRequest = {
      model: { providerId: 'openai', modelId: 'gpt-6-luna' },
      messages: [{ role: 'user', content: 'Hello' }],
    };
    const events = await collect(provider(fetchFn), minimal);

    expect(events).toEqual([
      { type: 'text-delta', text: 'Hi' },
      { type: 'completed' },
    ]);
    const body = requestBodyOf(calls[0]);
    expect(Object.hasOwn(body, 'max_output_tokens')).toBe(false);
    expect(Object.hasOwn(body, 'temperature')).toBe(false);
  });

  it('fails closed for another provider or an unknown model without calling the provider', async () => {
    const { fetchFn, calls } = capture(() => sseResponse([]));
    const instance = provider(fetchFn);

    const museRequest: ChatGenerationRequest = {
      model: { providerId: 'muse', modelId: 'muse-spark-1.3-contributor' },
      messages: [{ role: 'user', content: 'Hello' }],
    };
    const unknownRequest: ChatGenerationRequest = {
      model: { providerId: 'openai', modelId: 'gpt-9-unreleased' },
      messages: [{ role: 'user', content: 'Hello' }],
    };

    await expect(collect(instance, museRequest)).rejects.toThrow(
      ChatModelUnavailableError,
    );
    await expect(collect(instance, unknownRequest)).rejects.toThrow(
      ChatModelUnavailableError,
    );
    expect(calls).toHaveLength(0);
  });

  it('maps provider HTTP failures to a sanitized fault', async () => {
    const providerMessage = `insufficient_quota for key ${API_KEY}`;
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
    expect(fault.message).not.toContain('insufficient_quota');
  });

  it('fails closed on terminal provider failure events', async () => {
    const { fetchFn } = capture(() =>
      sseResponse([
        { type: 'response.output_text.delta', delta: 'partial' },
        {
          type: 'response.failed',
          response: {
            status: 'failed',
            error: { code: 'server_error', message: `upstream ${API_KEY}` },
          },
        },
      ]),
    );

    const fault = await faultFrom(provider(fetchFn));

    expect(fault.code).toBe('PROVIDER_FAILURE');
    expect(fault.message).toBe('Chat provider PROVIDER_FAILURE');
    expect(fault.message).not.toContain(API_KEY);
  });

  it('fails closed on an incomplete generation', async () => {
    const { fetchFn } = capture(() =>
      sseResponse([
        { type: 'response.output_text.delta', delta: 'partial' },
        {
          type: 'response.incomplete',
          response: { incomplete_details: { reason: 'max_output_tokens' } },
        },
      ]),
    );

    // Output-limit termination is incomplete, never a completed answer.
    expect((await faultFrom(provider(fetchFn))).code).toBe('INCOMPLETE');
  });

  it('maps content-policy termination to a deliberate content-filter fault', async () => {
    const { fetchFn } = capture(() =>
      sseResponse([
        { type: 'response.output_text.delta', delta: 'partial' },
        {
          type: 'response.incomplete',
          response: { incomplete_details: { reason: 'content_filter' } },
        },
      ]),
    );

    expect((await faultFrom(provider(fetchFn))).code).toBe('CONTENT_FILTERED');
  });

  it('surfaces provider refusal text instead of discarding it', async () => {
    const { fetchFn } = capture(() =>
      sseResponse([
        { type: 'response.created', response: { id: 'resp_2' } },
        { type: 'response.refusal.delta', delta: "I can't help " },
        { type: 'response.refusal.delta', delta: 'with that.' },
        {
          type: 'response.refusal.done',
          refusal: "I can't help with that.",
        },
        { type: 'response.completed', response: { usage: { input_tokens: 8 } } },
      ]),
    );

    const events = await collect(provider(fetchFn));

    expect(events).toEqual([
      { type: 'text-delta', text: "I can't help " },
      { type: 'text-delta', text: 'with that.' },
      { type: 'completed', usage: { inputTokens: 8 } },
    ]);
    // No duplicate text and no provider event shape leaking through.
    expect(Object.keys(events[2] ?? {}).sort()).toEqual(['type', 'usage']);
  });

  it('surfaces a refusal that only arrives as a completed refusal event', async () => {
    const { fetchFn } = capture(() =>
      sseResponse([
        {
          type: 'response.refusal.done',
          refusal: 'I cannot assist with that request.',
        },
        { type: 'response.completed', response: { usage: null } },
      ]),
    );

    expect(await collect(provider(fetchFn))).toEqual([
      { type: 'text-delta', text: 'I cannot assist with that request.' },
      { type: 'completed' },
    ]);
  });

  it('fails closed when a completed generation carried no assistant text', async () => {
    const { fetchFn } = capture(() =>
      sseResponse([
        { type: 'response.created', response: { id: 'resp_3' } },
        { type: 'response.completed', response: { usage: { input_tokens: 4 } } },
      ]),
    );

    expect((await faultFrom(provider(fetchFn))).code).toBe('INVALID_RESPONSE');
  });

  it('fails closed when a stream ends without completion', async () => {
    const { fetchFn } = capture(() =>
      sseResponse([{ type: 'response.output_text.delta', delta: 'partial' }]),
    );

    expect((await faultFrom(provider(fetchFn))).code).toBe('INVALID_RESPONSE');
  });

  it('fails closed on a malformed delta or unparseable event', async () => {
    const malformedDelta = capture(() =>
      sseResponse([{ type: 'response.output_text.delta', delta: 7 }]),
    );
    const unparseable = capture(
      () =>
        new Response(eventStream(['data: not-json\n\n']), {
          status: 200,
        }),
    );

    expect((await faultFrom(provider(malformedDelta.fetchFn))).code).toBe(
      'INVALID_RESPONSE',
    );
    expect((await faultFrom(provider(unparseable.fetchFn))).code).toBe(
      'INVALID_RESPONSE',
    );
  });

  it('propagates caller cancellation to the provider request', async () => {
    const controller = new AbortController();
    let upstreamAborted = false;
    const { fetchFn } = capture(() => {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(streamController) {
            streamController.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'response.output_text.delta',
                  delta: 'partial',
                })}\n\n`,
              ),
            );
          },
          cancel() {
            upstreamAborted = true;
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    });

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

    const fault = await faultFrom(provider(fetchFn, 25));

    expect(fault.code).toBe('TIMEOUT');
  });

  it('contains no provider-specific configuration in normalized events', async () => {
    const { fetchFn } = capture(() =>
      sseResponse([
        { type: 'response.output_text.delta', delta: 'hi' },
        { type: 'response.completed', response: { usage: null } },
      ]),
    );

    const events = await collect(provider(fetchFn));
    const serialized = JSON.stringify(events);

    expect(serialized).not.toContain('openai.com');
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain('muse');
  });
});
