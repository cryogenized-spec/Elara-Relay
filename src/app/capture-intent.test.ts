import { describe, expect, it } from 'vitest';
import {
  johannesburgIsoToLocalDateTimeInput,
  johannesburgLocalDateTimeToIso,
  resolveMutationAttempt,
} from './capture-intent';

describe('Capture mutation intent', () => {
  it('reuses one mutation id for an unchanged retry', () => {
    let calls = 0;
    const createId = () => {
      calls += 1;
      return `MUT-10000000-0000-4000-8000-${String(calls).padStart(12, '0')}`;
    };

    const first = resolveMutationAttempt(
      null,
      { title: 'Check stock', jobId: null },
      createId,
    );
    const retry = resolveMutationAttempt(
      first,
      { title: 'Check stock', jobId: null },
      createId,
    );
    expect(retry).toBe(first);
    expect(calls).toBe(1);

    const changed = resolveMutationAttempt(
      retry,
      { title: 'Check stock today', jobId: null },
      createId,
    );
    expect(changed.mutationId).not.toBe(first.mutationId);
    expect(calls).toBe(2);
  });

  it('formats persisted timestamps back into Johannesburg form values', () => {
    expect(
      johannesburgIsoToLocalDateTimeInput('2026-09-26T12:30:00.000Z'),
    ).toBe('2026-09-26T14:30');
    expect(johannesburgIsoToLocalDateTimeInput(null)).toBe('');
    expect(() => johannesburgIsoToLocalDateTimeInput('not-a-date')).toThrow(
      'Timestamp is invalid',
    );
  });

  it('interprets Capture wall time as Africa/Johannesburg', () => {
    expect(johannesburgLocalDateTimeToIso('2026-09-26T14:30')).toBe(
      '2026-09-26T12:30:00.000Z',
    );
    expect(johannesburgLocalDateTimeToIso('')).toBeNull();
    expect(() => johannesburgLocalDateTimeToIso('26/09/2026 14:30')).toThrow();
    expect(() => johannesburgLocalDateTimeToIso('2026-02-31T14:30')).toThrow(
      'Date and time is invalid',
    );
    expect(() => johannesburgLocalDateTimeToIso('2026-09-26T24:00')).toThrow(
      'Date and time is invalid',
    );
  });
});
