import { describe, expect, it } from 'vitest';
import {
  chatTurnEventSchema,
  type ChatTurnEvent,
} from '../contracts/chat';
import { MemoryChatStore } from '../db/memory/chat-memory-store';
import type { ChatStore } from '../domain/chat-store';
import { ChatKernel } from '../domain/chat-kernel';
import type {
  ChatGenerationRequest,
  ChatProvider,
  ChatStreamEvent,
} from './chat-provider';
import { ChatModelUnavailableError } from './chat-provider';
import { ChatTurnOrchestrator } from './chat-turn';
import type {
  MemoryProvider,
  MemoryRecallRequest,
} from './memory-provider';

const OWNER = '50000000-0000-4000-8000-000000000001';
const THREAD = '51000000-0000-4000-8000-000000000001';
const TURN = '52000000-0000-4000-8000-000000000001';
const LUNA = 'gpt-6-luna';

function script(
  events: readonly ChatStreamEvent[],
  onRequest?: (request: ChatGenerationRequest) => void,
  beforeYield?: (signal: AbortSignal) => Promise<void>,
): ChatProvider {
  return {
    providerId: 'openai',
    async *stream(
      request: ChatGenerationRequest,
      signal: AbortSignal,
    ): AsyncIterable<ChatStreamEvent> {
      onRequest?.(request);
      for (const event of events) {
        if (beforeYield !== undefined) await beforeYield(signal);
        yield event;
      }
    },
  };
}

