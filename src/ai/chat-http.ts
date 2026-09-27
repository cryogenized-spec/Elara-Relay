/**
 * Narrow server-side HTTP/SSE transport shared by the concrete chat provider
 * adapters.
 *
 * This module implements only what the `ChatProvider` boundary needs: one
 * bounded JSON request, provider-agnostic server-sent event parsing, caller
 * cancellation through `AbortSignal`, a bounded overall request budget and
 * sanitized typed faults. It imports no provider SDK, uses the runtime's
 * native `fetch` (Node 24), and never surfaces a provider error body, header,
 * URL or credential.
 */
import { ChatProviderFault } from './chat-provider';

/**
 * Error responses are never parsed, logged or surfaced. They are drained to at
 * most this many bytes so the socket can be released, then cancelled.
 */
export const CHAT_ERROR_BODY_LIMIT_BYTES = 4_096;

/**
 * A single provider event may not exceed this many characters. Provider output
 * is streamed, never accumulated, so provider-controlled buffering stays
 * bounded even if a stream never ends.
 */
export const CHAT_EVENT_LIMIT_CHARACTERS = 512 * 1_024;

export interface ProviderServerSentEvent {
  readonly event: string | undefined;
  readonly data: string;
}

export interface ChatProviderHttpRequest {
  /** Exact provider endpoint. Origins are validated by runtime configuration. */
  readonly url: string;
  /** Server-only credential. Never logged, never echoed into events. */
  readonly apiKey: string;
  readonly body: unknown;
  /** Overall bound for connect, response headers and the full stream. */
  readonly requestTimeoutMs: number;
  readonly fetchFn?: typeof fetch;
}

interface EventFrameState {
  event: string | undefined;
  dataLines: string[];
  dataCharacters: number;
}

/**
 * Internal sentinel raised when cancellation or the request timeout interrupts
 * a pending body read. The transport boundary classifies it into a normalized
 * fault, so it never escapes as a provider detail.
 */
class ProviderStreamInterruptedError extends Error {
  public constructor() {
    super('provider stream interrupted');
    this.name = 'ProviderStreamInterruptedError';
  }
}

/**
 * Read the next body chunk, interrupted promptly by the combined caller
 * cancellation / request timeout signal even if the provider socket stalls.
 */
async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) throw new ProviderStreamInterruptedError();

  return await new Promise<ReadableStreamReadResult<Uint8Array>>(
    (resolve, reject) => {
      const onAbort = (): void => {
        reject(new ProviderStreamInterruptedError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
      reader.read().then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', onAbort);
      });
    },
  );
}

/**
 * Apply one server-sent event line to the in-progress frame.
 *
 * Returns a completed event when the line terminated a frame. Unknown fields
 * are ignored, comments and heartbeats are dropped, and a frame that exceeds
 * the configured bound fails closed instead of buffering unbounded output.
 */
function applyEventLine(
  line: string,
  state: EventFrameState,
  maxEventCharacters: number,
): ProviderServerSentEvent | undefined {
  if (line === '') {
    if (state.dataLines.length === 0) {
      state.event = undefined;
      return undefined;
    }
    const completed: ProviderServerSentEvent = {
      event: state.event,
      data: state.dataLines.join('\n'),
    };
    state.event = undefined;
    state.dataLines = [];
    state.dataCharacters = 0;
    return completed;
  }

  if (line.startsWith(':')) return undefined;

  const separator = line.indexOf(':');
  const field = separator === -1 ? line : line.slice(0, separator);
  const rawValue = separator === -1 ? '' : line.slice(separator + 1);
  const fieldValue = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;

  if (field === 'event') {
    state.event = fieldValue;
  } else if (field === 'data') {
    // The joined event inserts one newline between each data field. Count that
    // separator as soon as another data line is accepted so empty data lines
    // cannot bypass the per-event memory bound.
    state.dataCharacters +=
      fieldValue.length + (state.dataLines.length === 0 ? 0 : 1);
    if (state.dataCharacters > maxEventCharacters) {
      throw new ChatProviderFault('INVALID_RESPONSE');
    }
    state.dataLines.push(fieldValue);
  }

  return undefined;
}

