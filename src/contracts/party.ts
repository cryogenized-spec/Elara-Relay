import { z } from 'zod';
import { entityIdSchema, revisionSchema, timestampSchema } from './shared';

export const partyKindSchema = z.enum([
  'CUSTOMER',
  'SUPPLIER',
  'COLLEAGUE',
  'OTHER',
]);

export const partySchema = z
  .object({
    id: entityIdSchema,
    name: z.string().trim().min(1).max(200),
    kind: partyKindSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    revision: revisionSchema,
  })
  .strict();

export const createPartyInputSchema = partySchema
  .pick({
    name: true,
    kind: true,
  })
  .strict();

export type Party = z.infer<typeof partySchema>;
export type PartyKind = z.infer<typeof partyKindSchema>;
export type CreatePartyInput = z.infer<typeof createPartyInputSchema>;
