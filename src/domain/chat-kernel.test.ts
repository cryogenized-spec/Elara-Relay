import { describe, expect, it } from 'vitest';
import { chatMessageSchema, type ChatMessage } from '../contracts/chat';
import { MemoryChatStore } from '../db/memory/chat-memory-store';
import { ChatKernel, ChatTurnConflictError } from './chat-kernel';
import { DomainNotFoundError } from './errors';

const OWNER = '50000000-0000-4000-8000-000000000001';
const OTHER_OWNER = '50000000-0000-4000-8000-000000000002';
const THREAD = '51000000-0000-4000-8000-000000000001';
const TURN = '52000000-0000-4000-8000-000000000001';
const LUNA = { providerId: 'openai', modelId: 'gpt-6-luna' } as const;

function idGenerator(): () => string {
  let index = 0;
  return () => {
    index += 1;
    return `53000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  };
}

function makeKernel(): ChatKernel {
  let tick = 0;
  return new ChatKernel(new MemoryChatStore(), {
    // A monotonically advancing clock keeps stored history ordered the way a
    // real deployment orders it.
    clock: () => {
      tick += 1;
      return new Date(Date.UTC(2026, 8, 27, 10, 0, tick)).toISOString();
    },
    idGenerator: idGenerator(),
  });
}

async function seedThread(kernel: ChatKernel, ownerId = OWNER) {
  const created = await kernel.createThread({
    ownerId,
    threadId: THREAD,
    title: 'Avenge-X regulator',
  });
  return created.thread;
}

describe('chat kernel durable turn lifecycle', () => {
  it('creates an owner-scoped thread that starts at revision one', async () => {
    const kernel = makeKernel();
    const created = await kernel.createThread({
      ownerId: OWNER,
      threadId: THREAD,
      title: 'Avenge-X regulator',
    });

    expect(created.replay).toBe(false);
    expect(created.thread).toEqual({
      id: THREAD,
      ownerId: OWNER,
      title: 'Avenge-X regulator',
      createdAt: '2026-09-27T10:00:01.000Z',
      updatedAt: '2026-09-27T10:00:01.000Z',
      revision: 1,
    });
  });

  it('makes a retried thread creation idempotent for identical intent', async () => {
    const kernel = makeKernel();
    await seedThread(kernel);

    const replay = await kernel.createThread({
      ownerId: OWNER,
      threadId: THREAD,
      title: 'Avenge-X regulator',
    });

    expect(replay.replay).toBe(true);
    expect(replay.thread.revision).toBe(1);
  });

  it('rejects a replayed thread creation that changed the title', async () => {
    const kernel = makeKernel();
    await seedThread(kernel);

    await expect(
      kernel.createThread({ ownerId: OWNER, threadId: THREAD, title: 'Other' }),
    ).rejects.toBeInstanceOf(ChatTurnConflictError);
  });

  it('persists the user message, a pending assistant message, and one revision', async () => {
    const kernel = makeKernel();
    await seedThread(kernel);

    const turn = await kernel.beginTurn({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: TURN,
      model: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });

    expect(turn.kind).toBe('started');
    expect(turn.thread.revision).toBe(2);
    expect(turn.userMessage).toMatchObject({
      role: 'USER',
      status: 'COMPLETED',
      content: 'Where is the regulator?',
      providerId: null,
      modelId: null,
      generationId: null,
      failureCode: null,
    });
    expect(turn.assistantMessage).toMatchObject({
      role: 'ASSISTANT',
      status: 'PENDING',
      content: '',
      providerId: 'openai',
      modelId: 'gpt-6-luna',
      completedAt: null,
      failureCode: null,
    });
    expect(turn.assistantMessage.generationId).not.toBeNull();

    const detail = await kernel.getThread(OWNER, THREAD);
    expect(detail.thread.revision).toBe(2);
    expect(detail.messages.map((message) => message.role)).toEqual([
      'USER',
      'ASSISTANT',
    ]);
  });

  it('rejects a stale revision without writing a partial turn', async () => {
    const kernel = makeKernel();
    await seedThread(kernel);
    await kernel.beginTurn({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: TURN,
      model: LUNA,
      message: 'First question',
      expectedRevision: 1,
    });

    await expect(
      kernel.beginTurn({
        ownerId: OWNER,
        threadId: THREAD,
        turnId: '52000000-0000-4000-8000-000000000002',
        model: LUNA,
        message: 'Second question',
        expectedRevision: 1,
      }),
    ).rejects.toBeInstanceOf(ChatTurnConflictError);

    const detail = await kernel.getThread(OWNER, THREAD);
    expect(detail.thread.revision).toBe(2);
    expect(detail.messages).toHaveLength(2);
  });

  it('treats a stable client turn id as an idempotent retry', async () => {
    const kernel = makeKernel();
    await seedThread(kernel);
    const first = await kernel.beginTurn({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: TURN,
      model: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });
    await kernel.completeGeneration({
      ownerId: OWNER,
      messageId: first.assistantMessage.id,
      content: 'It is on the repair shelf.',
    });

    const retry = await kernel.beginTurn({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: TURN,
      model: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });

    expect(retry.kind).toBe('replay');
    expect(retry.userMessage.id).toBe(first.userMessage.id);
    expect(retry.assistantMessage).toEqual(
      expect.objectContaining({
        status: 'COMPLETED',
        content: 'It is on the repair shelf.',
      }),
    );
    const detail = await kernel.getThread(OWNER, THREAD);
    expect(detail.messages).toHaveLength(2);
    expect(detail.thread.revision).toBe(2);
  });

  it('rejects a replayed turn id that changed the question or the model', async () => {
    const kernel = makeKernel();
    await seedThread(kernel);
    const started = await kernel.beginTurn({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: TURN,
      model: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });
    await kernel.completeGeneration({
      ownerId: OWNER,
      messageId: started.assistantMessage.id,
      content: 'Shelf A.',
    });

    await expect(
      kernel.beginTurn({
        ownerId: OWNER,
        threadId: THREAD,
        turnId: TURN,
        model: LUNA,
        message: 'Where is the pump?',
        expectedRevision: 2,
      }),
    ).rejects.toBeInstanceOf(ChatTurnConflictError);

    await expect(
      kernel.beginTurn({
        ownerId: OWNER,
        threadId: THREAD,
        turnId: TURN,
        model: { providerId: 'muse', modelId: 'muse-spark-1.3-contributor' },
        message: 'Where is the regulator?',
        expectedRevision: 2,
      }),
    ).rejects.toBeInstanceOf(ChatTurnConflictError);
  });

  it('refuses a second generation while the first is still in flight', async () => {
    const kernel = makeKernel();
    await seedThread(kernel);
    await kernel.beginTurn({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: TURN,
      model: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });

    await expect(
      kernel.beginTurn({
        ownerId: OWNER,
        threadId: THREAD,
        turnId: TURN,
        model: LUNA,
        message: 'Where is the regulator?',
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ reason: 'TURN_IN_PROGRESS' });
  });

  it('hides another owner thread instead of exposing or mutating it', async () => {
    const kernel = makeKernel();
    await seedThread(kernel, OTHER_OWNER);

    await expect(kernel.getThread(OWNER, THREAD)).rejects.toBeInstanceOf(
      DomainNotFoundError,
    );
    await expect(kernel.listMessages(OWNER, THREAD)).resolves.toEqual([]);
    await expect(kernel.listThreads(OWNER, 10)).resolves.toEqual([]);
    await expect(
      kernel.beginTurn({
        ownerId: OWNER,
        threadId: THREAD,
        turnId: TURN,
        model: LUNA,
        message: 'Where is the regulator?',
        expectedRevision: 1,
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  it('records completion with usage while the first answer stays immutable', async () => {
    const kernel = makeKernel();
    await seedThread(kernel);
    const turn = await kernel.beginTurn({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: TURN,
      model: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });

    const completed = await kernel.completeGeneration({
      ownerId: OWNER,
      messageId: turn.assistantMessage.id,
      content: 'It is on the repair shelf.',
      usage: { inputTokens: 12, outputTokens: 8 },
    });

    expect(completed).toMatchObject({
      status: 'COMPLETED',
      content: 'It is on the repair shelf.',
      inputTokens: 12,
      outputTokens: 8,
      failureCode: null,
    });
    expect(completed.generationId).toBe(turn.assistantMessage.generationId);

    await expect(
      kernel.completeGeneration({
        ownerId: OWNER,
        messageId: turn.assistantMessage.id,
        content: 'A different answer',
      }),
    ).rejects.toMatchObject({ reason: 'GENERATION_FINALIZED' });

    const stored = await kernel.listMessages(OWNER, THREAD);
    const assistant = stored.find(
      (message) => message.role === 'ASSISTANT',
    ) as ChatMessage;
    expect(assistant.content).toBe('It is on the repair shelf.');
  });

  it('retains a failed attempt without keeping partial answer text', async () => {
    const kernel = makeKernel();
    await seedThread(kernel);
    const turn = await kernel.beginTurn({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: TURN,
      model: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });

    const failed = await kernel.failGeneration({
      ownerId: OWNER,
      messageId: turn.assistantMessage.id,
      failureCode: 'PROVIDER_FAILED',
    });

    expect(failed).toMatchObject({
      status: 'FAILED',
      content: '',
      failureCode: 'PROVIDER_FAILED',
      inputTokens: null,
      outputTokens: null,
    });
    expect(chatMessageSchema.safeParse(failed).success).toBe(true);

    // A retry after a failure is a new turn with new provenance.
    const retry = await kernel.beginTurn({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: '52000000-0000-4000-8000-000000000002',
      model: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 2,
    });
    expect(retry.kind).toBe('started');
    expect(retry.assistantMessage.generationId).not.toBe(
      turn.assistantMessage.generationId,
    );

    const messages = await kernel.listMessages(OWNER, THREAD);
    expect(messages.map((message) => message.status)).toEqual([
      'COMPLETED',
      'FAILED',
      'COMPLETED',
      'PENDING',
    ]);
  });

  it('refuses a terminal transition on an already completed user message', async () => {
    const kernel = makeKernel();
    await seedThread(kernel);
    const turn = await kernel.beginTurn({
      ownerId: OWNER,
      threadId: THREAD,
      turnId: TURN,
      model: LUNA,
      message: 'Where is the regulator?',
      expectedRevision: 1,
    });

    await expect(
      kernel.failGeneration({
        ownerId: OWNER,
        messageId: turn.userMessage.id,
        failureCode: 'PROVIDER_FAILED',
      }),
    ).rejects.toBeInstanceOf(ChatTurnConflictError);
  });

  it('scopes thread listing to the verified owner', async () => {
    const kernel = makeKernel();
    await seedThread(kernel, OWNER);
    await kernel.createThread({
      ownerId: OTHER_OWNER,
      threadId: '51000000-0000-4000-8000-000000000002',
      title: 'Pump duty',
    });

    await expect(kernel.listThreads(OWNER, 10)).resolves.toHaveLength(1);
    await expect(kernel.listThreads(OTHER_OWNER, 10)).resolves.toHaveLength(1);
    await expect(kernel.listThreads(OWNER, 10)).resolves.toEqual([
      expect.objectContaining({ id: THREAD, ownerId: OWNER }),
    ]);
  });
});