/**
 * Translate a transport failure into a sanitized fault.
 *
 * Caller cancellation is distinguished from the request timeout so that a
 * client disconnect is never reported as a provider outage.
 */
function classifyFailure(
  error: unknown,
  callerSignal: AbortSignal,
  timeoutSignal: AbortSignal,
): ChatProviderFault {
  if (error instanceof ChatProviderFault) return error;
  if (callerSignal.aborted) return new ChatProviderFault('CANCELLED');
  if (timeoutSignal.aborted) return new ChatProviderFault('TIMEOUT');
  return new ChatProviderFault('NETWORK');
}

/** Read and discard a bounded prefix of an error body, then cancel it. */
async function discardBoundedErrorBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<void> {
  if (body === null) return;
  const reader = body.getReader();
  let read = 0;
  try {
    while (read < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
    }
  } catch {
    // Draining an error body is best-effort; only the status is reported.
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * Parse a provider event stream into provider-neutral event frames.
 *
 * Handles multi-line `data:` fields, `event:` names, comments/heartbeats and
 * CRLF, per the server-sent events format used by OpenAI and Meta. The reader
 * is always cancelled, so abandoning the stream (cancellation, terminal event
 * or failure) releases the upstream connection.
 */
export async function* readProviderEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  maxEventCharacters: number = CHAT_EVENT_LIMIT_CHARACTERS,
): AsyncGenerator<ProviderServerSentEvent> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  const state: EventFrameState = {
    event: undefined,
    dataLines: [],
    dataCharacters: 0,
  };
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await readChunk(reader, signal);
      buffer +=
        done ? decoder.decode() : decoder.decode(value, { stream: true });

      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);

        const event = applyEventLine(line, state, maxEventCharacters);
        if (event !== undefined) yield event;

        newline = buffer.indexOf('\n');
      }

      if (buffer.length > maxEventCharacters) {
        throw new ChatProviderFault('INVALID_RESPONSE');
      }
      if (done) break;
    }

    // EOF is not an SSE event delimiter. Any trailing line or accumulated
    // frame that was not terminated by a blank line is incomplete and is
    // deliberately discarded rather than synthesized into a valid event.
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * Perform one chat generation request and stream provider events.
 *
 * The caller's `AbortSignal` is propagated to `fetch`, so a client disconnect
 * or server shutdown cancels the upstream generation. `requestTimeoutMs`
 * bounds the entire request, including the streamed response.
 */
export async function* streamProviderEvents(
  request: ChatProviderHttpRequest,
  signal: AbortSignal,
): AsyncGenerator<ProviderServerSentEvent> {
  if (signal.aborted) throw new ChatProviderFault('CANCELLED');

  const timeoutSignal = AbortSignal.timeout(request.requestTimeoutMs);
  const combinedSignal = AbortSignal.any([signal, timeoutSignal]);
  const fetchFn = request.fetchFn ?? fetch;

  let response: Response;
  try {
    response = await fetchFn(request.url, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify(request.body),
      signal: combinedSignal,
    });
  } catch (error: unknown) {
    throw classifyFailure(error, signal, timeoutSignal);
  }

  if (!response.ok) {
    await discardBoundedErrorBody(response.body, CHAT_ERROR_BODY_LIMIT_BYTES);
    throw new ChatProviderFault('HTTP', response.status);
  }
  if (response.body === null) {
    throw new ChatProviderFault('INVALID_RESPONSE');
  }

  try {
    yield* readProviderEvents(response.body, combinedSignal);
  } catch (error: unknown) {
    throw classifyFailure(error, signal, timeoutSignal);
  }
}
