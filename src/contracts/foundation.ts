import { z } from 'zod';

export const mutationActorSchema = z.enum([
  'operator-ui',
  'chatgpt',
  'embedded-ai',
  'system',
]);

export const mutationEnvelopeSchema = z
  .object({
    mutationId: z
      .string()
      .min(16)
      .max(128)
      .regex(/^MUT-[A-Za-z0-9-]+$/),
    expectedRevision: z.number().int().nonnegative(),
    actor: mutationActorSchema,
  })
  .strict();

export type MutationEnvelope = z.infer<typeof mutationEnvelopeSchema>;
