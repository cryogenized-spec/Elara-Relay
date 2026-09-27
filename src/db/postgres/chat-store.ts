import {
  chatMessageSchema,
  chatThreadSchema,
  type ChatMessage,
  type ChatThread,
} from '../../contracts/chat';
import {
  ChatTurnConflictError,
  type ChatTurnConflictReason,
} from '../../domain/chat-kernel';
import type {
  ChatRead,
  ChatStore,
  ChatTransaction,
  ChatTurnMessages,
} from '../../domain/chat-store';
import { StoredRecordError } from '../../domain/errors';
import type { MaybePromise } from '../../domain/store';
import type { SqlClient, SqlPool } from './postgres-store';

function rowRecord(row: unknown): Record<string, unknown> {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    throw new TypeError('Database row must be an object');
  }
  return row as Record<string, unknown>;
}

function timestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  throw new TypeError('Database timestamp is invalid');
}

function nullableTimestamp(value: unknown): string | null {
  return value === null ? null : timestamp(value);
}

function safeInteger(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed)) {
    throw new TypeError('Database integer is outside the safe range');
  }
  return parsed;
}

function nullableInteger(value: unknown): number | null {
  return value === null ? null : safeInteger(value);
}

function mapThread(row: unknown): ChatThread {
  const value = rowRecord(row);
  const result = chatThreadSchema.safeParse({
    id: value['id'],
    ownerId: value['ownerId'],
    title: value['title'] ?? null,
    createdAt: timestamp(value['createdAt']),
    updatedAt: timestamp(value['updatedAt']),
    revision: safeInteger(value['revision']),
  });
  if (!result.success) throw new StoredRecordError('ChatThread');
  return result.data;
}

function mapMessage(row: unknown): ChatMessage {
  const value = rowRecord(row);
  const result = chatMessageSchema.safeParse({
    id: value['id'],
    threadId: value['threadId'],
    ownerId: value['ownerId'],
    turnId: value['turnId'],
    role: value['role'],
    status: value['status'],
    content: value['content'] ?? '',
    providerId: value['providerId'] ?? null,
    modelId: value['modelId'] ?? null,
    generationId: value['generationId'] ?? null,
    createdAt: timestamp(value['createdAt']),
    completedAt: nullableTimestamp(value['completedAt']),
    inputTokens: nullableInteger(value['inputTokens']),
    outputTokens: nullableInteger(value['outputTokens']),
    failureCode: value['failureCode'] ?? null,
  });
  if (!result.success) throw new StoredRecordError('ChatMessage');
  return result.data;
}

const CHAT_THREAD_SELECT = `
  select
    id::text as "id",
    owner_id::text as "ownerId",
    title,
    created_at as "createdAt",
    updated_at as "updatedAt",
    revision::text as "revision"
  from public.chat_threads
`;

const CHAT_MESSAGE_SELECT = `
  select
    id::text as "id",
    thread_id::text as "threadId",
    owner_id::text as "ownerId",
    turn_id::text as "turnId",
    role,
    status,
    content,
    provider_id as "providerId",
    model_id as "modelId",
    generation_id::text as "generationId",
    created_at as "createdAt",
    completed_at as "completedAt",
    input_tokens::text as "inputTokens",
    output_tokens::text as "outputTokens",
    failure_code as "failureCode"
  from public.chat_messages
`;

// History is chronological. `turn_id` keeps a turn contiguous when two turns
// share a creation instant, and the role rank keeps the user's question ahead
// of the answer it produced.
const MESSAGE_ORDER = `order by created_at, turn_id, case role when 'USER' then 0 else 1 end, id`;

class PostgresChatRead implements ChatRead {
  public constructor(
    protected readonly client: SqlClient,
    private readonly lockRows: boolean,
  ) {}

  protected lock(suffix: string): string {
    return this.lockRows ? `${suffix} for update` : suffix;
  }

  public async getThread(
    ownerId: string,
    threadId: string,
  ): Promise<ChatThread | undefined> {
    const result = await this.client.query(
      this.lock(
        `${CHAT_THREAD_SELECT} where id = $1 and owner_id = $2`,
      ),
      [threadId, ownerId],
    );
    return result.rows[0] === undefined ? undefined : mapThread(result.rows[0]);
  }

  public async listThreads(
    ownerId: string,
    limit: number,
  ): Promise<ChatThread[]> {
    const result = await this.client.query(
      `${CHAT_THREAD_SELECT} where owner_id = $1 order by updated_at desc, id desc limit $2`,
      [ownerId, limit],
    );
    return result.rows.map(mapThread);
  }

  public async listMessages(
    ownerId: string,
    threadId: string,
  ): Promise<ChatMessage[]> {
    const result = await this.client.query(
      this.lock(
        `${CHAT_MESSAGE_SELECT} where thread_id = $1 and owner_id = $2 ${MESSAGE_ORDER}`,
      ),
      [threadId, ownerId],
    );
    return result.rows.map(mapMessage);
  }

  public async findTurnMessages(
    ownerId: string,
    threadId: string,
    turnId: string,
  ): Promise<ChatTurnMessages | undefined> {
    const result = await this.client.query(
      this.lock(
        `${CHAT_MESSAGE_SELECT} where thread_id = $1 and owner_id = $2 and turn_id = $3`,
      ),
      [threadId, ownerId, turnId],
    );
    const messages = result.rows.map(mapMessage);
    const userMessage = messages.find((message) => message.role === 'USER');
    const assistantMessage = messages.find(
      (message) => message.role === 'ASSISTANT',
    );
    if (userMessage === undefined || assistantMessage === undefined) {
      return undefined;
    }
    return { userMessage, assistantMessage };
  }

