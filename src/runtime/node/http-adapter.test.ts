// @vitest-environment node
import { connect } from 'node:net';
import type { Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  createNodeHttpServer,
  type NodeHttpServerOptions,
  type WebFetchApp,
} from './http-adapter';

interface ListeningServer {
  readonly url: string;
  readonly port: number;
  readonly server: Server;
  close(): Promise<void>;
}

async function listen(
  app: WebFetchApp,
  options: Partial<NodeHttpServerOptions> = {},
): Promise<ListeningServer> {
  const server = createNodeHttpServer(app, {
    requestTimeoutMs: 5_000,
    keepAliveTimeoutMs: 5_000,
    ...options,
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address !== 'object') {
    throw new Error('test server did not bind');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    server,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function rawRequest(port: number, payload: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(payload);
    });
    let received = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      received += chunk;
    });
    socket.on('end', () => resolve(received));
    socket.on('error', reject);
  });
}

function echoApp(): WebFetchApp {
  return {
    async fetch(request) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: { 'access-control-max-age': '600' },
        });
      }
      if (request.method === 'HEAD') {
        return new Response(null, { status: 200 });
      }
      if (new URL(request.url).pathname === '/no-content') {
        return new Response(null, { status: 204 });
      }
      if (new URL(request.url).pathname === '/cookies') {
        const headers = new Headers({ 'content-type': 'application/json' });
        headers.append('set-cookie', 'first=1; Path=/');
        headers.append('set-cookie', 'second=2; Path=/; HttpOnly');
        return new Response('{"ok":true}', { status: 200, headers });
      }
      if (new URL(request.url).pathname === '/cached') {
        return new Response('cached', {
          status: 200,
          headers: { 'cache-control': 'max-age=60' },
        });
      }
      if (new URL(request.url).pathname === '/stream') {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            for (const part of ['chunk-1|', 'chunk-2|', 'chunk-3']) {
              controller.enqueue(encoder.encode(part));
            }
            controller.close();
          },
        });
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (new URL(request.url).pathname === '/headers') {
        return Response.json({
          host: request.headers.get('host'),
          authorization: request.headers.get('authorization'),
          repeated: request.headers.get('x-repeated'),
        });
      }
      const body = request.body === null ? '' : await request.text();
      return Response.json(
        { method: request.method, path: new URL(request.url).pathname, body },
      );
    },
  };
}

