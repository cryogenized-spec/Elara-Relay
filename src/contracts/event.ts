import { z } from 'zod';
import { mutationActorSchema } from './foundation';
import { entityIdSchema, revisionSchema, timestampSchema } from './shared';

export const eventEntityTypeSchema = z.enum(['PARTY', 'JOB', 'TASK']);

export const eventTypeSchema = z.enum([
  'PARTY_CREATED',
  'JOB_CREATED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_WAITING',
  'TASK_COMPLETED',
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
    mutationId: z.string().min(16).max(128),
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
