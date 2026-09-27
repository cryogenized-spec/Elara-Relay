import { z } from 'zod';

export const entityIdSchema = z.string().uuid();
// The pinned Zod 4.0.0 executes `.transform()` even when the preceding
// `.datetime()` check fails, so a throwing transform converts malformed input
// into a raw RangeError that escapes even `safeParse` (observed as HTTP 500
// instead of 400 on every timestamp-bearing request). This transform is
// therefore total: unparseable input records a Zod issue and returns z.NEVER
// instead of throwing.
export const timestampSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value, ctx) => {
    const time = Date.parse(value);
    if (Number.isNaN(time)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid ISO datetime',
      });
      return z.NEVER;
    }
    return new Date(time).toISOString();
  });
export const revisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export type EntityId = z.infer<typeof entityIdSchema>;
export type Timestamp = z.infer<typeof timestampSchema>;
