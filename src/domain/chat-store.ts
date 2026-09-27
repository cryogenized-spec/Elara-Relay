import type {
  ChatMessage,
  ChatThread,
} from '../contracts/chat';
import type { MaybePromise } from './store';

/**
 * Durable Chat repository port.
 *
 * Every read and write is owner-scoped: `ownerId` always comes from verified
 * server-side auth, never from a request payload. A Thread owned by another
 * identity is indistinguishable from one that does not exist.
 */
export interface ChatRead {
  getThread(
    ownerId: string,
    threadId: string,
  ): MaybePromise<ChatThread | undefined>;
  listThreads(ownerId: string, limit: number): MaybePromise<ChatThread[]>;
  listMessages(
    ownerId: string,
    threadId: string,
  ): MaybePromise<ChatMessage[]>;
  findTurnMessages(
    ownerId: string,
    threadId: string,
    turnId: string,
  ): MaybePromise<ChatTurnMessages | undefined>;
  getMessage(
    ownerId: string,
    messageId: string,
  ): MaybePromise<ChatMessage | undefined>;
}

export interface ChatTurnMessages {
  readonly userMessage: ChatMessage;
  readonly assistantMessage: ChatMessage;
}

export interface ChatTransaction extends ChatRead {
  insertThread(thread: ChatThread): MaybePromise<void>;
  /**
   * Advances the Thread revision from `expectedRevision`; resolves false when
   * the stored row no longer matches, so only one generation can win.
   */
  advanceThreadRevision(
    thread: ChatThread,
    expectedRevision: number,
  ): MaybePromise<boolean>;
  insertMessage(message: ChatMessage): MaybePromise<void>;
  /** Pending-only terminal transition; resolves false when already finalized. */
  completeMessage(message: ChatMessage): MaybePromise<boolean>;
  /** Pending-only terminal transition; resolves false when already finalized. */
  failMessage(message: ChatMessage): MaybePromise<boolean>;
}

export interface ChatStore {
  transact<T>(work: (transaction: ChatTransaction) => MaybePromise<T>): Promise<T>;
  read<T>(work: (read: ChatRead) => MaybePromise<T>): Promise<T>;
}
