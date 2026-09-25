import { z } from 'zod';
import { eventSchema } from './event';
import { jobSchema } from './job';
import { partySchema } from './party';
import { repairSchema, repairWarningSchema } from './repair';
import { scheduledActionSchema } from './scheduler';
import { timestampSchema } from './shared';
import { taskSchema } from './task';

export const repairViewSchema = z
  .object({
    repair: repairSchema,
    warnings: z.array(repairWarningSchema),
  })
  .strict();

export const jobViewSchema = z
  .object({
    job: jobSchema,
    party: partySchema.nullable(),
    tasks: z.array(taskSchema),
    repair: repairSchema.nullable(),
    repairWarnings: z.array(repairWarningSchema),
    scheduledActions: z.array(scheduledActionSchema),
    events: z.array(eventSchema),
  })
  .strict();

export const todayResultSchema = z
  .object({
    asOf: timestampSchema,
    tasks: z.array(taskSchema),
    repairs: z.array(repairSchema),
    scheduledActions: z.array(scheduledActionSchema),
  })
  .strict();

export const workResultSchema = z
  .object({
    parties: z.array(partySchema),
    jobs: z.array(jobSchema),
    tasks: z.array(taskSchema),
  })
  .strict();

export const repairsResultSchema = z
  .object({
    parties: z.array(partySchema),
    jobs: z.array(jobSchema),
    repairs: z.array(repairSchema),
  })
  .strict();

export const scheduleResultSchema = z
  .object({
    asOf: timestampSchema,
    due: z.array(scheduledActionSchema),
    upcoming: z.array(scheduledActionSchema),
    paused: z.array(scheduledActionSchema),
  })
  .strict();

export const searchResultSchema = z
  .object({
    parties: z.array(partySchema),
    jobs: z.array(jobSchema),
    tasks: z.array(taskSchema),
    repairs: z.array(repairSchema),
    scheduledActions: z.array(scheduledActionSchema),
    events: z.array(eventSchema),
  })
  .strict();

export type RepairViewPayload = z.infer<typeof repairViewSchema>;
export type JobViewPayload = z.infer<typeof jobViewSchema>;
export type TodayResultPayload = z.infer<typeof todayResultSchema>;
export type WorkResultPayload = z.infer<typeof workResultSchema>;
export type RepairsResultPayload = z.infer<typeof repairsResultSchema>;
export type ScheduleResultPayload = z.infer<typeof scheduleResultSchema>;
export type SearchResultPayload = z.infer<typeof searchResultSchema>;
