import { z } from 'zod';
import { entityIdSchema, revisionSchema, timestampSchema } from './shared';

export const taskStatusSchema = z.enum([
  'INBOX',
  'NEXT',
  'DOING',
  'WAITING',
  'DONE',
  'CANCELLED',
]);

export const taskPrioritySchema = z.enum([
  'URGENT',
  'HIGH',
  'NORMAL',
  'LOW',
]);

export const taskSchema = z
  .object({
    id: entityIdSchema,
    jobId: entityIdSchema.nullable(),
    title: z.string().trim().min(1).max(240),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    dueAt: timestampSchema.nullable(),
    followUpAt: timestampSchema.nullable(),
    waitingOn: z.string().trim().min(1).max(240).nullable(),
    waitingSince: timestampSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    revision: revisionSchema,
  })
  .strict();

export const createTaskInputSchema = z
  .object({
    jobId: entityIdSchema.nullable().default(null),
    title: taskSchema.shape.title,
    priority: taskPrioritySchema.default('NORMAL'),
    dueAt: timestampSchema.nullable().default(null),
    followUpAt: timestampSchema.nullable().default(null),
  })
  .strict();

export const updateTaskPatchSchema = z
  .object({
    title: taskSchema.shape.title.optional(),
    priority: taskPrioritySchema.optional(),
    dueAt: timestampSchema.nullable().optional(),
    followUpAt: timestampSchema.nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one task field must be updated',
  });

export const markTaskWaitingInputSchema = z
  .object({
    waitingOn: z.string().trim().min(1).max(240),
    followUpAt: timestampSchema.nullable().default(null),
  })
  .strict();

export type Task = z.infer<typeof taskSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type UpdateTaskPatch = z.infer<typeof updateTaskPatchSchema>;
export type MarkTaskWaitingInput = z.infer<typeof markTaskWaitingInputSchema>;
