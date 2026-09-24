import { z } from 'zod';

export const entityIdSchema = z.string().uuid();
export const timestampSchema = z.string().datetime({ offset: true });
export const revisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export type EntityId = z.infer<typeof entityIdSchema>;
export type Timestamp = z.infer<typeof timestampSchema>;
