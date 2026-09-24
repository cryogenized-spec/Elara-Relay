import { z } from 'zod';
import { mutationActorSchema } from './foundation';
import { mutationIdSchema } from './mutation';
import { entityIdSchema, revisionSchema, timestampSchema } from './shared';

export const eventEntityTypeSchema = z.enum([
  'PARTY',
  'JOB',
  'TASK',
  'REPAIR',
  'SCHEDULED_ACTION',
]);

export const eventTypeSchema = z.enum([
  'PARTY_CREATED',
  'JOB_CREATED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_WAITING',
  'TASK_COMPLETED',
  'TASK_CANCELLED',
  'REPAIR_CREATED',
  'REPAIR_DETAILS_UPDATED',
  'REPAIR_STAGE_CHANGED',
  'REPAIR_TEST_RECORDED',
  'SCHEDULED_ACTION_CREATED',
  'SCHEDULED_ACTION_UPDATED',
  'SCHEDULED_ACTION_PAUSED',
  'SCHEDULED_ACTION_RESUMED',
  'SCHEDULED_ACTION_CANCELLED',
  'SCHEDULED_ACTION_RUN_CLAIMED',
  'SCHEDULED_ACTION_RUN_SUCCEEDED',
  'SCHEDULED_ACTION_RUN_FAILED',
  'JOB_NOTE',
]);

export const fieldChangeSchema = z
  .object({
    before: z.unknown(),
    after: z.unknown(),
  })
  .strict();

export const eventSchema = z
  .object({
    id: entityIdSchema,
    mutationId: mutationIdSchema,
    entityType: eventEntityTypeSchema,
    entityId: entityIdSchema,
    eventType: eventTypeSchema,
    actor: mutationActorSchema,
    occurredAt: timestampSchema,
    detail: z.string().max(4000).nullable(),
    changes: z.record(z.string(), fieldChangeSchema),
    revisionAfter: revisionSchema,
  })
  .strict();

export type DomainEvent = z.infer<typeof eventSchema>;
export type EventEntityType = z.infer<typeof eventEntityTypeSchema>;
export type EventType = z.infer<typeof eventTypeSchema>;
export type FieldChange = z.infer<typeof fieldChangeSchema>;