  public async getMessage(
    ownerId: string,
    messageId: string,
  ): Promise<ChatMessage | undefined> {
    const result = await this.client.query(
      this.lock(
        `${CHAT_MESSAGE_SELECT} where id = $1 and owner_id = $2`,
      ),
      [messageId, ownerId],
    );
    return result.rows[0] === undefined
      ? undefined
      : mapMessage(result.rows[0]);
  }
}

class PostgresChatTransaction
  extends PostgresChatRead
  implements ChatTransaction
{
  public constructor(client: SqlClient) {
    super(client, true);
  }

  public async insertThread(thread: ChatThread): Promise<void> {
    await this.client.query(
      `insert into public.chat_threads
        (id, owner_id, title, created_at, updated_at, revision)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        thread.id,
        thread.ownerId,
        thread.title,
        thread.createdAt,
        thread.updatedAt,
        thread.revision,
      ],
    );
  }

  public async advanceThreadRevision(
    thread: ChatThread,
    expectedRevision: number,
  ): Promise<boolean> {
    const result = await this.client.query(
      `update public.chat_threads
       set revision = $4, updated_at = $5
       where id = $1 and owner_id = $2 and revision = $3`,
      [thread.id, thread.ownerId, expectedRevision, thread.revision, thread.updatedAt],
    );
    return result.rowCount === 1;
  }

  public async insertMessage(message: ChatMessage): Promise<void> {
    await this.client.query(
      `insert into public.chat_messages
        (id, thread_id, owner_id, turn_id, role, status, content,
         provider_id, model_id, generation_id, created_at, completed_at,
         input_tokens, output_tokens, failure_code)
       values (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12,
         $13, $14, $15
       )`,
      [
        message.id,
        message.threadId,
        message.ownerId,
        message.turnId,
        message.role,
        message.status,
        message.content,
        message.providerId,
        message.modelId,
        message.generationId,
        message.createdAt,
        message.completedAt,
        message.inputTokens,
        message.outputTokens,
        message.failureCode,
      ],
    );
  }

  public async completeMessage(message: ChatMessage): Promise<boolean> {
    const result = await this.client.query(
      `update public.chat_messages
       set status = 'COMPLETED', content = $3, completed_at = $4,
           input_tokens = $5, output_tokens = $6
       where id = $1 and owner_id = $2 and role = 'ASSISTANT'
         and status = 'PENDING'`,
      [
        message.id,
        message.ownerId,
        message.content,
        message.completedAt,
        message.inputTokens,
        message.outputTokens,
      ],
    );
    return result.rowCount === 1;
  }

  public async failMessage(message: ChatMessage): Promise<boolean> {
    const result = await this.client.query(
      `update public.chat_messages
       set status = 'FAILED', content = '', completed_at = $3,
           failure_code = $4
       where id = $1 and owner_id = $2 and role = 'ASSISTANT'
         and status = 'PENDING'`,
      [message.id, message.ownerId, message.completedAt, message.failureCode],
    );
    return result.rowCount === 1;
  }
}

// A turn identity or generation identity can only be claimed once. That is a
// client-meaningful conflict, never a server fault.
const UNIQUE_CONFLICTS: Readonly<
  Record<string, ChatTurnConflictReason>
> = {
  chat_threads_pkey: 'THREAD_REPLAY_MISMATCH',
  chat_messages_pkey: 'TURN_REPLAY_MISMATCH',
  chat_messages_thread_id_turn_id_role_key: 'TURN_REPLAY_MISMATCH',
  chat_messages_generation_id_key: 'TURN_REPLAY_MISMATCH',
};

function postgresDiagnostic(
  error: unknown,
  key: 'code' | 'constraint',
): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value: unknown = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function mapChatError(error: unknown): unknown {
  if (postgresDiagnostic(error, 'code') !== '23505') return error;
  const constraint = postgresDiagnostic(error, 'constraint');
  const reason =
    constraint === null ? undefined : UNIQUE_CONFLICTS[constraint];
  return new ChatTurnConflictError(reason ?? 'TURN_REPLAY_MISMATCH');
}

async function rollback(
  client: SqlClient,
  originalError: unknown,
): Promise<never> {
  try {
    await client.query('rollback');
  } catch (rollbackError) {
    throw new AggregateError(
      [originalError, rollbackError],
      'Chat transaction and rollback both failed',
      { cause: rollbackError },
    );
  }
  throw originalError;
}

/**
 * Durable owner-scoped Chat repository.
 *
 * Every statement is filtered by the verified owner id, so a caller-supplied
 * owner can never widen a read or a write. Row-level security stays enabled
 * and browser roles keep no privileges on these tables; this adapter is the
 * only writer.
 */
export class PostgresChatStore implements ChatStore {
  public constructor(private readonly pool: SqlPool) {}

  public async transact<T>(
    work: (transaction: ChatTransaction) => MaybePromise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      try {
        const result = await work(new PostgresChatTransaction(client));
        await client.query('commit');
        return result;
      } catch (error) {
        return await rollback(client, mapChatError(error));
      }
    } finally {
      client.release();
    }
  }

  public async read<T>(
    work: (read: ChatRead) => MaybePromise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      try {
        const result = await work(new PostgresChatRead(client, false));
        await client.query('commit');
        return result;
      } catch (error) {
        return await rollback(client, error);
      }
    } finally {
      client.release();
    }
  }
}
