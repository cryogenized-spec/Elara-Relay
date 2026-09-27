import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  entityIdSchema,
  revisionSchema,
  timestampSchema,
  type Timestamp,
} from './shared';

describe('shared contracts', () => {
  it('normalizes valid ISO datetimes with offsets to UTC', () => {
    expect(timestampSchema.parse('2026-09-24T09:00:00.000Z')).toBe(
      '2026-09-24T09:00:00.000Z',
    );
    expect(timestampSchema.parse('2026-09-24T11:00:00+02:00')).toBe(
      '2026-09-24T09:00:00.000Z',
    );
    const normalized: Timestamp = timestampSchema.parse(
      '2026-09-24T09:00:00.000Z',
    );
    expect(typeof normalized).toBe('string');
  });

  it('rejects malformed timestamps with a ZodError instead of throwing RangeError', () => {
    for (const value of [
      '',
      'garbage',
      '2026-13-45',
      '2026-01-01',
      '32nd of Never',
      '999999999999999999999',
    ]) {
      let thrown: unknown;
      try {
        timestampSchema.parse(value);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ZodError);

      // safeParse must report failure, never throw. A throwing transform here
      // previously escaped as RangeError and surfaced as HTTP 500.
      expect(() => timestampSchema.safeParse(value)).not.toThrow();
      expect(timestampSchema.safeParse(value).success).toBe(false);
    }
  });

  it('rejects naive datetimes without an explicit offset', () => {
    expect(timestampSchema.safeParse('2026-09-24T09:00:00').success).toBe(
      false,
    );
  });

  it('keeps entity ids and revisions strict', () => {
    expect(
      entityIdSchema.safeParse('10000000-0000-4000-8000-000000000001')
        .success,
    ).toBe(true);
    expect(entityIdSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(revisionSchema.safeParse(1).success).toBe(true);
    expect(revisionSchema.safeParse(0).success).toBe(false);
  });
});
