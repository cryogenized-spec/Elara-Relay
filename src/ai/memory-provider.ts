export const MEMORY_CONTRACT_VERSION = 1 as const;

export type MemorySourceKind =
  | 'conversation'
  | 'domain-event'
  | 'document'
  | 'note';

export type MemoryLayer = 'fact' | 'observation' | 'standing-context';

export interface MemoryScope {
  readonly ownerId: string;
  readonly tags: readonly string[];
}

export interface MemorySourceRef {
  readonly kind: MemorySourceKind;
  readonly id: string;
  readonly occurredAt?: string;
  readonly partyId?: string;
  readonly jobId?: string;
  readonly taskId?: string;
  readonly repairId?: string;
  readonly scheduledActionId?: string;
}

export interface MemoryWrite {
  readonly documentId: string;
  readonly content: string;
  readonly context: string;
  readonly timestamp?: string;
  readonly scope: MemoryScope;
  readonly source: MemorySourceRef;
}

export interface MemoryRecallRequest {
  readonly query: string;
  readonly scope: MemoryScope;
  readonly maxTokens: number;
  readonly queryTimestamp?: string;
}

export interface MemoryEvidenceRef {
  readonly source: MemorySourceRef;
  readonly quote?: string;
}

export interface MemoryHit {
  readonly id: string;
  readonly content: string;
  readonly layer: MemoryLayer;
  readonly tags: readonly string[];
  readonly occurredAt?: string;
  readonly learnedAt?: string;
  readonly evidence: readonly MemoryEvidenceRef[];
}

export interface MemoryRecallResult {
  readonly hits: readonly MemoryHit[];
  readonly truncated: boolean;
}

export interface MemoryProvider {
  retain(input: MemoryWrite): Promise<void>;
  recall(input: MemoryRecallRequest): Promise<MemoryRecallResult>;
}

export class NullMemoryProvider implements MemoryProvider {
  public async retain(_input: MemoryWrite): Promise<void> {
    return Promise.resolve();
  }

  public async recall(
    _input: MemoryRecallRequest,
  ): Promise<MemoryRecallResult> {
    return Promise.resolve({
      hits: [],
      truncated: false,
    });
  }
}
