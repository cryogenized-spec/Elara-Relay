import { describe, expect, it } from 'vitest';

import { ChatProviderFault } from './chat-provider';
import {
  CHAT_ERROR_BODY_LIMIT_BYTES,
  readProviderEvents,
  streamProviderEvents,
  type ProviderServerSentEvent,
} from './chat-http';

const encoder = new TextEncoder();

function streamOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
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

/** A provider stream that never produces a terminal event. */
function hangingStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull: () => new Promise<void>(() => undefined),
  });
}

async function collectEvents(
  body: ReadableStream<Uint8Array>,
  maxEventCharacters?: number,
): Promise<ProviderServerSentEvent[]> {
  const events: ProviderServerSentEvent[] = [];
  const signal = new AbortController().signal;
  const generator =
    maxEventCharacters === undefined
      ? readProviderEvents(body, signal)
      : readProviderEvents(body, signal, maxEventCharacters);
  for await (const event of generator) events.push(event);
  return events;
}

async function faultFrom(
  generator: AsyncGenerator<ProviderServerSentEvent>,
): Promise<ChatProviderFault> {
  try {
    for await (const _event of generator) {
      // Consume until the generator fails.
    }
  } catch (error: unknown) {
    if (error instanceof ChatProviderFault) return error;
    throw error;
  }
  throw new Error('expected the provider stream to fail');
}

describe('provider event stream parsing', () => {
  it('parses named events, multi-line data and CRLF framing', async () => {
    const events = await collectEvents(
      streamOf([
        ':heartbeat\r\n',
        'event: response.output_text.delta\r\n',
        'data: {"type":"response.output_text.delta",\r\n',
        'data: "delta":"Hi"}\r\n',
        '\r\n',
        'data: [DONE]\r\n\r\n',
      ]),
    );

    expect(events).toEqual([
      {
        event: 'response.output_text.delta',
        data: '{"type":"response.output_text.delta",\n"delta":"Hi"}',
      },
      { event: undefined, data: '[DONE]' },
    ]);
  });

  it('reassembles events split across transport chunks', async () => {
    const events = await collectEvents(
      streamOf(['data: {"a"', ':1}\n\n', 'data: two\n\n']),
    );

    expect(events).toEqual([
      { event: undefined, data: '{"a":1}' },
      { event: undefined, data: 'two' },
    ]);
  });

  it('dispatches a final event that lacks a trailing blank line', async () => {
    const events = await collectEvents(streamOf(['data: {"type":"completed"}']));

    expect(events).toEqual([
      { event: undefined, data: '{"type":"completed"}' },
    ]);
  });

  it('fails closed instead of buffering an unbounded event', async () => {
    const oversized = `data: ${'x'.repeat(64)}\n\n`;

    await expect(
      collectEvents(streamOf([oversized, oversized]), 16),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'INVALID_RESPONSE' }),
    );
  });

  it('cancels the upstream body when the consumer stops reading', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: one\n\n'));
        controller.enqueue(encoder.encode('data: two\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });

    for await (const event of readProviderEvents(
      body,
      new AbortController().signal,
    )) {
      expect(event.data).toBe('one');
      break;
    }

    expect(cancelled).toBe(true);
  });
});

describe('provider HTTP transport', () => {
  it('rejects immediately when the caller already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    let called = false;
    const fetchFn: typeof fetch = () => {
      called = true;
      return Promise.resolve(new Response(''));
    };

    const fault = await faultFrom(
      streamProviderEvents(
        {
          url: 'https://provider.example/v1/responses',
          apiKey: 'server-only-key',
          body: {},
          requestTimeoutMs: 1_000,
          fetchFn,
        },
        controller.signal,
      ),
    );

    expect(fault.code).toBe('CANCELLED');
    expect(called).toBe(false);
  });

  it('reports only the status for an error response and bounds the body', async () => {
    const secret = `sk-proj-${'a'.repeat(60)}`;
    const payload = `${secret} `.repeat(2_000);
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads += 1;
        if (reads > 500) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(payload.slice(0, 256)));
      },
    });

    const fault = await faultFrom(
      streamProviderEvents(
        {
          url: 'https://provider.example/v1/responses',
          apiKey: 'server-only-key',
          body: {},
          requestTimeoutMs: 1_000,
          fetchFn: () => Promise.resolve(new Response(body, { status: 401 })),
        },
        new AbortController().signal,
      ),
    );

    expect(fault.code).toBe('HTTP');
    expect(fault.status).toBe(401);
    expect(fault.message).not.toContain(secret);
    expect(fault.message).toBe('Chat provider HTTP (401)');
    // The body is drained only up to the reviewed bound, then cancelled.
    expect(reads * 256).toBeLessThanOrEqual(CHAT_ERROR_BODY_LIMIT_BYTES + 256);
  });

  it('bounds a provider request with a timeout', async () => {
    const fetchFn: typeof fetch = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('provider request aborted'));
        });
      });

    const fault = await faultFrom(
      streamProviderEvents(
        {
          url: 'https://provider.example/v1/responses',
          apiKey: 'server-only-key',
          body: {},
          requestTimeoutMs: 25,
          fetchFn,
        },
        new AbortController().signal,
      ),
    );

    expect(fault.code).toBe('TIMEOUT');
  });

  it('sanitizes a transport failure into a network fault', async () => {
    const fault = await faultFrom(
      streamProviderEvents(
        {
          url: 'https://provider.example/v1/responses',
          apiKey: 'server-only-key',
          body: {},
          requestTimeoutMs: 1_000,
          fetchFn: () =>
            Promise.reject(
              new Error('connect ECONNREFUSED https://provider.example'),
            ),
        },
        new AbortController().signal,
      ),
    );

    expect(fault.code).toBe('NETWORK');
    expect(fault.message).toBe('Chat provider NETWORK');
  });

  it('distinguishes caller cancellation from a provider outage', async () => {
    const controller = new AbortController();
    let upstreamAborted = false;
    const fetchFn: typeof fetch = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          upstreamAborted = true;
          reject(new Error('client disconnected'));
        });
      });

    const generator = streamProviderEvents(
      {
        url: 'https://provider.example/v1/responses',
        apiKey: 'server-only-key',
        body: {},
        requestTimeoutMs: 60_000,
        fetchFn,
      },
      controller.signal,
    );
    const pending = faultFrom(generator);
    controller.abort();

    expect((await pending).code).toBe('CANCELLED');
    expect(upstreamAborted).toBe(true);
  });

  it('fails closed when a streamed response has no body', async () => {
    const fault = await faultFrom(
      streamProviderEvents(
        {
          url: 'https://provider.example/v1/responses',
          apiKey: 'server-only-key',
          body: {},
          requestTimeoutMs: 1_000,
          // 204 responses carry no body.
          fetchFn: () => Promise.resolve(new Response(null, { status: 204 })),
        },
        new AbortController().signal,
      ),
    );

    expect(fault.code).toBe('INVALID_RESPONSE');
  });

  it('maps a stalled stream to the request timeout', async () => {
    const fault = await faultFrom(
      streamProviderEvents(
        {
          url: 'https://provider.example/v1/chat/completions',
          apiKey: 'server-only-key',
          body: {},
          requestTimeoutMs: 25,
          fetchFn: () =>
            Promise.resolve(
              new Response(hangingStream(), {
                status: 200,
                headers: { 'content-type': 'text/event-stream' },
              }),
            ),
        },
        new AbortController().signal,
      ),
    );

    expect(fault.code).toBe('TIMEOUT');
  });
});
