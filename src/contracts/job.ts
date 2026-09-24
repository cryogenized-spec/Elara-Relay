import { z } from 'zod';
import { entityIdSchema, revisionSchema, timestampSchema } from './shared';

export const jobCategorySchema = z.enum([
  'INBOX',
  'ACTIVE',
  'WAITING',
  'DONE',
  'CANCELLED',
]);

export const jobKeySchema = z.string().regex(/^JOB-[A-F0-9]{8}$/);

export const jobSchema = z
  .object({
    id: entityIdSchema,
    key: jobKeySchema,
    title: z.string().trim().min(1).max(240),
    category: jobCategorySchema,
    partyId: entityIdSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    revision: revisionSchema,
  })
  .strict();

export const createJobInputSchema = z
  .object({
    title: jobSchema.shape.title,
    category: jobCategorySchema.default('INBOX'),
    partyId: entityIdSchema.nullable().default(null),
  })
  .strict();

export type Job = z.infer<typeof jobSchema>;
export type JobCategory = z.infer<typeof jobCategorySchema>;
export type CreateJobInput = z.infer<typeof createJobInputSchema>;
