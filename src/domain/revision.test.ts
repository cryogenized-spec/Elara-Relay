import { describe, expect, it } from 'vitest';
import { nextRevision, RevisionConflictError } from './revision';

describe('optimistic revision gate', () => {
  it('increments exactly once when the expected revision matches', () => {
    expect(nextRevision(7, 7)).toBe(8);
  });

  it('rejects a stale writer instead of clobbering newer state', () => {
    expect(() => nextRevision(8, 7)).toThrow(RevisionConflictError);
  });

  it('rejects invalid revisions', () => {
    expect(() => nextRevision(-1, 0)).toThrow(RangeError);
    expect(() => nextRevision(0, -1)).toThrow(RangeError);
    expect(() =>
      nextRevision(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    ).toThrow(RangeError);
    expect(() => nextRevision(Number.MAX_SAFE_INTEGER + 1, 0)).toThrow(
      RangeError,
    );
    expect(() => nextRevision(0, -1)).toThrow(RangeError);
  });
});
