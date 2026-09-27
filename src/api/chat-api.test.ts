import { describe, expect, it, vi } from 'vitest';
import type { AuthIdentity, AuthVerifier } from '../auth/auth-verifier';
import { AuthenticationError } from '../auth/errors';
import type { ChatProvider, ChatStreamEvent } from '../ai/chat-provider';
import { ChatTurnOrchestrator } from '../ai/chat-turn';
import {
  chatMessageSchema,
  chatThreadSchema,
  type ChatTurnEvent,
} from '../contracts/chat';
import { MemoryChatStore } from '../db/memory/chat-memory-store';
import { MemoryDomainStore } from '../db/memory/memory-store';
import { ChatKernel } from '../domain/chat-kernel';
import { DomainKernel } from '../domain/kernel';
import { createApi } from './app';
import { createChatApi } from './chat-api';

const ACCESS_TOKEN = 'header.payload.signature';
const OWNER: AuthIdentity = {
  userId: '60000000-0000-4000-8000-000000000001',
  sessionId: '60000000-0000-4000-8000-000000000002',
  email: 'owner@example.com',
  aal: 'aal1',
};
const INTRUDER: AuthIdentity = {
  userId: '60000000-0000-4000-8000-000000000003',
  sessionId: '60000000-0000-4000-8000-000000000004',
  email: 'other@example.com',
  aal: 'aal1',
};
const THREAD = '61000000-0000-4000-8000-000000000001';
const TURN = '62000000-0000-4000-8000-000000000001';
const LUNA = 'gpt-6-luna';

class TestAuthVerifier implements AuthVerifier {
  public constructor(
    private readonly identity: AuthIdentity = OWNER,
    private readonly token: string = ACCESS_TOKEN,
  ) {}

  public verify(accessToken: string): Promise<AuthIdentity> {
    if (accessToken !== this.token) throw new AuthenticationError();
    return Promise.resolve(this.identity);
  }
}

function provider(
  events: readonly ChatStreamEvent[],
  onRequest?: (request: { messages: readonly { content: string }[] }) => void,
): ChatProvider {
  return {
    providerId: 'openai',
    async *stream(request): AsyncIterable<ChatStreamEvent> {
      await Promise.resolve();
      onRequest?.({
        messages: request.messages.map((message) => ({
          content: message.content,
        })),
      });
      for (const event of events) yield event;
    },
  };
}