describe('node http transport', () => {
  it('serves a response and pins transport hardening headers', async () => {
    const listening = await listen(echoApp());
    try {
      const response = await fetch(`${listening.url}/today`, {
        headers: { authorization: 'Bearer token-value' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');

      const body = (await response.json()) as {
        method: string;
        path: string;
        body: string;
      };
      expect(body).toEqual({ method: 'GET', path: '/today', body: '' });
    } finally {
      await listening.close();
    }
  });

  it('never overwrites an application-supplied cache policy', async () => {
    const listening = await listen(echoApp());
    try {
      const response = await fetch(`${listening.url}/cached`);
      expect(response.headers.get('cache-control')).toBe('max-age=60');
    } finally {
      await listening.close();
    }
  });

  it('leaves CORS preflight caching untouched', async () => {
    const listening = await listen(echoApp());
    try {
      const response = await fetch(`${listening.url}/today`, {
        method: 'OPTIONS',
      });
      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-max-age')).toBe('600');
      expect(response.headers.get('cache-control')).toBeNull();
    } finally {
      await listening.close();
    }
  });

  it('delivers request bodies and headers to the application intact', async () => {
    const listening = await listen(echoApp());
    try {
      const payload = JSON.stringify({ mutation: { mutationId: 'MUT-1' } });
      const response = await fetch(`${listening.url}/tasks`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer token-value',
          'x-repeated': 'first',
        },
        body: payload,
      });
      const body = (await response.json()) as {
        method: string;
        path: string;
        body: string;
      };
      expect(body.method).toBe('POST');
      expect(body.path).toBe('/tasks');
      expect(body.body).toBe(payload);

      const headerEcho = await fetch(`${listening.url}/headers`, {
        headers: { authorization: 'Bearer token-value' },
      });
      const seen = (await headerEcho.json()) as Record<string, string | null>;
      expect(seen['authorization']).toBe('Bearer token-value');
      expect(seen['host']).toBe(`127.0.0.1:${listening.port}`);
    } finally {
      await listening.close();
    }
  });

  it('streams a multi-chunk response body completely', async () => {
    const listening = await listen(echoApp());
    try {
      const response = await fetch(`${listening.url}/stream`);
      expect(await response.text()).toBe('chunk-1|chunk-2|chunk-3');
    } finally {
      await listening.close();
    }
  });

  it('preserves repeated Set-Cookie values instead of joining them', async () => {
    const listening = await listen(echoApp());
    try {
      const response = await fetch(`${listening.url}/cookies`);
      expect(response.headers.getSetCookie()).toEqual([
        'first=1; Path=/',
        'second=2; Path=/; HttpOnly',
      ]);
    } finally {
      await listening.close();
    }
  });

  it('emits no body for HEAD and bodyless statuses', async () => {
    const listening = await listen(echoApp());
    try {
      const head = await fetch(`${listening.url}/today`, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');

      const noContent = await fetch(`${listening.url}/no-content`);
      expect(noContent.status).toBe(204);
      expect(await noContent.text()).toBe('');
    } finally {
      await listening.close();
    }
  });

  it('answers a malformed host header with the JSON error envelope', async () => {
    const listening = await listen(echoApp());
    try {
      const raw = await rawRequest(
        listening.port,
        'GET /today HTTP/1.1\r\nHost: exa mple.com\r\nConnection: close\r\n\r\n',
      );
      expect(raw).toContain('HTTP/1.1 400');
      expect(raw).toContain('"code":"INVALID_REQUEST"');
      expect(raw).toContain('"message":"Malformed request"');
      expect(raw).not.toContain('exa mple.com');
    } finally {
      await listening.close();
    }
  });

  it('answers an over-long request target with the JSON error envelope', async () => {
    const listening = await listen(echoApp());
    try {
      const raw = await rawRequest(
        listening.port,
        `GET /${'a'.repeat(9_000)} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`,
      );
      expect(raw).toContain('HTTP/1.1 400');
      expect(raw).toContain('"code":"INVALID_REQUEST"');
    } finally {
      await listening.close();
    }
  });

  it('maps an application transport failure to a generic 500', async () => {
    const failures: unknown[] = [];
    const listening = await listen(
      {
        fetch: () => {
          throw new Error('postgresql://elara:sup3r@db.example.com/elara died');
        },
      },
      { onTransportError: (error) => failures.push(error) },
    );
    try {
      const response = await fetch(`${listening.url}/today`);
      expect(response.status).toBe(500);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const body = (await response.json()) as {
        error: { code: string; message: string };
      };
      expect(body.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Unexpected server error',
      });
      expect(failures).toHaveLength(1);
    } finally {
      await listening.close();
    }
  });

  it('closes a socket whose request body was never consumed', async () => {
    // The API answers 401 before reading a write body, so the transport must
    // refuse to reuse that connection: unread inbound bytes would otherwise
    // be parsed as the next request and pin the socket until request timeout.
    const listening = await listen({
      fetch: (request) =>
        request.method === 'POST'
          ? Promise.resolve(
              Response.json(
                { error: { code: 'UNAUTHENTICATED' } },
                { status: 401 },
              ),
            )
          : Promise.resolve(Response.json({ ok: true })),
    });

    try {
      const refused = await fetch(`${listening.url}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ padding: 'x'.repeat(200_000) }),
      });
      expect(refused.status).toBe(401);
      expect(refused.headers.get('connection')).toBe('close');

      const reused = await fetch(`${listening.url}/health`);
      expect(reused.headers.get('connection')).not.toBe('close');

      // Draining must not wait for the request timeout.
      const started = Date.now();
      await listening.close();
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      await listening.close();
    }
  });

  it('applies explicit socket budgets rather than inherited defaults', async () => {
    const listening = await listen(echoApp(), {
      requestTimeoutMs: 12_000,
      keepAliveTimeoutMs: 70_000,
    });
    try {
      expect(listening.server.requestTimeout).toBe(12_000);
      expect(listening.server.headersTimeout).toBe(13_000);
      expect(listening.server.keepAliveTimeout).toBe(70_000);
      expect(listening.server.maxHeadersCount).toBe(100);
    } finally {
      await listening.close();
    }
  });
});
