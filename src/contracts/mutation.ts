import { z } from 'zod';
import { mutationActorSchema } from './foundation';
import { timestampSchema } from './shared';

export const mutationIdSchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^MUT-[A-Za-z0-9-]+$/);

export const mutationContextSchema = z
  .object({
    mutationId: mutationIdSchema,
    actor: mutationActorSchema,
  })
  .strict();

export const versionedMutationContextSchema = mutationContextSchema
  .extend({
    expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const mutationReceiptSchema = z
  .object({
    mutationId: mutationIdSchema,
    command: z.string().min(1).max(100),
    fingerprint: z.string().min(1),
    result: z.unknown(),
    committedAt: timestampSchema,
  })
  .strict();

export type MutationContext = z.infer<typeof mutationContextSchema>;
export type VersionedMutationContext = z.infer<
  typeof versionedMutationContextSchema
>;
export type MutationReceipt = z.infer<typeof mutationReceiptSchema>;
