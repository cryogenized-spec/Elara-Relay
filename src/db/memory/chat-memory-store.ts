import type { ChatMessage, ChatThread } from '../../contracts/chat';
import { ChatTurnConflictError } from '../../domain/chat-kernel';
import type {
  ChatRead,
  ChatStore,
  ChatTransaction,
  ChatTurnMessages,
} from '../../domain/chat-store';
import { DuplicateEntityError } from '../../domain/errors';
import type { MaybePromise } from '../../domain/store';

/**
 * In-memory Chat repository used for deterministic domain and API testing.
 * It enforces the same owner scoping, per-turn uniqueness, revision guard and
 * append-only terminal transition as the durable PostgreSQL adapter.
 */
interface MemoryChatState {
  threads: Map<string, ChatThread>;
  messages: Map<string, ChatMessage>;
}

function cloneMap<T>(map: ReadonlyMap<string, T>): Map<string, T> {
  return new Map(
    [...map.entries()].map(([key, value]) => [key, structuredClone(value)]),
  );
}

function cloneState(state: MemoryChatState): MemoryChatState {
  return {
    threads: cloneMap(state.threads),
    messages: cloneMap(state.messages),
  };
}

function sameTurnSlot(a: ChatMessage, b: ChatMessage): boolean {
  return a.turnId === b.turnId && a.role === b.role;
}

class MemoryChatView implements ChatTransaction {
  public constructor(private readonly state: MemoryChatState) {}

  public getThread(ownerId: string, threadId: string): ChatThread | undefined {
    const thread = this.state.threads.get(threadId);
    if (thread === undefined || thread.ownerId !== ownerId) return undefined;
    return structuredClone(thread);
  }

  public listThreads(ownerId: string, limit: number): ChatThread[] {
    return [...this.state.threads.values()]
      .filter((thread) => thread.ownerId === ownerId)
      .sort((left, right) => {
        if (left.updatedAt !== right.updatedAt) {
          return right.updatedAt.localeCompare(left.updatedAt);
        }
        return right.id.localeCompare(left.id);
      })
      .slice(0, limit)
      .map((thread) => structuredClone(thread));
  }

  public listMessages(ownerId: string, threadId: string): ChatMessage[] {
    return [...this.state.messages.values()]
      .filter(
        (message) =>
          message.threadId === threadId && message.ownerId === ownerId,
      )
      .sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
          return left.createdAt.localeCompare(right.createdAt);
        }
        // A turn reads contiguously, and always as question then answer.
        if (left.turnId !== right.turnId) {
          return left.turnId.localeCompare(right.turnId);
        }
        if (left.role !== right.role) return left.role === 'USER' ? -1 : 1;
        return left.id.localeCompare(right.id);
      })
      .map((message) => structuredClone(message));
  }

  public findTurnMessages(
    ownerId: string,
    threadId: string,
    turnId: string,
  ): ChatTurnMessages | undefined {
    const owned = this.listMessages(ownerId, threadId);
    const userMessage = owned.find(
      (message) => message.turnId === turnId && message.role === 'USER',
    );
    const assistantMessage = owned.find(
      (message) => message.turnId === turnId && message.role === 'ASSISTANT',
    );
    if (userMessage === undefined || assistantMessage === undefined) {
      return undefined;
    }
    return { userMessage, assistantMessage };
  }

  public getMessage(
    ownerId: string,
    messageId: string,
  ): ChatMessage | undefined {
    const message = this.state.messages.get(messageId);
    if (message === undefined || message.ownerId !== ownerId) return undefined;
    return structuredClone(message);
  }

  public insertThread(thread: ChatThread): void {
    if (this.state.threads.has(thread.id)) {
      throw new ChatTurnConflictError('THREAD_REPLAY_MISMATCH');
    }
    this.state.threads.set(thread.id, structuredClone(thread));
  }

  public advanceThreadRevision(
    thread: ChatThread,
    expectedRevision: number,
  ): boolean {
    const stored = this.state.threads.get(thread.id);
    if (
      stored === undefined ||
      stored.ownerId !== thread.ownerId ||
      stored.revision !== expectedRevision
    ) {
      return false;
    }
    this.state.threads.set(thread.id, structuredClone(thread));
    return true;
  }

  public insertMessage(message: ChatMessage): void {
    const thread = this.state.threads.get(message.threadId);
    if (thread === undefined || thread.ownerId !== message.ownerId) {
      throw new DuplicateEntityError('ChatThread', message.threadId);
    }
    if (this.state.messages.has(message.id)) {
      throw new DuplicateEntityError('ChatMessage', message.id);
    }
    for (const stored of this.state.messages.values()) {
      if (
        stored.threadId === message.threadId &&
        sameTurnSlot(stored, message)
      ) {
        throw new ChatTurnConflictError('TURN_REPLAY_MISMATCH');
      }
    }
    this.state.messages.set(message.id, structuredClone(message));
  }

  public completeMessage(message: ChatMessage): boolean {
    return this.replacePending(message);
  }

  public failMessage(message: ChatMessage): boolean {
    return this.replacePending(message);
  }

  /** Completed and failed Messages are history: only PENDING may transition. */
  private replacePending(message: ChatMessage): boolean {
    const stored = this.state.messages.get(message.id);
    if (
      stored === undefined ||
      stored.ownerId !== message.ownerId ||
      stored.status !== 'PENDING' ||
      stored.content !== ''
    ) {
      return false;
    }
    this.state.messages.set(message.id, structuredClone(message));
    return true;
  }
}

export class MemoryChatStore implements ChatStore {
  private state: MemoryChatState = {
    threads: new Map(),
    messages: new Map(),
  };

  private tail: Promise<void> = Promise.resolve();

  public async transact<T>(
    work: (transaction: ChatTransaction) => MaybePromise<T>,
  ): Promise<T> {
    const previous = this.tail;
    let release = (): void => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      const draft = cloneState(this.state);
      const result = await work(new MemoryChatView(draft));
      const safeResult = structuredClone(result);
      this.state = draft;
      return safeResult;
    } finally {
      release();
    }
  }

  public async read<T>(
    work: (read: ChatRead) => MaybePromise<T>,
  ): Promise<T> {
    await this.tail;
    const snapshot = cloneState(this.state);
    return structuredClone(await work(new MemoryChatView(snapshot)));
  }
}
