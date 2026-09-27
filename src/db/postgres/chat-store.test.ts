import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatThread } from '../../contracts/chat';
import { ChatTurnConflictError } from '../../domain/chat-kernel';
import { StoredRecordError } from '../../domain/errors';
import type { SqlClient, SqlPool, SqlQueryResult } from './postgres-store';
import { PostgresChatStore } from './chat-store';

const OWNER = '70000000-0000-4000-8000-000000000001';
const OTHER_OWNER = '70000000-0000-4000-8000-000000000002';
const THREAD = '71000000-0000-4000-8000-000000000001';
const TURN = '72000000-0000-4000-8000-000000000001';

const thread: ChatThread = {
  id: THREAD,
  ownerId: OWNER,
  title: 'Avenge-X regulator',
  createdAt: '2026-09-27T10:00:00.000Z',
  updatedAt: '2026-09-27T10:00:00.000Z',
  revision: 1,
};

const userMessage: ChatMessage = {
  id: '73000000-0000-4000-8000-000000000001',
  threadId: THREAD,
  ownerId: OWNER,
  turnId: TURN,
  role: 'USER',
  status: 'COMPLETED',
  content: 'Where is the regulator?',
  providerId: null,
  modelId: null,
  generationId: null,
  createdAt: '2026-09-27T10:00:00.000Z',
  completedAt: '2026-09-27T10:00:00.000Z',
  inputTokens: null,
  outputTokens: null,
  failureCode: null,
};

const pendingMessage: ChatMessage = {
  id: '73000000-0000-4000-8000-000000000002',
  threadId: THREAD,
  ownerId: OWNER,
  turnId: TURN,
  role: 'ASSISTANT',
  status: 'PENDING',
  content: '',
  providerId: 'openai',
  modelId: 'gpt-6-luna',
  generationId: '74000000-0000-4000-8000-000000000001',
  createdAt: '2026-09-27T10:00:00.000Z',
  completedAt: null,
  inputTokens: null,
  outputTokens: null,
  failureCode: null,
};

function threadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: thread.id,
    ownerId: thread.ownerId,
    title: thread.title,
    createdAt: new Date(thread.createdAt),
    updatedAt: thread.updatedAt,
    revision: String(thread.revision),
    ...overrides,
  };
}

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: pendingMessage.id,
    threadId: pendingMessage.threadId,
    ownerId: pendingMessage.ownerId,
    turnId: pendingMessage.turnId,
    role: pendingMessage.role,
    status: pendingMessage.status,
    content: pendingMessage.content,
    providerId: pendingMessage.providerId,
    modelId: pendingMessage.modelId,
    generationId: pendingMessage.generationId,
    createdAt: new Date(pendingMessage.createdAt),
    completedAt: null,
    inputTokens: null,
    outputTokens: null,
    failureCode: null,
    ...overrides,
  };
}

class FakeClient implements SqlClient {
  public readonly queries: Array<{ sql: string; values: unknown[] }> = [];
  public released = false;

  public constructor(
    private readonly responder: (
      sql: string,
      values: unknown[],
    ) => SqlQueryResult | Promise<SqlQueryResult>,
  ) {}

  public async query(
    sql: string,
    values: unknown[] = [],
  ): Promise<SqlQueryResult> {
    this.queries.push({ sql, values });
    return this.responder(sql, values);
  }

  public release(): void {
    this.released = true;
  }
}

class FakePool implements SqlPool {
  public constructor(private readonly client: SqlClient) {}

  public connect(): Promise<SqlClient> {
    return Promise.resolve(this.client);
  }
}

function uniqueViolation(constraint: string): Error {
  const error = new Error('duplicate key value violates unique constraint') as
    Error & { code?: string; constraint?: string };
  error.code = '23505';
  error.constraint = constraint;
  return error;
}

function normalized(sql: string): string {
  return sql.replaceAll(/\s+/g, ' ').trim().toLowerCase();
}

