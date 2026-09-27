import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AuthIdentity,
  AuthVerifier,
} from '../src/auth/auth-verifier';
import { AuthenticationError } from '../src/auth/errors';
import type {
  ChatProvider,
  ChatStreamEvent,
} from '../src/ai/chat-provider';
import { ChatTurnConflictError } from '../src/domain/chat-kernel';
import { PostgresChatStore } from '../src/db/postgres/chat-store';
import { ChatKernel } from '../src/domain/chat-kernel';
import {
  createPersistentApiFromResources,
  type PersistentApiRuntime,
} from '../src/runtime/node/persistent-api';
import {
  createNodePostgresResources,
  type NodePostgresResources,
} from '../src/runtime/node/postgres-pool';
import { readDatabaseRuntimeConfig } from '../src/runtime/node/database-config';
import { Pool } from 'pg';

const CHAT_DATABASE = 'elara_chat_integration';
const OWNER: AuthIdentity = {
  userId: '80000000-0000-4000-8000-000000000001',
  sessionId: '80000000-0000-4000-8000-000000000002',
  email: 'owner@example.com',
  aal: 'aal1',
};
const INTRUDER: AuthIdentity = {
  userId: '80000000-0000-4000-8000-000000000003',
  sessionId: '80000000-0000-4000-8000-000000000004',
  email: 'other@example.com',
  aal: 'aal1',
};
const LUNA = 'gpt-6-luna';

let identity: AuthIdentity = OWNER;

const authVerifier: AuthVerifier = {
  verify: async (token: string) => {
    if (token !== 'integration.payload.signature') {
      throw new AuthenticationError();
    }
    return identity;
  },
};

let scripted: ChatStreamEvent[] = [];

const scriptedProvider: ChatProvider = {
  providerId: 'openai',
  async *stream(): AsyncIterable<ChatStreamEvent> {
    for (const event of scripted) yield event;
  },
};

let resources: NodePostgresResources;
let runtime: PersistentApiRuntime;
let chatKernel: ChatKernel;

let threadCounter = 0;
let turnCounter = 0;

function nextThreadId(): string {
  threadCounter += 1;
  return `81000000-0000-4000-8000-${String(threadCounter).padStart(12, '0')}`;
}

function nextTurnId(): string {
  turnCounter += 1;
  return `82000000-0000-4000-8000-${String(turnCounter).padStart(12, '0')}`;
}

async function request(
  path: string,
  method: string,
  body?: unknown,
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: { authorization: 'Bearer integration.payload.signature' },
  };
  if (body !== undefined) {
    init.headers = {
      authorization: 'Bearer integration.payload.signature',
      'content-type': 'application/json',
    };
    init.body = JSON.stringify(body);
  }
  return runtime.app.request(path, init);
}

function asOwner<T>(work: () => Promise<T>): Promise<T> {
  identity = OWNER;
  return work();
}

function asIntruder<T>(work: () => Promise<T>): Promise<T> {
  identity = INTRUDER;
  return work();
}

function streamEvents(text: string): { type: string; data: unknown }[] {
  return text
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const lines = block.split('\n');
      return {
        type:
          lines
            .find((line) => line.startsWith('event: '))
            ?.slice('event: '.length) ?? '',
        data: JSON.parse(
          lines
            .filter((line) => line.startsWith('data: '))
            .map((line) => line.slice('data: '.length))
            .join('\n'),
        ) as unknown,
      };
    });
}

async function createThread(title: string | null = 'Live turn') {
  const threadId = nextThreadId();
  const response = await request('/chat/threads', 'POST', { threadId, title });
  expect(response.status).toBe(201);
  return threadId;
}

async function runTurn(threadId: string, turnId: string, revision: number, message: string) {
  const response = await request(`/chat/threads/${threadId}/turns`, 'POST', {
    turnId,
    modelId: LUNA,
    message,
    expectedRevision: revision,
  });
  return { response, events: response.status === 200 ? streamEvents(await response.text()) : [] };
}

