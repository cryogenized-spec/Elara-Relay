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

type EventEntityTypeValue = z.infer<typeof eventEntityTypeSchema>;
type EventTypeValue = z.infer<typeof eventTypeSchema>;

const creationEventTypes = new Set<EventTypeValue>([
  'PARTY_CREATED',
  'JOB_CREATED',
  'TASK_CREATED',
  'REPAIR_CREATED',
  'SCHEDULED_ACTION_CREATED',
]);

const eventTypesByEntity: Record<
  EventEntityTypeValue,
  readonly EventTypeValue[]
> = {
  PARTY: ['PARTY_CREATED'],
  JOB: ['JOB_CREATED', 'JOB_NOTE'],
  TASK: [
    'TASK_CREATED',
    'TASK_UPDATED',
    'TASK_WAITING',
    'TASK_COMPLETED',
    'TASK_CANCELLED',
  ],
  REPAIR: [
    'REPAIR_CREATED',
    'REPAIR_DETAILS_UPDATED',
    'REPAIR_STAGE_CHANGED',
    'REPAIR_TEST_RECORDED',
  ],
  SCHEDULED_ACTION: [
    'SCHEDULED_ACTION_CREATED',
    'SCHEDULED_ACTION_UPDATED',
    'SCHEDULED_ACTION_PAUSED',
    'SCHEDULED_ACTION_RESUMED',
    'SCHEDULED_ACTION_CANCELLED',
    'SCHEDULED_ACTION_RUN_CLAIMED',
    'SCHEDULED_ACTION_RUN_SUCCEEDED',
    'SCHEDULED_ACTION_RUN_FAILED',
  ],
};

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
  .strict()
  .superRefine((eventValue, context) => {
    if (
      !eventTypesByEntity[eventValue.entityType].includes(eventValue.eventType)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['eventType'],
        message: `${eventValue.eventType} is not valid for ${eventValue.entityType} events`,
      });
    }

    if (
      creationEventTypes.has(eventValue.eventType) &&
      eventValue.revisionAfter !== 1
    ) {
      context.addIssue({
        code: 'custom',
        path: ['revisionAfter'],
        message: 'Creation Events must record revisionAfter 1',
      });
    }
  });

export type DomainEvent = z.infer<typeof eventSchema>;
export type EventEntityType = z.infer<typeof eventEntityTypeSchema>;
export type EventType = z.infer<typeof eventTypeSchema>;
export type FieldChange = z.infer<typeof fieldChangeSchema>;
