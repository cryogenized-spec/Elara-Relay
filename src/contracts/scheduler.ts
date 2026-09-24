import { z } from 'zod';
import {
  entityIdSchema,
  revisionSchema,
  timestampSchema,
} from './shared';

export const schedulerTimezoneSchema = z.literal('Africa/Johannesburg');

export const scheduledActionTypeSchema = z.enum([
  'REMINDER',
  'DIGEST',
  'EMAIL',
]);

export const scheduledActionStatusSchema = z.enum([
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
]);

export const recurrenceRuleSchema = z
  .string()
  .regex(
    /^FREQ=(DAILY|WEEKLY);INTERVAL=([1-9][0-9]{0,2})$/,
    'Recurrence must use FREQ=DAILY|WEEKLY;INTERVAL=1..999',
  );

export const reminderPayloadSchema = z
  .object({
    kind: z.literal('REMINDER'),
    message: z.string().trim().min(1).max(4000),
  })
  .strict();

export const digestPayloadSchema = z
  .object({
    kind: z.literal('DIGEST'),
    scope: z.literal('TODAY'),
  })
  .strict();

export const emailPayloadSchema = z
  .object({
    kind: z.literal('EMAIL'),
    recipient: z.literal('OWNER'),
    subject: z.string().trim().min(1).max(240),
    body: z.string().trim().min(1).max(12000),
  })
  .strict();

export const scheduledActionPayloadSchema = z.discriminatedUnion('kind', [
  reminderPayloadSchema,
  digestPayloadSchema,
  emailPayloadSchema,
]);

const scheduledActionObjectSchema = z
  .object({
    id: entityIdSchema,
    jobId: entityIdSchema.nullable(),
    taskId: entityIdSchema.nullable(),
    title: z.string().trim().min(1).max(240),
    actionType: scheduledActionTypeSchema,
    payload: scheduledActionPayloadSchema,
    timezone: schedulerTimezoneSchema,
    recurrenceRule: recurrenceRuleSchema.nullable(),
    status: scheduledActionStatusSchema,
    runAt: timestampSchema,
    nextRunAt: timestampSchema.nullable(),
    lastRunAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    revision: revisionSchema,
  })
  .strict();

export const scheduledActionSchema =
  scheduledActionObjectSchema.superRefine((action, context) => {
    if (action.actionType !== action.payload.kind) {
      context.addIssue({
        code: 'custom',
        path: ['payload'],
        message: 'Scheduled action payload kind must match actionType',
      });
    }

    const terminal =
      action.status === 'COMPLETED' || action.status === 'CANCELLED';
    if (terminal !== (action.nextRunAt === null)) {
      context.addIssue({
        code: 'custom',
        path: ['nextRunAt'],
        message:
          'Completed/cancelled actions must clear nextRunAt; active/paused actions require it',
      });
    }
  });

export const createScheduledActionInputSchema = z
  .object({
    jobId: entityIdSchema.nullable().default(null),
    taskId: entityIdSchema.nullable().default(null),
    title: scheduledActionObjectSchema.shape.title,
    actionType: scheduledActionTypeSchema,
    payload: scheduledActionPayloadSchema,
    timezone: schedulerTimezoneSchema.default('Africa/Johannesburg'),
    recurrenceRule: recurrenceRuleSchema.nullable().default(null),
    runAt: timestampSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.actionType !== input.payload.kind) {
      context.addIssue({
        code: 'custom',
        path: ['payload'],
        message: 'Scheduled action payload kind must match actionType',
      });
    }
  });

export const updateScheduledActionPatchSchema = z
  .object({
    jobId: entityIdSchema.nullable().optional(),
    taskId: entityIdSchema.nullable().optional(),
    title: scheduledActionObjectSchema.shape.title.optional(),
    actionType: scheduledActionTypeSchema.optional(),
    payload: scheduledActionPayloadSchema.optional(),
    recurrenceRule: recurrenceRuleSchema.nullable().optional(),
    runAt: timestampSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Scheduled action patch must contain at least one field',
  });

export const scheduledActionRunStatusSchema = z.enum([
  'CLAIMED',
  'SUCCEEDED',
  'FAILED',
]);

export const scheduledActionRunSchema = z
  .object({
    id: entityIdSchema,
    scheduledActionId: entityIdSchema,
    occurrenceKey: z.string().min(1).max(220),
    scheduledFor: timestampSchema,
    status: scheduledActionRunStatusSchema,
    leaseToken: entityIdSchema,
    workerId: z.string().trim().min(1).max(160),
    leaseExpiresAt: timestampSchema,
    attempt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    providerMessageId: z.string().trim().min(1).max(500).nullable(),
    errorCode: z.string().trim().min(1).max(120).nullable(),
    errorDetail: z.string().trim().min(1).max(4000).nullable(),
    claimedAt: timestampSchema,
    completedAt: timestampSchema.nullable(),
  })
  .strict()
  .superRefine((run, context) => {
    if (
      run.status === 'CLAIMED' &&
      (run.completedAt !== null ||
        run.providerMessageId !== null ||
        run.errorCode !== null ||
        run.errorDetail !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Claimed runs cannot contain completion metadata',
      });
    }

    if (run.status === 'SUCCEEDED') {
      if (
        run.completedAt === null ||
        run.errorCode !== null ||
        run.errorDetail !== null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['status'],
          message: 'Succeeded runs require completedAt and no error metadata',
        });
      }
    }

    if (run.status === 'FAILED') {
      if (
        run.completedAt === null ||
        run.errorCode === null ||
        run.providerMessageId !== null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['status'],
          message:
          'Failed runs require completedAt/errorCode and cannot retain providerMessageId',
        });
      }
    }
  });

export const claimScheduledActionInputSchema = z
  .object({
    asOf: timestampSchema,
    workerId: z.string().trim().min(1).max(160),
    leaseSeconds: z.number().int().min(30).max(3600).default(300),
  })
  .strict();

export const recordScheduledActionSuccessInputSchema = z
  .object({
    runId: entityIdSchema,
    leaseToken: entityIdSchema,
    completedAt: timestampSchema,
    providerMessageId: z.string().trim().min(1).max(500).nullable().default(null),
  })
  .strict();

export const recordScheduledActionFailureInputSchema = z
  .object({
    runId: entityIdSchema,
    leaseToken: entityIdSchema,
    completedAt: timestampSchema,
    errorCode: z.string().trim().min(1).max(120),
    errorDetail: z.string().trim().min(1).max(4000).nullable().default(null),
  })
  .strict();

export type ScheduledAction = z.infer<typeof scheduledActionSchema>;
export type ScheduledActionType = z.infer<typeof scheduledActionTypeSchema>;
export type ScheduledActionStatus = z.infer<typeof scheduledActionStatusSchema>;
export type ScheduledActionPayload = z.infer<
  typeof scheduledActionPayloadSchema
>;
export type CreateScheduledActionInput = z.infer<
  typeof createScheduledActionInputSchema
>;
export type UpdateScheduledActionPatch = z.infer<
  typeof updateScheduledActionPatchSchema
>;
export type ScheduledActionRun = z.infer<typeof scheduledActionRunSchema>;
export type ClaimScheduledActionInput = z.infer<
  typeof claimScheduledActionInputSchema
>;
export type RecordScheduledActionSuccessInput = z.infer<
  typeof recordScheduledActionSuccessInputSchema
>;
export type RecordScheduledActionFailureInput = z.infer<
  typeof recordScheduledActionFailureInputSchema
>;