describe('PostgresChatStore', () => {
  it('reads only owner-scoped rows and maps the durable record shape', async () => {
    const client = new FakeClient((sql) => {
      const text = normalized(sql);
      if (text.includes('from public.chat_messages')) {
        return { rows: [messageRow()], rowCount: 1 };
      }
      return { rows: [threadRow()], rowCount: 1 };
    });
    const store = new PostgresChatStore(new FakePool(client));

    const detail = await store.read(async (read) => ({
      thread: await read.getThread(OWNER, THREAD),
      messages: await read.listMessages(OWNER, THREAD),
    }));

    expect(detail.thread).toEqual(thread);
    expect(detail.messages).toEqual([pendingMessage]);
    const chatQueries = client.queries.filter((query) =>
      query.sql.includes('public.chat_'),
    );
    expect(chatQueries).toHaveLength(2);
    for (const query of chatQueries) {
      expect(query.sql).toContain('owner_id = $2');
      expect(query.values).toContain(OWNER);
    }
  });

  it('returns no thread and no messages for a different owner', async () => {
    const client = new FakeClient(() => ({ rows: [], rowCount: 0 }));
    const store = new PostgresChatStore(new FakePool(client));

    const result = await store.read(async (read) => ({
      thread: await read.getThread(OTHER_OWNER, THREAD),
      messages: await read.listMessages(OTHER_OWNER, THREAD),
      turn: await read.findTurnMessages(OTHER_OWNER, THREAD, TURN),
      message: await read.getMessage(OTHER_OWNER, pendingMessage.id),
    }));

    expect(result).toEqual({
      thread: undefined,
      messages: [],
      turn: undefined,
      message: undefined,
    });
  });

  it('splits a stored turn into its user and assistant messages', async () => {
    const client = new FakeClient(() => ({
      rows: [messageRow(), messageRow(userMessage)],
      rowCount: 2,
    }));
    const store = new PostgresChatStore(new FakePool(client));

    const turn = await store.read((read) =>
      read.findTurnMessages(OWNER, THREAD, TURN),
    );

    expect(turn).toEqual({
      userMessage,
      assistantMessage: pendingMessage,
    });
  });

  it('rejects a stored row that violates the chat record contract', async () => {
    const client = new FakeClient(() => ({
      rows: [messageRow({ status: 'COMPLETED', content: '' })],
      rowCount: 1,
    }));
    const store = new PostgresChatStore(new FakePool(client));

    await expect(store.read((read) => read.getMessage(OWNER, THREAD))).rejects.toBeInstanceOf(
      StoredRecordError,
    );
  });

  it('serializes owner-scoped turn writes inside one transaction', async () => {
    const client = new FakeClient((sql) =>
      normalized(sql).includes('from public.chat_threads')
        ? { rows: [threadRow()], rowCount: 1 }
        : { rows: [], rowCount: 1 },
    );
    const store = new PostgresChatStore(new FakePool(client));

    const applied = await store.transact(async (transaction) => {
      const locked = await transaction.getThread(OWNER, THREAD);
      await transaction.insertMessage(userMessage);
      await transaction.insertMessage(pendingMessage);
      return {
        locked,
        advanced: await transaction.advanceThreadRevision(
          { ...thread, revision: 2 },
          1,
        ),
      };
    });

    expect(applied.locked).toEqual(thread);
    expect(applied.advanced).toBe(true);
    const sql = client.queries.map((query) => normalized(query.sql));
    expect(sql[0]).toBe('begin');
    expect(sql).toContain(
      'select id::text as "id", owner_id::text as "ownerid", title, created_at as "createdat", updated_at as "updatedat", revision::text as "revision" from public.chat_threads where id = $1 and owner_id = $2 for update',
    );
    expect(sql.some((text) => text.includes('insert into public.chat_messages'))).toBe(
      true,
    );
    expect(sql).toContain(
      'update public.chat_threads set revision = $4, updated_at = $5 where id = $1 and owner_id = $2 and revision = $3',
    );
    expect(sql.at(-1)).toBe('commit');
    expect(client.released).toBe(true);
  });

  it('only finalizes a pending assistant message', async () => {
    const applied = new FakeClient(() => ({ rows: [], rowCount: 1 }));
    const appliedStore = new PostgresChatStore(new FakePool(applied));
    const completed: ChatMessage = {
      ...pendingMessage,
      status: 'COMPLETED',
      content: 'It is on the repair shelf.',
      completedAt: '2026-09-27T10:00:05.000Z',
      inputTokens: 9,
      outputTokens: 4,
    };

    await appliedStore.transact(async (transaction) => {
      expect(
        await transaction.completeMessage(completed),
      ).toBe(true);
      expect(
        await transaction.failMessage({ ...completed, status: 'FAILED', content: '', failureCode: 'PROVIDER_FAILED' }),
      ).toBe(true);
    });

    for (const statement of applied.queries
      .map((query) => normalized(query.sql))
      .filter((text) => text.startsWith('update public.chat_messages'))) {
      expect(statement).toContain("role = 'assistant'");
      expect(statement).toContain("status = 'pending'");
    }

    const missed = new FakeClient(() => ({ rows: [], rowCount: 0 }));
    const missedStore = new PostgresChatStore(new FakePool(missed));
    await expect(
      missedStore.transact((transaction) => transaction.completeMessage(completed)),
    ).resolves.toBe(false);
  });

  it('maps a claimed turn or generation identity to a client conflict', async () => {
    for (const constraint of [
      'chat_threads_pkey',
      'chat_messages_thread_id_turn_id_role_key',
      'chat_messages_generation_id_key',
    ]) {
      const client = new FakeClient((sql) => {
        const text = normalized(sql);
        if (text.startsWith('begin')) return { rows: [], rowCount: 0 };
        if (text === 'rollback') return { rows: [], rowCount: 0 };
        throw uniqueViolation(constraint);
      });
      const store = new PostgresChatStore(new FakePool(client));

      await expect(
        store.transact((transaction) =>
          transaction.insertMessage(pendingMessage),
        ),
      ).rejects.toBeInstanceOf(ChatTurnConflictError);
    }
  });

  it('rolls back and releases the client when a transaction fails', async () => {
    const client = new FakeClient((sql) => {
      const text = normalized(sql);
      if (text === 'begin' || text === 'rollback') {
        return { rows: [], rowCount: 0 };
      }
      throw new Error('connection reset');
    });
    const store = new PostgresChatStore(new FakePool(client));

    await expect(
      store.transact(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    expect(client.queries.map((query) => normalized(query.sql))).toEqual([
      'begin',
      'rollback',
    ]);
    expect(client.released).toBe(true);
  });

  it('keeps genuine database faults distinct from client conflicts', async () => {
    const client = new FakeClient((sql) => {
      const text = normalized(sql);
      if (text === 'begin' || text === 'rollback') {
        return { rows: [], rowCount: 0 };
      }
      const error = new Error('null value violates check constraint') as
        Error & { code?: string };
      error.code = '23514';
      throw error;
    });
    const store = new PostgresChatStore(new FakePool(client));

    await expect(
      store.transact((transaction) => transaction.insertMessage(userMessage)),
    ).rejects.toThrow('null value violates check constraint');
  });
});
