import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

/**
 * Node HTTP transport for the Hono Operations API.
 *
 * This adapter owns transport concerns only — socket timeouts, request
 * translation, response streaming, and transport hardening headers. Routing,
 * authentication, CORS, body caps, validation, and error envelopes stay in
 * `src/api/app.ts`, which remains the single HTTP route authority for both
 * in-process tests and the deployed server.
 *
 * No static browser assets are served here: the GitHub Pages frontend and
 * this privileged API are separate deployment planes.
 */

/**
 * Structural view of the API surface the transport depends on.
 *
 * Hono may answer synchronously, so the union is required; the adapter always
 * awaits it.
 */
export interface WebFetchApp {
  fetch(request: Request): Response | Promise<Response>;
}

export interface NodeHttpServerOptions {
  /** Whole-request socket timeout, bounding slow headers and slow bodies. */
  readonly requestTimeoutMs: number;
  /** Idle keep-alive timeout; align with the terminating gateway. */
  readonly keepAliveTimeoutMs: number;
  /** Transport-level failure hook; receives already-sanitizable errors. */
  readonly onTransportError?: ((error: unknown) => void) | undefined;
}

const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const MAX_URL_LENGTH = 8_192;
const MAX_HOST_HEADER_LENGTH = 253;
const MAX_HEADERS_COUNT = 100;
// Node reads headers before the request clock starts, so the header budget is
// derived from (and always larger than) the whole-request budget.
const HEADERS_TIMEOUT_MARGIN_MS = 1_000;
const BODYLESS_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);
const BODYLESS_STATUSES: ReadonlySet<number> = new Set([204, 304]);

/**
 * Transport hardening applied to every non-preflight response.
 *
 * `no-store` keeps authenticated operational payloads out of shared
 * intermediary caches; `nosniff` stops a browser reinterpreting a JSON body.
 * Preflight responses are left untouched so CORS `Access-Control-Max-Age`
 * preflight caching still works.
 */
const TRANSPORT_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['cache-control', 'no-store'],
  ['x-content-type-options', 'nosniff'],
];

function toBodyStream(message: IncomingMessage): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let settled = false;

      const close = (): void => {
        if (settled) return;
        settled = true;
        controller.close();
      };
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        controller.error(error);
      };

      message.on('data', (chunk: Buffer) => {
        if (settled) return;
        // Copy: the pooled parser buffer must not be handed to the stream.
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          settled = true;
        }
      });
      message.on('end', close);
      message.on('error', fail);
      message.on('aborted', () => fail(new Error('request body aborted')));
      message.on('close', () => {
        if (!message.complete) {
          fail(new Error('connection closed before the request body ended'));
        }
      });
    },
    cancel() {
      message.destroy();
    },
  });
}

/**
 * Translate a Node request into a Web `Request`.
 *
 * Returns `null` for anything malformed so the transport answers 400 instead
 * of throwing inside the socket handler. The scheme is fixed to `http` because
 * TLS terminates at the deployment gateway; no route in Elara branches on it.
 */
function toWebRequest(message: IncomingMessage): Request | null {
  const method = message.method;
  const target = message.url;
  const host = message.headers.host;

  if (typeof method !== 'string' || !HTTP_TOKEN.test(method)) return null;
  if (typeof target !== 'string' || target === '' || target.length > MAX_URL_LENGTH) {
    return null;
  }
  if (
    typeof host !== 'string' ||
    host === '' ||
    host.length > MAX_HOST_HEADER_LENGTH ||
    /[\s/@]/.test(host)
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(target, `http://${host}`);
  } catch {
    return null;
  }

  const headers = new Headers();
  try {
    for (const [name, value] of Object.entries(message.headers)) {
      if (value === undefined) continue;
      headers.append(name, Array.isArray(value) ? value.join(', ') : value);
    }
  } catch {
    return null;
  }

  // The DOM `RequestInit` type predates the streaming-body `duplex` field, so
  // the intersection keeps the literal fully typed without a cast to `any`.
  const init: RequestInit & { duplex: 'half' } = {
    method,
    headers,
    body: BODYLESS_METHODS.has(method.toUpperCase())
      ? null
      : toBodyStream(message),
    duplex: 'half',
  };

  try {
    return new Request(url.toString(), init);
  } catch {
    return null;
  }
}