beforeAll(async () => {
  const config = readDatabaseRuntimeConfig(process.env);
  const chatUrl = new URL(config.databaseUrl);
  chatUrl.pathname = `/${CHAT_DATABASE}`;

  const maintenance = new Pool({ connectionString: config.databaseUrl });
  try {
    const existing = await maintenance.query(
      'select 1 from pg_database where datname = $1',
      [CHAT_DATABASE],
    );
    if (existing.rowCount === 0) {
      await maintenance.query(`create database "${CHAT_DATABASE}"`);
    }
  } finally {
    await maintenance.end();
  }

  resources = createNodePostgresResources({
    ...config,
    databaseUrl: chatUrl.toString(),
  });

  // Roles are cluster-wide; creating them must stay idempotent so this suite
  // can run beside the other integration suite.
  await resources.rawPool.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
    end
    $$;
  `);

  await resources.rawPool.query('drop schema public cascade; create schema public;');
  const migration = await readFile('src/db/migrations/0006_ai_chat.sql', 'utf8');
  await resources.rawPool.query(migration);

  runtime = createPersistentApiFromResources(
    resources,
    authVerifier,
    [],
    undefined,
    [scriptedProvider],
  );
  chatKernel = new ChatKernel(new PostgresChatStore(resources.sqlPool));
});

afterAll(async () => {
  await runtime.close();
});

describe('live PostgreSQL chat durability', () => {
  it('keeps chat tables server-only for browser roles', async () => {
    const privileges = await resources.rawPool.query<{
      table_name: string;
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
    }>(`
      select
        table_name,
        has_table_privilege(role_name, format('public.%I', table_name), 'select') as can_select,
        has_table_privilege(role_name, format('public.%I', table_name), 'insert') as can_insert,
        has_table_privilege(role_name, format('public.%I', table_name), 'update') as can_update,
        has_table_privilege(role_name, format('public.%I', table_name), 'delete') as can_delete
      from unnest(array['anon', 'authenticated']) as role_name
      cross join unnest(array['chat_threads', 'chat_messages']) as table_name
      order by role_name, table_name
    `);

    expect(privileges.rows).toHaveLength(4);
    expect(
      privileges.rows.every(
        (row) =>
          !row.can_select &&
          !row.can_insert &&
          !row.can_update &&
          !row.can_delete,
      ),
    ).toBe(true);
  });

  it('commits one turn and makes a duplicate client turn id idempotent', async () => {
    const threadId = await asOwner(() => createThread('Idempotent turn'));
    const turnId = nextTurnId();
    scripted = [
      { type: 'text-delta', text: 'It is on the repair shelf.' },
      { type: 'completed', usage: { inputTokens: 11, outputTokens: 7 } },
    ];

    const first = await asOwner(() =>
      runTurn(threadId, turnId, 1, 'Where is the regulator?'),
    );
    expect(first.response.status).toBe(200);
    expect(first.events.map((event) => event.type)).toEqual([
      'message.started',
      'message.delta',
      'message.completed',
    ]);

    // A retried request replays the durable answer and writes nothing new.
    const retry = await asOwner(() =>
      runTurn(threadId, turnId, 1, 'Where is the regulator?'),
    );
    expect(retry.events).toEqual([
      expect.objectContaining({ type: 'message.started' }),
      expect.objectContaining({
        type: 'message.completed',
        data: expect.objectContaining({
          content: 'It is on the repair shelf.',
          usage: { inputTokens: 11, outputTokens: 7 },
          replay: true,
        }),
      }),
    ]);

    const rows = await resources.rawPool.query<{ count: string }>(
      'select count(*)::text as count from public.chat_messages where thread_id = $1',
      [threadId],
    );
    expect(rows.rows[0]?.count).toBe('2');

    const stored = await asOwner(() =>
      chatKernel.listMessages(OWNER.userId, threadId),
    );
    expect(stored.map((message) => message.status)).toEqual([
      'COMPLETED',
      'COMPLETED',
    ]);
    expect(stored[1]?.generationId).not.toBeNull();
  });

  it('rejects a replayed turn id that changed the question', async () => {
    const threadId = await asOwner(() => createThread('Replay mismatch'));
    const turnId = nextTurnId();
    scripted = [{ type: 'text-delta', text: 'Answer' }, { type: 'completed' }];
    await asOwner(() => runTurn(threadId, turnId, 1, 'First question'));

    const mismatch = await asOwner(() =>
      runTurn(threadId, turnId, 2, 'A different question'),
    );

    expect(mismatch.response.status).toBe(409);
    await expect(mismatch.response.json()).resolves.toMatchObject({
      error: { code: 'CONFLICT' },
    });
  });

  it('scopes every read and write to the verified owner', async () => {
    const threadId = await asOwner(() => createThread('Owner isolation'));
    scripted = [{ type: 'text-delta', text: 'Answer' }, { type: 'completed' }];
    await asOwner(() => runTurn(threadId, nextTurnId(), 1, 'Where is it?'));

    await asIntruder(async () => {
      await expect(request(`/chat/threads/${threadId}`, 'GET')).resolves.toMatchObject({
        status: 404,
      });
      const list = await request('/chat/threads', 'GET');
      await expect(list.json()).resolves.toEqual({ threads: [] });
      const turn = await runTurn(threadId, nextTurnId(), 2, 'Where is it?');
      expect(turn.response.status).toBe(404);
    });

    await asIntruder(async () => {
      await expect(chatKernel.listMessages(INTRUDER.userId, threadId)).resolves.toEqual(
        [],
      );
      await expect(
        chatKernel.listThreads(INTRUDER.userId, 50),
      ).resolves.toEqual([]);
    });

    // The owner's conversation is intact and untouched by the intruder.
    const stored = await asOwner(() => chatKernel.listMessages(OWNER.userId, threadId));
    expect(stored).toHaveLength(2);
  });

  it('rejects a stale revision without writing a partial turn', async () => {
    const threadId = await asOwner(() => createThread('Stale revision'));
    scripted = [{ type: 'text-delta', text: 'Answer' }, { type: 'completed' }];
    await asOwner(() => runTurn(threadId, nextTurnId(), 1, 'First question'));

    const stale = await asOwner(() =>
      runTurn(threadId, nextTurnId(), 1, 'Second question'),
    );

    expect(stale.response.status).toBe(409);
    const stored = await asOwner(() => chatKernel.listMessages(OWNER.userId, threadId));
    expect(stored).toHaveLength(2);
    const thread = await asOwner(() => chatKernel.getThread(OWNER.userId, threadId));
    expect(thread.thread.revision).toBe(2);
  });

  it('lets exactly one of two concurrent turns advance the revision', async () => {
    const threadId = await asOwner(() => createThread('Concurrent turns'));
    scripted = [{ type: 'text-delta', text: 'Answer' }, { type: 'completed' }];

    const results = await asOwner(() =>
      Promise.all([
        runTurn(threadId, nextTurnId(), 1, 'Question A'),
        runTurn(threadId, nextTurnId(), 1, 'Question B'),
      ]),
    );

    const statuses = results.map((result) => result.response.status).sort();
    expect(statuses).toEqual([200, 409]);

    const stored = await asOwner(() => chatKernel.listMessages(OWNER.userId, threadId));
    expect(stored).toHaveLength(2);
    const thread = await asOwner(() => chatKernel.getThread(OWNER.userId, threadId));
    expect(thread.thread.revision).toBe(2);
  });

  it('finalizes a failed generation as retained history and allows a retry', async () => {
    const threadId = await asOwner(() => createThread('Failure recovery'));
    scripted = [
      { type: 'text-delta', text: 'half an answer' },
      { type: 'text-delta', text: ' that never completes' },
    ];

    const failed = await asOwner(() =>
      runTurn(threadId, nextTurnId(), 1, 'Where is the regulator?'),
    );

    expect(failed.events.at(-1)).toMatchObject({
      type: 'message.failed',
      data: { code: 'PROVIDER_FAILED' },
    });
    const stored = await asOwner(() => chatKernel.listMessages(OWNER.userId, threadId));
    expect(stored.map((message) => [message.role, message.status, message.content])).toEqual([
      ['USER', 'COMPLETED', 'Where is the regulator?'],
      ['ASSISTANT', 'FAILED', ''],
    ]);

    scripted = [{ type: 'text-delta', text: 'It is on the repair shelf.' }, { type: 'completed' }];
    const retry = await asOwner(() =>
      runTurn(threadId, nextTurnId(), 2, 'Where is the regulator?'),
    );
    expect(retry.response.status).toBe(200);

    const afterRetry = await asOwner(() =>
      chatKernel.listMessages(OWNER.userId, threadId),
    );
    expect(afterRetry.map((message) => message.status)).toEqual([
      'COMPLETED',
      'FAILED',
      'COMPLETED',
      'COMPLETED',
    ]);
    const failedAttempt = afterRetry[1];
    const retryAttempt = afterRetry[3];
    expect(failedAttempt?.failureCode).toBe('PROVIDER_FAILED');
    expect(retryAttempt?.generationId).not.toBe(failedAttempt?.generationId);
  });

  it('rejects a second terminal transition for a completed message', async () => {
    const threadId = await asOwner(() => createThread('Append-only'));
    scripted = [{ type: 'text-delta', text: 'Final answer.' }, { type: 'completed' }];
    const turnId = nextTurnId();
    await asOwner(() => runTurn(threadId, turnId, 1, 'Where is the regulator?'));
    const stored = await asOwner(() => chatKernel.listMessages(OWNER.userId, threadId));
    const assistant = stored[1];
    if (assistant === undefined) throw new Error('assistant message missing');

    await expect(
      asOwner(() =>
        chatKernel.completeGeneration({
          ownerId: OWNER.userId,
          messageId: assistant.id,
          content: 'Rewritten answer.',
        }),
      ),
    ).rejects.toBeInstanceOf(ChatTurnConflictError);

    await expect(
      asOwner(() =>
        chatKernel.failGeneration({
          ownerId: OWNER.userId,
          messageId: assistant.id,
          failureCode: 'PROVIDER_FAILED',
        }),
      ),
    ).rejects.toBeInstanceOf(ChatTurnConflictError);

    const unchanged = await asOwner(() => chatKernel.listMessages(OWNER.userId, threadId));
    expect(unchanged[1]?.content).toBe('Final answer.');
  });

  it('refuses direct mutation of a completed message at the database level', async () => {
    const threadId = await asOwner(() => createThread('Trigger protection'));
    scripted = [{ type: 'text-delta', text: 'Final answer.' }, { type: 'completed' }];
    await asOwner(() => runTurn(threadId, nextTurnId(), 1, 'Where is the regulator?'));
    const stored = await asOwner(() => chatKernel.listMessages(OWNER.userId, threadId));
    const assistant = stored[1];
    if (assistant === undefined) throw new Error('assistant message missing');

    await expect(
      resources.rawPool.query(
        `update public.chat_messages set content = 'tampered' where id = $1`,
        [assistant.id],
      ),
    ).rejects.toThrow(/chat message transition is invalid/);

    await expect(
      resources.rawPool.query(`delete from public.chat_messages where id = $1`, [
        assistant.id,
      ]),
    ).rejects.toThrow(/chat messages are append-only/);

    // Provenance assigned at generation start is immutable even while pending.
    const pending = await resources.rawPool.query<{ id: string }>(
      `insert into public.chat_messages
        (id, thread_id, owner_id, turn_id, role, status, content,
         provider_id, model_id, generation_id)
       values (gen_random_uuid(), $1, $2, gen_random_uuid(), 'ASSISTANT',
               'PENDING', '', 'openai', 'gpt-6-luna', gen_random_uuid())
       returning id::text as id`,
      [threadId, OWNER.userId],
    );
    const pendingId = pending.rows[0]?.id;
    if (pendingId === undefined) throw new Error('pending message missing');

    await expect(
      resources.rawPool.query(
        `update public.chat_messages
         set status = 'FAILED', failure_code = 'PROVIDER_FAILED',
             completed_at = now(), generation_id = gen_random_uuid()
         where id = $1`,
        [pendingId],
      ),
    ).rejects.toThrow(/chat message identity and provenance are immutable/);

    await expect(
      resources.rawPool.query(
        `update public.chat_messages
         set status = 'PENDING'
         where id = $1`,
        [assistant.id],
      ),
    ).rejects.toThrow(/chat message transition is invalid/);
  });

  it('enforces the message owner relationship and provenance pairing', async () => {
    const threadId = await asOwner(() => createThread('Constraint proof'));
    scripted = [{ type: 'text-delta', text: 'Answer.' }, { type: 'completed' }];
    await asOwner(() => runTurn(threadId, nextTurnId(), 1, 'Where is the regulator?'));

    await expect(
      resources.rawPool.query(
        `insert into public.chat_messages
          (id, thread_id, owner_id, turn_id, role, status, content, completed_at)
         values (gen_random_uuid(), $1, $2, gen_random_uuid(), 'USER', 'COMPLETED',
                 'forged', now())`,
        [threadId, INTRUDER.userId],
      ),
    ).rejects.toThrow(/foreign key/i);

    await expect(
      resources.rawPool.query(
        `insert into public.chat_messages
          (id, thread_id, owner_id, turn_id, role, status, content,
           provider_id, model_id, generation_id)
         values (gen_random_uuid(), $1, $2, gen_random_uuid(), 'ASSISTANT',
                 'PENDING', '', 'openai', 'muse-spark-1.3-contributor',
                 gen_random_uuid())`,
        [threadId, OWNER.userId],
      ),
    ).rejects.toThrow(/chat_messages.*check constraint|row-level security/i);
  });

  it('returns authoritative stored state after a reconnect', async () => {
    const threadId = await asOwner(() => createThread('Reconnect'));
    const turnId = nextTurnId();
    scripted = [{ type: 'text-delta', text: 'Shelf A.' }, { type: 'completed' }];
    await asOwner(() => runTurn(threadId, turnId, 1, 'Where is the regulator?'));

    // A client that never saw the final event simply re-reads the Thread.
    const detail = await asOwner(() => request(`/chat/threads/${threadId}`, 'GET'));
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as {
      thread: { revision: number };
      messages: { role: string; status: string; content: string }[];
    };
    expect(body.thread.revision).toBe(2);
    expect(body.messages).toEqual([
      {
        id: expect.any(String),
        threadId,
        ownerId: OWNER.userId,
        turnId,
        role: 'USER',
        status: 'COMPLETED',
        content: 'Where is the regulator?',
        providerId: null,
        modelId: null,
        generationId: null,
        createdAt: expect.any(String),
        completedAt: expect.any(String),
        inputTokens: null,
        outputTokens: null,
        failureCode: null,
      },
      {
        id: expect.any(String),
        threadId,
        ownerId: OWNER.userId,
        turnId,
        role: 'ASSISTANT',
        status: 'COMPLETED',
        content: 'Shelf A.',
        providerId: 'openai',
        modelId: LUNA,
        generationId: expect.any(String),
        createdAt: expect.any(String),
        completedAt: expect.any(String),
        inputTokens: null,
        outputTokens: null,
        failureCode: null,
      },
    ]);
  });

  it('fails closed for an unconfigured or unknown model', async () => {
    const threadId = await asOwner(() => createThread('Model gating'));
    scripted = [{ type: 'text-delta', text: 'Answer.' }, { type: 'completed' }];

    const unknown = await asOwner(() =>
      request(`/chat/threads/${threadId}/turns`, 'POST', {
        turnId: nextTurnId(),
        modelId: 'gpt-4o',
        message: 'Where is the regulator?',
        expectedRevision: 1,
      }),
    );
    expect(unknown.status).toBe(503);
    await expect(
      asOwner(() => chatKernel.listMessages(OWNER.userId, threadId)),
    ).resolves.toEqual([]);

    // `muse` has no configured adapter in this runtime.
    const unconfigured = await asOwner(() =>
      request(`/chat/threads/${threadId}/turns`, 'POST', {
        turnId: nextTurnId(),
        modelId: 'muse-spark-1.3-contributor',
        message: 'Where is the regulator?',
        expectedRevision: 1,
      }),
    );
    expect(unconfigured.status).toBe(503);
    const models = await asOwner(() => request('/chat/models', 'GET'));
    await expect(models.json()).resolves.toEqual({
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

  it('requires a verified identity for every chat route and nothing else', async () => {
    const anonymous = await runtime.app.request('/chat/threads', { method: 'GET' });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('www-authenticate')).toBe('Bearer');

    // Mounting Chat must not pull the operational API behind authentication.
    const health = await runtime.app.request('/health');
    expect(health.status).toBe(200);
  });
});