function makeKernel(store: ChatStore = new MemoryChatStore()): ChatKernel {
  let tick = 0;
  let index = 0;
  return new ChatKernel(store, {
    clock: () => {
      tick += 1;
      return new Date(Date.UTC(2026, 8, 27, 10, 0, tick)).toISOString();
    },
    idGenerator: () => {
      index += 1;
      return `53000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    },
  });
}

function makeHarness(
  providers: readonly ChatProvider[],
  memoryProvider?: MemoryProvider,
  options: { turnTimeoutMs?: number } = {},
) {
  const kernel = makeKernel();
  return {
    kernel,
    orchestrator: new ChatTurnOrchestrator(kernel, {
      providers,
      ...(memoryProvider === undefined ? {} : { memoryProvider }),
      ...options,
    }),
  };
}

async function startThread(kernel: ChatKernel): Promise<void> {
  await kernel.createThread({
    ownerId: OWNER,
    threadId: THREAD,
    title: 'Avenge-X regulator',
  });
}

async function startTurn(
  harness: ReturnType<typeof makeHarness>,
  turnId = TURN,
  expectedRevision = 1,
) {
  await startThread(harness.kernel);
  return harness.orchestrator.begin({
    ownerId: OWNER,
    threadId: THREAD,
    turnId,
    modelId: LUNA,
    message: 'Where is the regulator?',
    expectedRevision,
  });
}

async function collect(
  events: AsyncGenerator<ChatTurnEvent>,
): Promise<ChatTurnEvent[]> {
  const collected: ChatTurnEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

describe('chat turn orchestration', () => {
  it('streams deltas and commits the completed answer with provenance', async () => {
    let seen: ChatGenerationRequest | undefined;
    const harness = makeHarness([
      script(
        [
          { type: 'text-delta', text: 'It is on ' },
          { type: 'text-delta', text: 'the repair shelf.' },
          { type: 'completed', usage: { inputTokens: 12, outputTokens: 8 } },
        ],
        (request) => {
          seen = request;
        },
      ),
    ]);

    const turn = await startTurn(harness);
    const events = await collect(
      harness.orchestrator.generate(turn, new AbortController().signal),
    );

    expect(events.map((event) => event.type)).toEqual([
      'message.started',
      'message.delta',
      'message.delta',
      'message.completed',
    ]);
    expect(events.every((event) => chatTurnEventSchema.safeParse(event).success)).toBe(
      true,
    );
    expect(events[3]).toMatchObject({
      type: 'message.completed',
      content: 'It is on the repair shelf.',
      providerId: 'openai',
      modelId: LUNA,
      usage: { inputTokens: 12, outputTokens: 8 },
      replay: false,
      threadRevision: 2,
    });
    expect(seen?.model).toEqual({ providerId: 'openai', modelId: LUNA });
    expect(seen?.messages.at(-1)).toEqual({
      role: 'user',
      content: 'Where is the regulator?',
    });

    const stored = await harness.kernel.listMessages(OWNER, THREAD);
    expect(stored.map((message) => message.status)).toEqual([
      'COMPLETED',
      'COMPLETED',
    ]);
    expect(stored[1]?.content).toBe('It is on the repair shelf.');
    expect(stored[1]?.generationId).toBe(turn.assistantMessage.generationId);
  });

  it('fails closed for a model outside the Elara catalog', async () => {
    const harness = makeHarness([script([])]);
    await startThread(harness.kernel);

    await expect(
      harness.orchestrator.begin({
        ownerId: OWNER,
        threadId: THREAD,
        turnId: TURN,
        modelId: 'gpt-4o-mini',
        message: 'Where is the regulator?',
        expectedRevision: 1,
      }),
    ).rejects.toBeInstanceOf(ChatModelUnavailableError);

    // A rejected model never claims a turn.
    await expect(harness.kernel.listMessages(OWNER, THREAD)).resolves.toEqual([]);
  });

  it('keeps a durable failed attempt when no adapter is configured', async () => {
    const harness = makeHarness([]);

    await expect(startTurn(harness)).rejects.toBeInstanceOf(
      ChatModelUnavailableError,
    );

    const stored = await harness.kernel.listMessages(OWNER, THREAD);
    expect(stored.map((message) => [message.role, message.status, message.failureCode])).toEqual([
      ['USER', 'COMPLETED', null],
      ['ASSISTANT', 'FAILED', 'PROVIDER_UNAVAILABLE'],
    ]);
  });

  it('fails a claimed turn when prompt assembly cannot read conversation history', async () => {
    const backing = new MemoryChatStore();
    let failNextRead = true;
    const store: ChatStore = {
      transact: (work) => backing.transact(work),
      read: (work) => {
        if (failNextRead) {
          failNextRead = false;
          return Promise.reject(new Error('transient history read failure'));
        }
        return backing.read(work);
      },
    };
    const kernel = makeKernel(store);
    const orchestrator = new ChatTurnOrchestrator(kernel, {
      providers: [script([{ type: 'completed' }])],
    });

    await startThread(kernel);
    await expect(
      orchestrator.begin({
        ownerId: OWNER,
        threadId: THREAD,
        turnId: TURN,
        modelId: LUNA,
        message: 'Where is the regulator?',
        expectedRevision: 1,
      }),
    ).rejects.toThrow('transient history read failure');

    const stored = await kernel.listMessages(OWNER, THREAD);
    expect(stored).toHaveLength(2);
    expect(stored[1]).toMatchObject({
      role: 'ASSISTANT',
      status: 'FAILED',
      content: '',
      failureCode: 'PROVIDER_FAILED',
    });

    // The durable terminal state is replayable rather than stuck in progress.
    const replay = await orchestrator.begin({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: TURN,
      modelId: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 2,
    });
    expect(replay.kind).toBe('replay');
    expect(replay.assistantMessage.failureCode).toBe('PROVIDER_FAILED');
  });

  it('honors an abort that arrives before provider abort-listener registration', async () => {
    let providerSawAbort = false;
    const provider: ChatProvider = {
      providerId: 'openai',
      async *stream(
        _request: ChatGenerationRequest,
        signal: AbortSignal,
      ): AsyncIterable<ChatStreamEvent> {
        providerSawAbort = signal.aborted;
        await new Promise<void>(() => undefined);
      },
    };
    const harness = makeHarness([provider], undefined, { turnTimeoutMs: 60_000 });
    const turn = await startTurn(harness);
    const controller = new AbortController();
    const events = harness.orchestrator.generate(turn, controller.signal);

    expect((await events.next()).value).toMatchObject({
      type: 'message.started',
    });
    controller.abort();

    const terminal = await events.next();
    expect(terminal.value).toMatchObject({
      type: 'message.failed',
      code: 'GENERATION_CANCELLED',
    });
    expect(providerSawAbort).toBe(true);

    const stored = await harness.kernel.listMessages(OWNER, THREAD);
    expect(stored[1]).toMatchObject({
      status: 'FAILED',
      failureCode: 'GENERATION_CANCELLED',
    });
  });

  it('records a provider failure without keeping partial answer text', async () => {
    const failing: ChatProvider = {
      providerId: 'openai',
      async *stream(): AsyncIterable<ChatStreamEvent> {
        await Promise.resolve();
        yield { type: 'text-delta', text: 'partial answer' };
        throw new Error('upstream 401: sk-live-secret-value rejected');
      },
    };
    const harness = makeHarness([failing]);

    const turn = await startTurn(harness);
    const events = await collect(
      harness.orchestrator.generate(turn, new AbortController().signal),
    );

    expect(events.at(-1)).toMatchObject({
      type: 'message.failed',
      code: 'PROVIDER_FAILED',
      replay: false,
    });

    const stored = await harness.kernel.listMessages(OWNER, THREAD);
    expect(stored[1]).toMatchObject({
      status: 'FAILED',
      content: '',
      failureCode: 'PROVIDER_FAILED',
    });
    expect(JSON.stringify(stored)).not.toContain('sk-live-secret-value');
  });

  it('refuses to present a stream that ends without a completion event', async () => {
    const harness = makeHarness([
      script([{ type: 'text-delta', text: 'half an answer' }]),
    ]);

    const turn = await startTurn(harness);
    const events = await collect(
      harness.orchestrator.generate(turn, new AbortController().signal),
    );

    expect(events.at(-1)).toMatchObject({
      type: 'message.failed',
      code: 'PROVIDER_FAILED',
    });
    const stored = await harness.kernel.listMessages(OWNER, THREAD);
    expect(stored[1]?.content).toBe('');
  });

  it('fails an empty completion instead of storing a blank answer', async () => {
    const harness = makeHarness([script([{ type: 'completed' }])]);

    const turn = await startTurn(harness);
    const events = await collect(
      harness.orchestrator.generate(turn, new AbortController().signal),
    );

    expect(events.at(-1)).toMatchObject({ code: 'EMPTY_RESPONSE' });
  });

  it('stops an oversized generation before it can complete', async () => {
    const chunk = 'x'.repeat(30_000);
    const harness = makeHarness([
      script([
        { type: 'text-delta', text: chunk },
        { type: 'text-delta', text: chunk },
        { type: 'completed' },
      ]),
    ]);

    const turn = await startTurn(harness);
    const events = await collect(
      harness.orchestrator.generate(turn, new AbortController().signal),
    );

    expect(events.at(-1)).toMatchObject({ code: 'PROVIDER_OUTPUT_TOO_LARGE' });
    const stored = await harness.kernel.listMessages(OWNER, THREAD);
    expect(stored[1]).toMatchObject({ status: 'FAILED', content: '' });
  });

  it('propagates a client cancellation to the provider and finalizes as cancelled', async () => {
    let providerSawAbort = false;
    const waiting: ChatProvider = {
      providerId: 'openai',
      async *stream(
        _request: ChatGenerationRequest,
        signal: AbortSignal,
      ): AsyncIterable<ChatStreamEvent> {
        yield { type: 'text-delta', text: 'thinking' };
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        providerSawAbort = true;
        throw new Error('aborted by client disconnect');
      },
    };
    const harness = makeHarness([waiting]);

    const turn = await startTurn(harness);
    const controller = new AbortController();
    const events = harness.orchestrator.generate(turn, controller.signal);

    expect((await events.next()).value).toMatchObject({ type: 'message.started' });
    expect((await events.next()).value).toMatchObject({ type: 'message.delta' });
    controller.abort();
    const terminal = await events.next();

    expect(terminal.value).toMatchObject({
      type: 'message.failed',
      code: 'GENERATION_CANCELLED',
    });
    expect(providerSawAbort).toBe(true);

    const stored = await harness.kernel.listMessages(OWNER, THREAD);
    expect(stored[1]).toMatchObject({
      status: 'FAILED',
      content: '',
      failureCode: 'GENERATION_CANCELLED',
    });
  });

  it('durably cancels a claimed turn when transport stops consuming before finalization', async () => {
    const harness = makeHarness([
      script([
        { type: 'text-delta', text: 'should never be delivered' },
        { type: 'completed' },
      ]),
    ]);

    const turn = await startTurn(harness);
    const events = harness.orchestrator.generate(
      turn,
      new AbortController().signal,
    );

    expect((await events.next()).value).toMatchObject({
      type: 'message.started',
    });

    // Model the HTTP/SSE layer losing its socket while writeSSE is handling
    // the first yielded event. Closing the generator alone used to strand the
    // already-claimed assistant Message in PENDING forever.
    await events.return(undefined);
    await harness.orchestrator.abandon(turn);

    const stored = await harness.kernel.listMessages(OWNER, THREAD);
    expect(stored[1]).toMatchObject({
      status: 'FAILED',
      content: '',
      failureCode: 'GENERATION_CANCELLED',
    });

    // A second cleanup race is safe and cannot rewrite terminal history.
    await expect(harness.orchestrator.abandon(turn)).resolves.toBeUndefined();
  });

  it('finalizes a timeout even when the provider ignores abort and iterator shutdown hangs', async () => {
    const uncooperative: ChatProvider = {
      providerId: 'openai',
      async *stream(): AsyncIterable<ChatStreamEvent> {
        yield { type: 'text-delta', text: 'thinking' };
        // Deliberately ignore the AbortSignal forever. AsyncGenerator.return()
        // queues behind this pending continuation, so orchestration cleanup
        // must not await provider cooperation before finalizing durable state.
        await new Promise<void>(() => undefined);
      },
    };
    const harness = makeHarness(
      [uncooperative],
      undefined,
      { turnTimeoutMs: 10 },
    );

    const turn = await startTurn(harness);
    const events = await collect(
      harness.orchestrator.generate(turn, new AbortController().signal),
    );

    expect(events.at(-1)).toMatchObject({
      type: 'message.failed',
      code: 'PROVIDER_TIMEOUT',
    });
    const stored = await harness.kernel.listMessages(OWNER, THREAD);
    expect(stored[1]).toMatchObject({
      status: 'FAILED',
      content: '',
      failureCode: 'PROVIDER_TIMEOUT',
    });
  });

  it('records a server-side turn deadline as a provider timeout', async () => {
    const hanging: ChatProvider = {
      providerId: 'openai',
      async *stream(
        _request: ChatGenerationRequest,
        signal: AbortSignal,
      ): AsyncIterable<ChatStreamEvent> {
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        if (!signal.aborted) yield { type: 'completed' };
      },
    };
    const harness = makeHarness([hanging], undefined, { turnTimeoutMs: 10 });

    const turn = await startTurn(harness);
    const events = await collect(
      harness.orchestrator.generate(turn, new AbortController().signal),
    );

    expect(events.at(-1)).toMatchObject({ code: 'PROVIDER_TIMEOUT' });
    const stored = await harness.kernel.listMessages(OWNER, THREAD);
    expect(stored[1]?.failureCode).toBe('PROVIDER_TIMEOUT');
  });

  it('replays durable stored state for a retried turn without a provider', async () => {
    const harness = makeHarness([
      script([
        { type: 'text-delta', text: 'It is on the repair shelf.' },
        { type: 'completed', usage: { inputTokens: 5, outputTokens: 6 } },
      ]),
    ]);

    const turn = await startTurn(harness);
    await collect(
      harness.orchestrator.generate(turn, new AbortController().signal),
    );

    // The same durable records, now with no adapter configured at all.
    const offline = new ChatTurnOrchestrator(harness.kernel, { providers: [] });
    const replay = await offline.begin({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: TURN,
      modelId: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });
    const events = await collect(
      offline.generate(replay, new AbortController().signal),
    );

    expect(events).toEqual([
      expect.objectContaining({ type: 'message.started' }),
      expect.objectContaining({
        type: 'message.completed',
        content: 'It is on the repair shelf.',
        usage: { inputTokens: 5, outputTokens: 6 },
        replay: true,
      }),
    ]);
  });

  it('replays a failed attempt as stored rather than generating again', async () => {
    const harness = makeHarness([
      script([{ type: 'text-delta', text: 'partial' }]),
    ]);

    const turn = await startTurn(harness);
    await collect(
      harness.orchestrator.generate(turn, new AbortController().signal),
    );

    const replay = await harness.orchestrator.begin({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: TURN,
      modelId: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 2,
    });
    const events = await collect(
      harness.orchestrator.generate(replay, new AbortController().signal),
    );

    expect(events.at(-1)).toMatchObject({
      type: 'message.failed',
      code: 'PROVIDER_FAILED',
      replay: true,
    });
  });

  it('reports catalog availability from the configured adapters', () => {
    const harness = makeHarness([
      script([]),
    ]);
    expect(harness.orchestrator.availableModels()).toEqual([
      { modelId: LUNA, providerId: 'openai', available: true },
      {
        modelId: 'muse-spark-1.3-contributor',
        providerId: 'muse',
        available: false,
      },
    ]);
  });

  it('recalls memory under the verified owner as labelled context only', async () => {
    const recalls: MemoryRecallRequest[] = [];
    const memoryProvider: MemoryProvider = {
      retain: () => Promise.resolve(),
      recall: (request) => {
        recalls.push(request);
        return Promise.resolve({
          hits: [
            {
              id: 'hit-1',
              content: 'Niven Naiker often collects the unit on Fridays.',
              layer: 'observation',
              tags: ['chat'],
              evidence: [
                { source: { kind: 'conversation', id: '60000000-0000-4000-8000-000000000001' } },
              ],
            },
          ],
          truncated: false,
        });
      },
    };
    let seen: ChatGenerationRequest | undefined;
    const harness = makeHarness(
      [script([{ type: 'completed' }], (request) => { seen = request; })],
      memoryProvider,
    );

    const turn = await startTurn(harness);
    await collect(
      harness.orchestrator.generate(turn, new AbortController().signal),
    );

    expect(recalls).toHaveLength(1);
    expect(recalls[0]?.scope.ownerId).toBe(OWNER);
    expect(seen?.messages[0]).toMatchObject({ role: 'system' });
    expect(seen?.messages[0]?.content).toContain(
      'Recalled context (historical; not current operational truth):',
    );
    expect(seen?.messages[0]?.content).toContain('conversation:60000000');
    expect(turn.memoryHitCount).toBe(1);
  });

  it('completes the turn when memory recall fails', async () => {
    const memoryProvider: MemoryProvider = {
      retain: () => Promise.resolve(),
      recall: () => Promise.reject(new Error('hindsight unavailable')),
    };
    let seen: ChatGenerationRequest | undefined;
    const harness = makeHarness(
      [
        script(
          [
            { type: 'text-delta', text: 'Answer without memory.' },
            { type: 'completed' },
          ],
          (request) => {
            seen = request;
          },
        ),
      ],
      memoryProvider,
    );

    const turn = await startTurn(harness);
    const events = await collect(
      harness.orchestrator.generate(turn, new AbortController().signal),
    );

    expect(seen?.messages[0]?.content).not.toContain(
      'Recalled context (historical; not current operational truth):',
    );
    expect(events.at(-1)).toMatchObject({ type: 'message.completed' });
  });

  it('sends completed history only and keeps failed attempts out of the prompt', async () => {
    let seen: ChatGenerationRequest | undefined;
    const harness = makeHarness([
      script([{ type: 'text-delta', text: 'first' }, { type: 'completed' }], (request) => {
        seen = request;
      }),
    ]);

    const first = await startTurn(harness);
    await collect(
      harness.orchestrator.generate(first, new AbortController().signal),
    );

    const failing = new ChatTurnOrchestrator(harness.kernel, {
      providers: [
        script([{ type: 'text-delta', text: 'never stored' }], (request) => {
          seen = request;
        }),
      ],
    });
    const second = await failing.begin({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: '52000000-0000-4000-8000-000000000002',
      modelId: LUNA,
      message: 'And the pump?',
      expectedRevision: 2,
    });
    await collect(failing.generate(second, new AbortController().signal));

    const next = new ChatTurnOrchestrator(harness.kernel, {
      providers: [
        script([{ type: 'completed' }], (request) => {
          seen = request;
        }),
      ],
    });
    const third = await next.begin({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: '52000000-0000-4000-8000-000000000003',
      modelId: LUNA,
      message: 'Anything else?',
      expectedRevision: 3,
    });
    await collect(next.generate(third, new AbortController().signal));

    const conversation = seen?.messages.slice(1) ?? [];
    expect(conversation.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'user',
    ]);
    expect(
      conversation.some((message) => message.content.includes('never stored')),
    ).toBe(false);
  });
});