function sendTransportError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  if (response.headersSent || response.writableEnded) {
    response.destroy();
    return;
  }
  const body = JSON.stringify({ error: { code, message } });
  response.setHeader('content-type', 'application/json; charset=UTF-8');
  response.setHeader('content-length', String(Buffer.byteLength(body)));
  for (const [name, value] of TRANSPORT_HEADERS) {
    response.setHeader(name, value);
  }
  response.writeHead(status);
  response.end(body);
}

function applyResponseHeaders(
  headers: Headers,
  response: ServerResponse,
  method: string,
): void {
  // `Headers#forEach` joins repeated Set-Cookie values, which would corrupt
  // them, so cookies are written from `getSetCookie()` instead.
  const cookies = headers.getSetCookie();
  headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie') return;
    response.setHeader(name, value);
  });
  if (cookies.length > 0) {
    response.setHeader('set-cookie', cookies);
  }
  if (method === 'OPTIONS') return;
  for (const [name, value] of TRANSPORT_HEADERS) {
    if (!headers.has(name)) response.setHeader(name, value);
  }
}

/** Stream a Web response body with backpressure and abort awareness. */
async function writeResponseBody(
  body: ReadableStream<Uint8Array>,
  response: ServerResponse,
): Promise<void> {
  const reader = body.getReader();
  let aborted = false;
  const onClose = (): void => {
    aborted = true;
  };
  response.on('close', onClose);

  try {
    for (;;) {
      if (aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined || value.byteLength === 0) continue;
      if (!response.write(value)) {
        await Promise.race([
          once(response, 'drain'),
          once(response, 'close'),
        ]).catch(() => undefined);
      }
    }
    if (aborted) {
      await reader.cancel().catch(() => undefined);
      return;
    }
    response.end();
  } catch {
    await reader.cancel().catch(() => undefined);
    response.destroy();
  } finally {
    response.off('close', onClose);
  }
}

async function handleRequest(
  app: WebFetchApp,
  message: IncomingMessage,
  response: ServerResponse,
  options: NodeHttpServerOptions,
): Promise<void> {
  const method = typeof message.method === 'string' ? message.method : 'GET';
  const request = toWebRequest(message);
  if (request === null) {
    sendTransportError(
      response,
      400,
      'INVALID_REQUEST',
      'Malformed request',
    );
    return;
  }

  let webResponse: Response;
  try {
    webResponse = await app.fetch(request);
  } catch (error) {
    options.onTransportError?.(error);
    sendTransportError(
      response,
      500,
      'INTERNAL_ERROR',
      'Unexpected server error',
    );
    return;
  }

  // Authentication runs before body parsing, so a response can be produced
  // while the client is still uploading. Such a socket can never be reused:
  // unread inbound bytes would be misread as the next keep-alive request, and
  // leaving it pinned would stall graceful shutdown until the request timeout.
  const socketReusable =
    BODYLESS_METHODS.has(method.toUpperCase()) || message.complete;

  try {
    applyResponseHeaders(webResponse.headers, response, method);
    if (!socketReusable) response.setHeader('connection', 'close');
    response.writeHead(webResponse.status);
    if (
      webResponse.body === null ||
      method === 'HEAD' ||
      BODYLESS_STATUSES.has(webResponse.status)
    ) {
      response.end();
      return;
    }
    await writeResponseBody(webResponse.body, response);
  } finally {
    if (!socketReusable) message.resume();
  }
}

/**
 * Create a hardened Node HTTP server for the Operations API.
 *
 * Socket budgets are explicit rather than inherited: an unfinished request
 * cannot hold a connection open indefinitely, and header floods are bounded.
 */
export function createNodeHttpServer(
  app: WebFetchApp,
  options: NodeHttpServerOptions,
): Server {
  const server = createServer((message, response) => {
    handleRequest(app, message, response, options).catch((error: unknown) => {
      options.onTransportError?.(error);
      sendTransportError(
        response,
        500,
        'INTERNAL_ERROR',
        'Unexpected server error',
      );
    });
  });

  server.requestTimeout = options.requestTimeoutMs;
  server.headersTimeout = options.requestTimeoutMs + HEADERS_TIMEOUT_MARGIN_MS;
  server.keepAliveTimeout = options.keepAliveTimeoutMs;
  server.maxHeadersCount = MAX_HEADERS_COUNT;

  return server;
}
