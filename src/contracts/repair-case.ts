import { z } from 'zod';
import { jobSchema } from './job';
import { partySchema } from './party';
import {
  repairSchema,
  repairSerialStateSchema,
} from './repair';
import { entityIdSchema } from './shared';

const existingPartySchema = z
  .object({
    mode: z.literal('EXISTING'),
    partyId: entityIdSchema,
  })
  .strict();

const newCustomerSchema = z
  .object({
    mode: z.literal('NEW_CUSTOMER'),
    name: partySchema.shape.name,
  })
  .strict();

export const createRepairCaseInputSchema = z
  .object({
    party: z.discriminatedUnion('mode', [
      existingPartySchema,
      newCustomerSchema,
    ]),
    jobTitle: jobSchema.shape.title,
    reportedFault: repairSchema.shape.reportedFault,
    serialState: repairSerialStateSchema.default('UNKNOWN'),
    serialValue: repairSchema.shape.serialValue.default(null),
    storageLocation: repairSchema.shape.storageLocation.default(null),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      (input.serialState === 'KNOWN' && input.serialValue === null) ||
      (input.serialState !== 'KNOWN' && input.serialValue !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['serialValue'],
        message:
          'Known serials require a value; unknown/not-applicable serials must not retain one',
      });
    }
  });

export const repairCaseResultSchema = z
  .object({
    party: partySchema,
    job: jobSchema,
    repair: repairSchema,
  })
  .strict();

export type CreateRepairCaseInput = z.infer<
  typeof createRepairCaseInputSchema
>;
export type RepairCaseResult = z.infer<typeof repairCaseResultSchema>;
