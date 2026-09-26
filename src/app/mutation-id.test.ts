import { describe, expect, it } from 'vitest';
import { createMutationId } from './mutation-id';

describe('browser mutation ids', () => {
  it('creates a replay-safe mutation id from one stable UUID', () => {
    expect(
      createMutationId(
        () => '10000000-0000-4000-8000-000000000001',
      ),
    ).toBe('MUT-10000000-0000-4000-8000-000000000001');
  });

  it('rejects malformed injected randomness', () => {
    expect(() => createMutationId(() => 'bad value')).toThrow();
  });
});