function makeRuntime(options?: {
  providers?: readonly ChatProvider[];
  identity?: AuthIdentity;
  token?: string;
}) {
  let tick = 0;
  let index = 0;
  const chatKernel = new ChatKernel(new MemoryChatStore(), {
    clock: () => {
      tick += 1;
      return new Date(Date.UTC(2026, 8, 27, 11, 0, tick)).toISOString();
    },
    idGenerator: () => {
      index += 1;
      return `63000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    },
  });
  const orchestrator = new ChatTurnOrchestrator(chatKernel, {
    providers: options?.providers ?? [],
  });
  const verifier = new TestAuthVerifier(
    options?.identity ?? OWNER,
    options?.token ?? ACCESS_TOKEN,
  );
  const app = createApi(new DomainKernel(new MemoryDomainStore()), verifier);
  app.route('/', createChatApi(chatKernel, orchestrator, verifier));
  // The same Chat surface without any operational route in front of it, so its
  // own authentication boundary is proven rather than inherited.
  const standalone = createApi();
  standalone.route('/', createChatApi(chatKernel, orchestrator, verifier));
  return { app, standalone, chatKernel, orchestrator };
}

function authorized(
  init: RequestInit = {},
  token = ACCESS_TOKEN,
): RequestInit {
  return {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  };
}

function json(
  app: ReturnType<typeof createApi>,
  path: string,
  method: string,
  body?: unknown,
  init: RequestInit = {},
) {
  return app.request(
    path,
    authorized(
      body === undefined ? { method, ...init } : {
        method,
        body: JSON.stringify(body),
        ...init,
      },
    ),
  );
}

function parseStream(text: string): { type: string; data: ChatTurnEvent }[] {
  return text
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const lines = block.split('\n');
      const type = lines
        .find((line) => line.startsWith('event: '))
        ?.slice('event: '.length);
      const data = lines
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice('data: '.length))
        .join('\n');
      return { type: type ?? '', data: JSON.parse(data) as ChatTurnEvent };
    });
}

async function createThread(
  app: ReturnType<typeof createApi>,
  threadId = THREAD,
  title: string | null = 'Avenge-X regulator',
) {
  const response = await json(app, '/chat/threads', 'POST', { threadId, title });
  expect(response.status).toBe(201);
  return chatThreadSchema.parse(await response.json());
}

describe('authenticated chat api', () => {
  it('fails closed on every chat route without a verified identity', async () => {
    const { app, standalone } = makeRuntime();

    for (const request of [
      { path: '/chat/models', method: 'GET' },
      { path: '/chat/threads', method: 'GET' },
      { path: `/chat/threads/${THREAD}`, method: 'GET' },
      { path: `/chat/threads/${THREAD}/turns`, method: 'POST' },
    ]) {
      for (const surface of [app, standalone]) {
        const response = await surface.request(request.path, {
          method: request.method,
        });
        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toBe('Bearer');
        await expect(response.json()).resolves.toEqual({
          error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
        });
      }
    }
  });

  it('keeps the public health probe public on the composed server', async () => {
    const { app } = makeRuntime();

    const health = await app.request('/health');

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({
      service: 'elara-relay',
      status: 'ok',
      schemaVersion: 1,
    });
  });

  it('rejects a chat request that carries a token the verifier refuses', async () => {
    const { app, standalone } = makeRuntime();

    for (const surface of [app, standalone]) {
      const response = await surface.request('/chat/threads', {
        method: 'GET',
        headers: { authorization: 'Bearer forged.token.value' },
      });
      expect(response.status).toBe(401);
    }
  });

  it('publishes the server-owned model catalog with local availability', async () => {
    const { app } = makeRuntime({ providers: [provider([])] });

    const response = await json(app, '/chat/models', 'GET');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      models: [
        { modelId: LUNA, providerId: 'openai', available: true },
        {
          modelId: 'muse-spark-1.3-contributor',
          providerId: 'muse',
          available: false,
        },
      ],
    });
  });

  it('creates, replays, and owner-scopes threads', async () => {
    const { app } = makeRuntime();

    const created = await createThread(app);
    expect(created.ownerId).toBe(OWNER.userId);
    expect(created.revision).toBe(1);

    const replay = await json(app, '/chat/threads', 'POST', {
      threadId: THREAD,
      title: 'Avenge-X regulator',
    });
    expect(replay.status).toBe(200);

    const conflict = await json(app, '/chat/threads', 'POST', {
      threadId: THREAD,
      title: 'Different title',
    });
    expect(conflict.status).toBe(409);

    const list = await json(app, '/chat/threads', 'GET');
    await expect(list.json()).resolves.toEqual({ threads: [created] });
  });

  it('rejects a browser-supplied owner identity', async () => {
    const { app } = makeRuntime();

    const response = await json(app, '/chat/threads', 'POST', {
      threadId: THREAD,
      title: null,
      ownerId: '60000000-0000-4000-8000-000000000003',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_REQUEST' },
    });
  });

  it('hides another owner thread from reads and turn creation', async () => {
    const owner = makeRuntime();
    await createThread(owner.app);

    const intruder = makeRuntime({ identity: INTRUDER });

    const list = await json(intruder.app, '/chat/threads', 'GET');
    await expect(list.json()).resolves.toEqual({ threads: [] });

    const detail = await json(intruder.app, `/chat/threads/${THREAD}`, 'GET');
    expect(detail.status).toBe(404);
    await expect(detail.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    });

    const turn = await json(
      intruder.app,
      `/chat/threads/${THREAD}/turns`,
      'POST',
      {
        turnId: TURN,
        modelId: LUNA,
        message: 'Where is the regulator?',
        expectedRevision: 1,
      },
    );
    expect(turn.status).toBe(404);
    await expect(owner.chatKernel.listThreads(INTRUDER.userId, 10)).resolves.toEqual(
      [],
    );
  });

  it('streams one turn and leaves the completed answer durable', async () => {
    const { app, chatKernel } = makeRuntime({
      providers: [
        provider([
          { type: 'text-delta', text: 'It is on ' },
          { type: 'text-delta', text: 'the repair shelf.' },
          { type: 'completed', usage: { inputTokens: 9, outputTokens: 4 } },
        ]),
      ],
    });
    await createThread(app);

    const response = await json(app, `/chat/threads/${THREAD}/turns`, 'POST', {
      turnId: TURN,
      modelId: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const events = parseStream(await response.text());
    expect(events.map((event) => event.type)).toEqual([
      'message.started',
      'message.delta',
      'message.delta',
      'message.completed',
    ]);
    expect(events[3]?.data).toMatchObject({
      type: 'message.completed',
      content: 'It is on the repair shelf.',
      threadRevision: 2,
      usage: { inputTokens: 9, outputTokens: 4 },
    });

    const detail = await json(app, `/chat/threads/${THREAD}`, 'GET');
    const body = (await detail.json()) as {
      thread: { revision: number };
      messages: unknown[];
    };
    expect(body.thread.revision).toBe(2);
    expect(body.messages).toHaveLength(2);
    for (const message of body.messages) {
      expect(chatMessageSchema.safeParse(message).success).toBe(true);
    }

    // Reconnecting after durable completion returns stored state.
    const reconnect = await json(app, `/chat/threads/${THREAD}/turns`, 'POST', {
      turnId: TURN,
      modelId: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });
    const replayed = parseStream(await reconnect.text());
    expect(replayed.map((event) => event.type)).toEqual([
      'message.started',
      'message.completed',
    ]);
    expect(replayed[1]?.data).toMatchObject({
      content: 'It is on the repair shelf.',
      replay: true,
    });
    await expect(chatKernel.listMessages(OWNER.userId, THREAD)).resolves.toHaveLength(2);
  });

  it('rejects a stale revision and a concurrent turn without partial writes', async () => {
    const { app, chatKernel } = makeRuntime({
      providers: [
        provider([
          { type: 'text-delta', text: 'First answer.' },
          { type: 'completed' },
        ]),
      ],
    });
    await createThread(app);

    const first = await json(app, `/chat/threads/${THREAD}/turns`, 'POST', {
      turnId: TURN,
      modelId: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });
    await first.text();

    const stale = await json(app, `/chat/threads/${THREAD}/turns`, 'POST', {
      turnId: '62000000-0000-4000-8000-000000000002',
      modelId: LUNA,
      message: 'And the pump?',
      expectedRevision: 1,
    });
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: 'CONFLICT', message: 'Chat turn conflict: STALE_REVISION' },
    });
    await expect(chatKernel.listMessages(OWNER.userId, THREAD)).resolves.toHaveLength(2);
  });

  it('answers an unavailable model with a service error and no pending attempt', async () => {
    const { app, chatKernel } = makeRuntime();
    await createThread(app);

    const response = await json(app, `/chat/threads/${THREAD}/turns`, 'POST', {
      turnId: TURN,
      modelId: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'MODEL_UNAVAILABLE',
        message: 'Requested chat model is unavailable',
      },
    });
    const stored = await chatKernel.listMessages(OWNER.userId, THREAD);
    expect(stored.map((message) => message.status)).toEqual([
      'COMPLETED',
      'FAILED',
    ]);
    expect(stored[1]?.failureCode).toBe('PROVIDER_UNAVAILABLE');
  });

  it('finalizes a provider failure in the stream and in storage', async () => {
    const { app, chatKernel } = makeRuntime({
      providers: [
        {
          providerId: 'openai',
          async *stream(): AsyncIterable<ChatStreamEvent> {
            await Promise.resolve();
            yield { type: 'text-delta', text: 'partial' };
            throw new Error('401 from provider with sk-live-do-not-log');
          },
        },
      ],
    });
    await createThread(app);

    const response = await json(app, `/chat/threads/${THREAD}/turns`, 'POST', {
      turnId: TURN,
      modelId: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });
    const text = await response.text();
    const events = parseStream(text);

    expect(events.at(-1)).toMatchObject({
      type: 'message.failed',
      data: { type: 'message.failed', code: 'PROVIDER_FAILED' },
    });
    expect(text).not.toContain('sk-live-do-not-log');

    const stored = await chatKernel.listMessages(OWNER.userId, THREAD);
    expect(stored[1]).toMatchObject({
      status: 'FAILED',
      content: '',
      failureCode: 'PROVIDER_FAILED',
    });
  });

  it('finalizes a client disconnect as a cancelled generation', async () => {
    const { app, chatKernel } = makeRuntime({
      providers: [
        {
          providerId: 'openai',
          async *stream(
            _request,
            signal: AbortSignal,
          ): AsyncIterable<ChatStreamEvent> {
            await Promise.resolve();
            yield { type: 'text-delta', text: 'thinking' };
            await new Promise<void>((resolve) => {
              if (signal.aborted) {
                resolve();
                return;
              }
              signal.addEventListener('abort', () => resolve(), { once: true });
            });
            throw new Error('cancelled');
          },
        },
      ],
    });
    await createThread(app);

    const response = await json(app, `/chat/threads/${THREAD}/turns`, 'POST', {
      turnId: TURN,
      modelId: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    if (reader === undefined) return;

    // Read the start of the stream, then hang up mid-generation.
    const decoder = new TextDecoder();
    let seen = '';
    while (!seen.includes('message.delta')) {
      const chunk = await reader.read();
      if (chunk.done === true) break;
      seen += decoder.decode(chunk.value);
    }
    await reader.cancel();

    await vi.waitFor(async () => {
      const stored = await chatKernel.listMessages(OWNER.userId, THREAD);
      expect(stored[1]).toMatchObject({
        status: 'FAILED',
        content: '',
        failureCode: 'GENERATION_CANCELLED',
      });
    });
  });

  it('validates turn request bodies before touching durable state', async () => {
    const { app, chatKernel } = makeRuntime({
      providers: [provider([{ type: 'completed' }])],
    });
    await createThread(app);

    const cases: Array<[string, unknown]> = [
      ['not json', 'nope'],
      ['unknown model field', { modelId: LUNA, message: 'hi', expectedRevision: 1, turnId: TURN, providerId: 'openai' }],
      ['blank message', { turnId: TURN, modelId: LUNA, message: '', expectedRevision: 1 }],
      ['bad turn id', { turnId: 'nope', modelId: LUNA, message: 'hi', expectedRevision: 1 }],
      ['zero revision', { turnId: TURN, modelId: LUNA, message: 'hi', expectedRevision: 0 }],
    ];

    for (const [, body] of cases) {
      const response =
        typeof body === 'string'
          ? await app.request(
              `/chat/threads/${THREAD}/turns`,
              authorized({ method: 'POST', body }),
            )
          : await json(app, `/chat/threads/${THREAD}/turns`, 'POST', body);
      expect(response.status).toBe(400);
    }

    const malformed = await app.request('/chat/threads/not-a-uuid', {
      method: 'GET',
      headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    expect(malformed.status).toBe(400);
    await expect(chatKernel.listMessages(OWNER.userId, THREAD)).resolves.toEqual([]);
  });

  it('bounds the thread list query', async () => {
    const { app } = makeRuntime();

    expect((await json(app, '/chat/threads?limit=0', 'GET')).status).toBe(400);
    expect((await json(app, '/chat/threads?limit=1000', 'GET')).status).toBe(400);
    expect((await json(app, '/chat/threads?limit=5', 'GET')).status).toBe(200);
  });
});
