import { describe, expect, it } from 'vitest';

import {
  MEMORY_CONTRACT_VERSION,
  NullMemoryProvider,
  type MemoryRecallRequest,
  type MemoryWrite,
} from './memory-provider';

const scope = {
  ownerId: 'operator-1',
  tags: ['job:job-1', 'source:domain-event'],
} as const;

describe('memory provider contract', () => {
  it('exposes an explicit contract version', () => {
    expect(MEMORY_CONTRACT_VERSION).toBe(1);
  });

  it('allows the null provider to accept retention without persistence', async () => {
    const provider = new NullMemoryProvider();

    const write: MemoryWrite = {
      documentId: 'event:event-1',
      content: 'Repair moved from Diagnosing to Repairing.',
      context: 'Authoritative Elara domain event',
      timestamp: '2026-09-27T06:00:00.000Z',
      scope,
      source: {
        kind: 'domain-event',
        id: 'event-1',
        occurredAt: '2026-09-27T06:00:00.000Z',
        jobId: 'job-1',
        repairId: 'repair-1',
      },
    };

    await expect(provider.retain(write)).resolves.toBeUndefined();
  });

  it('returns an explicit empty result when memory is unavailable', async () => {
    const provider = new NullMemoryProvider();

    const request: MemoryRecallRequest = {
      query: 'What happened with this repair?',
      scope,
      maxTokens: 2048,
      queryTimestamp: '2026-09-27T06:05:00.000Z',
    };

    await expect(provider.recall(request)).resolves.toEqual({
      hits: [],
      truncated: false,
    });
  });
});
