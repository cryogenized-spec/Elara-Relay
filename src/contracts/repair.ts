import { z } from 'zod';
import {
  entityIdSchema,
  revisionSchema,
  timestampSchema,
} from './shared';

export const repairStageSchema = z.enum([
  'RECEIVED',
  'DIAGNOSING',
  'AWAITING_PARTS',
  'AWAITING_CUSTOMER',
  'REPAIRING',
  'TESTING',
  'READY',
  'COLLECTED',
  'CANCELLED',
]);

export const repairSerialStateSchema = z.enum([
  'KNOWN',
  'UNKNOWN',
  'NOT_APPLICABLE',
]);

export const repairTestResultSchema = z.enum(['PASS', 'FAIL']);

const nullableText = (max: number) =>
  z.string().trim().min(1).max(max).nullable();

export const repairSchema = z
  .object({
    id: entityIdSchema,
    jobId: entityIdSchema,
    stage: repairStageSchema,
    reportedFault: z.string().trim().min(1).max(4000),
    diagnosis: nullableText(4000),
    currentFinding: nullableText(4000),
    serialState: repairSerialStateSchema,
    serialValue: nullableText(120),
    storageLocation: nullableText(200),
    waitingOn: nullableText(240),
    followUpAt: timestampSchema.nullable(),
    finalTestResult: repairTestResultSchema.nullable(),
    finalTestDetail: nullableText(4000),
    testedAt: timestampSchema.nullable(),
    receivedAt: timestampSchema,
    readyAt: timestampSchema.nullable(),
    collectedAt: timestampSchema.nullable(),
    cancelledAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    revision: revisionSchema,
  })
  .strict()
  .superRefine((repair, context) => {
    if (
      (repair.serialState === 'KNOWN' && repair.serialValue === null) ||
      (repair.serialState !== 'KNOWN' && repair.serialValue !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['serialValue'],
        message:
          'Known serials require a value; unknown/not-applicable serials must not retain one',
      });
    }

    const waiting =
      repair.stage === 'AWAITING_PARTS' ||
      repair.stage === 'AWAITING_CUSTOMER';
    if (
      (waiting &&
        (repair.waitingOn === null || repair.followUpAt === null)) ||
      (!waiting &&
        (repair.waitingOn !== null || repair.followUpAt !== null))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['waitingOn'],
        message:
          'Waiting repair stages require waitingOn and followUpAt; other stages must clear them',
      });
    }

    if (
      (repair.finalTestResult === null) !==
      (repair.testedAt === null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['finalTestResult'],
        message: 'Final test result and testedAt must be recorded together',
      });
    }

    if (
      (repair.stage === 'READY' || repair.stage === 'COLLECTED') &&
      repair.finalTestResult !== 'PASS'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['finalTestResult'],
        message: 'Ready or collected repairs require a passing final test',
      });
    }

    if (
      (repair.stage === 'READY' || repair.stage === 'COLLECTED') !==
      (repair.readyAt !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['readyAt'],
        message:
          'readyAt must exist exactly while the repair is ready or collected',
      });
    }

    if (
      (repair.stage === 'COLLECTED') !==
      (repair.collectedAt !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['collectedAt'],
        message: 'collectedAt must exist exactly for collected repairs',
      });
    }

    if (
      (repair.stage === 'CANCELLED') !==
      (repair.cancelledAt !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['cancelledAt'],
        message: 'cancelledAt must exist exactly for cancelled repairs',
      });
    }
  });

export const createRepairInputSchema = z
  .object({
    jobId: entityIdSchema,
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

export const repairDetailsPatchSchema = z
  .object({
    reportedFault: repairSchema.shape.reportedFault.optional(),
    diagnosis: repairSchema.shape.diagnosis.optional(),
    currentFinding: repairSchema.shape.currentFinding.optional(),
    serialState: repairSerialStateSchema.optional(),
    serialValue: repairSchema.shape.serialValue.optional(),
    storageLocation: repairSchema.shape.storageLocation.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Repair detail patch must contain at least one field',
  });

export const moveRepairStageInputSchema = z
  .object({
    stage: repairStageSchema,
    waitingOn: repairSchema.shape.waitingOn.optional(),
    followUpAt: repairSchema.shape.followUpAt.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const waiting =
      input.stage === 'AWAITING_PARTS' ||
      input.stage === 'AWAITING_CUSTOMER';

    if (waiting) {
      if (input.waitingOn === undefined || input.waitingOn === null) {
        context.addIssue({
          code: 'custom',
          path: ['waitingOn'],
          message: 'Waiting stage requires waitingOn',
        });
      }
      if (input.followUpAt === undefined || input.followUpAt === null) {
        context.addIssue({
          code: 'custom',
          path: ['followUpAt'],
          message: 'Waiting stage requires followUpAt',
        });
      }
    } else if (
      input.waitingOn !== undefined ||
      input.followUpAt !== undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['waitingOn'],
        message:
          'waitingOn/followUpAt may only be supplied for a waiting stage',
      });
    }
  });

export const recordRepairTestInputSchema = z
  .object({
    result: repairTestResultSchema,
    detail: repairSchema.shape.finalTestDetail.default(null),
  })
  .strict();

export const repairWarningSchema = z.enum(['SERIAL_UNKNOWN']);

export type Repair = z.infer<typeof repairSchema>;
export type RepairStage = z.infer<typeof repairStageSchema>;
export type RepairSerialState = z.infer<typeof repairSerialStateSchema>;
export type RepairTestResult = z.infer<typeof repairTestResultSchema>;
export type CreateRepairInput = z.infer<typeof createRepairInputSchema>;
export type RepairDetailsPatch = z.infer<typeof repairDetailsPatchSchema>;
export type MoveRepairStageInput = z.infer<
  typeof moveRepairStageInputSchema
>;
export type RecordRepairTestInput = z.infer<
  typeof recordRepairTestInputSchema
>;
export type RepairWarning = z.infer<typeof repairWarningSchema>;
