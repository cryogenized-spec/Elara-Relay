import { z } from 'zod';
import { eventSchema } from './event';
import { jobSchema } from './job';
import { partySchema } from './party';
import {
  repairSchema,
  repairWarningSchema,
  repairWarningsFor,
} from './repair';
import { scheduledActionSchema } from './scheduler';
import { timestampSchema } from './shared';
import { taskSchema } from './task';

function duplicateIds(values: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) duplicates.add(value.id);
    seen.add(value.id);
  }
  return [...duplicates];
}

function duplicateMessage(
  values: readonly { id: string }[],
  path: string,
): string | null {
  const duplicates = duplicateIds(values);
  return duplicates.length === 0
    ? null
    : `${path} must contain unique ids; duplicates: ${duplicates.join(', ')}`;
}

export const taskViewSchema = z
  .object({
    task: taskSchema,
    job: jobSchema.nullable(),
  })
  .strict()
  .superRefine((view, context) => {
    if (view.task.jobId === null && view.job !== null) {
      context.addIssue({
        code: 'custom',
        path: ['job'],
        message: 'Standalone Task view cannot contain a Job',
      });
    }
    if (
      view.task.jobId !== null &&
      (view.job === null || view.job.id !== view.task.jobId)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['job'],
        message: 'Task view Job must match task.jobId',
      });
    }
  });

export const repairViewSchema = z
  .object({
    repair: repairSchema,
    warnings: z.array(repairWarningSchema),
  })
  .strict()
  .superRefine((view, context) => {
    const expectedWarnings = repairWarningsFor(view.repair);
    if (
      view.warnings.length !== expectedWarnings.length ||
      !view.warnings.every((warning) => expectedWarnings.includes(warning))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['warnings'],
        message: 'Repair view warnings must match the Repair state',
      });
    }
  });

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
  .strict()
  .superRefine((view, context) => {
    const taskDuplicates = duplicateMessage(view.tasks, 'tasks');
    if (taskDuplicates !== null) {
      context.addIssue({ code: 'custom', path: ['tasks'], message: taskDuplicates });
    }
    const actionDuplicates = duplicateMessage(
      view.scheduledActions,
      'scheduledActions',
    );
    if (actionDuplicates !== null) {
      context.addIssue({
        code: 'custom',
        path: ['scheduledActions'],
        message: actionDuplicates,
      });
    }
    const eventDuplicates = duplicateMessage(view.events, 'events');
    if (eventDuplicates !== null) {
      context.addIssue({ code: 'custom', path: ['events'], message: eventDuplicates });
    }

    if (view.job.partyId === null && view.party !== null) {
      context.addIssue({
        code: 'custom',
        path: ['party'],
        message: 'Job without partyId cannot contain a Party',
      });
    }
    if (
      view.job.partyId !== null &&
      (view.party === null || view.party.id !== view.job.partyId)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['party'],
        message: 'Job view Party must match job.partyId',
      });
    }

    for (const [index, task] of view.tasks.entries()) {
      if (task.jobId !== view.job.id) {
        context.addIssue({
          code: 'custom',
          path: ['tasks', index, 'jobId'],
          message: 'Job view Tasks must reference the viewed Job',
        });
      }
    }

    if (view.repair !== null && view.repair.jobId !== view.job.id) {
      context.addIssue({
        code: 'custom',
        path: ['repair', 'jobId'],
        message: 'Job view Repair must reference the viewed Job',
      });
    }

    if (view.repair === null) {
      if (view.repairWarnings.length !== 0) {
        context.addIssue({
          code: 'custom',
          path: ['repairWarnings'],
          message: 'Job without a Repair cannot contain Repair warnings',
        });
      }
    } else {
      const expectedWarnings = repairWarningsFor(view.repair);
      if (
        view.repairWarnings.length !== expectedWarnings.length ||
        !view.repairWarnings.every((warning) =>
          expectedWarnings.includes(warning),
        )
      ) {
        context.addIssue({
          code: 'custom',
          path: ['repairWarnings'],
          message: 'Job Repair warnings must match the Repair state',
        });
      }
    }

    const taskIds = new Set(view.tasks.map((task) => task.id));
    const actionIds = new Set(
      view.scheduledActions.map((action) => action.id),
    );

    for (const [index, action] of view.scheduledActions.entries()) {
      const directJobMatch = action.jobId === view.job.id;
      const taskMatch =
        action.taskId !== null && taskIds.has(action.taskId);
      const jobReferenceValid =
        action.jobId === null || action.jobId === view.job.id;
      const taskReferenceValid =
        action.taskId === null || taskIds.has(action.taskId);

      if (
        (!directJobMatch && !taskMatch) ||
        !jobReferenceValid ||
        !taskReferenceValid
      ) {
        context.addIssue({
          code: 'custom',
          path: ['scheduledActions', index],
          message:
            'Job view Scheduled Actions must reference the viewed Job directly or through one of its Tasks',
        });
      }
    }

    for (const [index, event] of view.events.entries()) {
      const belongsToAggregate =
        (event.entityType === 'JOB' && event.entityId === view.job.id) ||
        (event.entityType === 'TASK' && taskIds.has(event.entityId)) ||
        (event.entityType === 'REPAIR' &&
          view.repair !== null &&
          event.entityId === view.repair.id) ||
        (event.entityType === 'SCHEDULED_ACTION' &&
          actionIds.has(event.entityId));

      if (!belongsToAggregate) {
        context.addIssue({
          code: 'custom',
          path: ['events', index],
          message:
            'Job view Events must reference the viewed Job aggregate',
        });
      }
    }
  });

export const todayResultSchema = z
  .object({
    asOf: timestampSchema,
    tasks: z.array(taskSchema),
    repairs: z.array(repairSchema),
    scheduledActions: z.array(scheduledActionSchema),
  })
  .strict()
  .superRefine((result, context) => {
    const taskDuplicates = duplicateMessage(result.tasks, 'tasks');
    if (taskDuplicates !== null) {
      context.addIssue({ code: 'custom', path: ['tasks'], message: taskDuplicates });
    }
    const repairDuplicates = duplicateMessage(result.repairs, 'repairs');
    if (repairDuplicates !== null) {
      context.addIssue({ code: 'custom', path: ['repairs'], message: repairDuplicates });
    }
    const actionDuplicates = duplicateMessage(
      result.scheduledActions,
      'scheduledActions',
    );
    if (actionDuplicates !== null) {
      context.addIssue({
        code: 'custom',
        path: ['scheduledActions'],
        message: actionDuplicates,
      });
    }

    const asOf = Date.parse(result.asOf);

    for (const [index, task] of result.tasks.entries()) {
      const active =
        task.status !== 'DONE' && task.status !== 'CANCELLED';
      const due =
        (task.dueAt !== null && Date.parse(task.dueAt) <= asOf) ||
        (task.followUpAt !== null &&
          Date.parse(task.followUpAt) <= asOf);

      if (!active || !due) {
        context.addIssue({
          code: 'custom',
          path: ['tasks', index],
          message:
            'Today Tasks must be non-terminal with dueAt or followUpAt at or before asOf',
        });
      }
    }

    for (const [index, repair] of result.repairs.entries()) {
      const waiting =
        repair.stage === 'AWAITING_PARTS' ||
        repair.stage === 'AWAITING_CUSTOMER';
      if (
        !waiting ||
        repair.followUpAt === null ||
        Date.parse(repair.followUpAt) > asOf
      ) {
        context.addIssue({
          code: 'custom',
          path: ['repairs', index],
          message:
            'Today Repairs must be waiting with followUpAt at or before asOf',
        });
      }
    }

    for (const [index, action] of result.scheduledActions.entries()) {
      if (
        action.status !== 'ACTIVE' ||
        action.nextRunAt === null ||
        Date.parse(action.nextRunAt) > asOf
      ) {
        context.addIssue({
          code: 'custom',
          path: ['scheduledActions', index],
          message:
            'Today Scheduled Actions must be ACTIVE with nextRunAt at or before asOf',
        });
      }
    }
  });

export const workResultSchema = z
  .object({
    parties: z.array(partySchema),
    jobs: z.array(jobSchema),
    tasks: z.array(taskSchema),
  })
  .strict()
  .superRefine((result, context) => {
    const partyDuplicates = duplicateMessage(result.parties, 'parties');
    if (partyDuplicates !== null) {
      context.addIssue({ code: 'custom', path: ['parties'], message: partyDuplicates });
    }
    const jobDuplicates = duplicateMessage(result.jobs, 'jobs');
    if (jobDuplicates !== null) {
      context.addIssue({ code: 'custom', path: ['jobs'], message: jobDuplicates });
    }
    const taskDuplicates = duplicateMessage(result.tasks, 'tasks');
    if (taskDuplicates !== null) {
      context.addIssue({ code: 'custom', path: ['tasks'], message: taskDuplicates });
    }

    const partyIds = new Set(result.parties.map((party) => party.id));
    const jobIds = new Set(result.jobs.map((job) => job.id));

    for (const [index, job] of result.jobs.entries()) {
      if (job.partyId !== null && !partyIds.has(job.partyId)) {
        context.addIssue({
          code: 'custom',
          path: ['jobs', index, 'partyId'],
          message: 'Job partyId must reference a Party in the Work aggregate',
        });
      }
    }

    for (const [index, task] of result.tasks.entries()) {
      if (task.jobId !== null && !jobIds.has(task.jobId)) {
        context.addIssue({
          code: 'custom',
          path: ['tasks', index, 'jobId'],
          message: 'Task jobId must reference a Job in the Work aggregate',
        });
      }
    }
  });

export const repairsResultSchema = z
  .object({
    parties: z.array(partySchema),
    jobs: z.array(jobSchema),
    repairs: z.array(repairSchema),
  })
  .strict()
  .superRefine((result, context) => {
    const partyDuplicates = duplicateMessage(result.parties, 'parties');
    if (partyDuplicates !== null) {
      context.addIssue({ code: 'custom', path: ['parties'], message: partyDuplicates });
    }
    const jobDuplicates = duplicateMessage(result.jobs, 'jobs');
    if (jobDuplicates !== null) {
      context.addIssue({ code: 'custom', path: ['jobs'], message: jobDuplicates });
    }
    const repairDuplicates = duplicateMessage(result.repairs, 'repairs');
    if (repairDuplicates !== null) {
      context.addIssue({ code: 'custom', path: ['repairs'], message: repairDuplicates });
    }

    const partyIds = new Set(result.parties.map((party) => party.id));
    const jobIds = new Set(result.jobs.map((job) => job.id));

    for (const [index, job] of result.jobs.entries()) {
      if (job.partyId !== null && !partyIds.has(job.partyId)) {
        context.addIssue({
          code: 'custom',
          path: ['jobs', index, 'partyId'],
          message: 'Job partyId must reference a Party in the Repairs aggregate',
        });
      }
    }

    for (const [index, repair] of result.repairs.entries()) {
      if (!jobIds.has(repair.jobId)) {
        context.addIssue({
          code: 'custom',
          path: ['repairs', index, 'jobId'],
          message: 'Repair jobId must reference a Job in the Repairs aggregate',
        });
      }
    }
  });

export const scheduleResultSchema = z
  .object({
    asOf: timestampSchema,
    due: z.array(scheduledActionSchema),
    upcoming: z.array(scheduledActionSchema),
    paused: z.array(scheduledActionSchema),
  })
  .strict()
  .superRefine((result, context) => {
    const all = [...result.due, ...result.upcoming, ...result.paused];
    const scheduleDuplicates = duplicateMessage(all, 'schedule');
    if (scheduleDuplicates !== null) {
      context.addIssue({
        code: 'custom',
        path: ['schedule'],
        message: scheduleDuplicates,
      });
    }
    const asOf = Date.parse(result.asOf);

    for (const [index, action] of result.due.entries()) {
      if (
        action.status !== 'ACTIVE' ||
        action.nextRunAt === null ||
        Date.parse(action.nextRunAt) > asOf
      ) {
        context.addIssue({
          code: 'custom',
          path: ['due', index],
          message: 'Due actions must be ACTIVE with nextRunAt at or before asOf',
        });
      }
    }

    for (const [index, action] of result.upcoming.entries()) {
      if (
        action.status !== 'ACTIVE' ||
        action.nextRunAt === null ||
        Date.parse(action.nextRunAt) <= asOf
      ) {
        context.addIssue({
          code: 'custom',
          path: ['upcoming', index],
          message: 'Upcoming actions must be ACTIVE with nextRunAt after asOf',
        });
      }
    }

    for (const [index, action] of result.paused.entries()) {
      if (action.status !== 'PAUSED') {
        context.addIssue({
          code: 'custom',
          path: ['paused', index, 'status'],
          message: 'Paused bucket may contain only PAUSED actions',
        });
      }
    }
  });

function sameEntityVersions(
  left: readonly { id: string; revision: number }[],
  right: readonly { id: string; revision: number }[],
): boolean {
  if (left.length !== right.length) return false;
  const revisions = new Map(left.map((value) => [value.id, value.revision]));
  return right.every((value) => revisions.get(value.id) === value.revision);
}

function subsetEntityVersions(
  subset: readonly { id: string; revision: number }[],
  superset: readonly { id: string; revision: number }[],
): boolean {
  const revisions = new Map(superset.map((value) => [value.id, value.revision]));
  return subset.every((value) => revisions.get(value.id) === value.revision);
}

export const dashboardResultSchema = z
  .object({
    today: todayResultSchema,
    work: workResultSchema,
    repairs: repairsResultSchema,
    schedule: scheduleResultSchema,
  })
  .strict()
  .superRefine((dashboard, context) => {
    if (dashboard.today.asOf !== dashboard.schedule.asOf) {
      context.addIssue({
        code: 'custom',
        path: ['schedule', 'asOf'],
        message: 'Dashboard Today and Schedule must share one asOf timestamp',
      });
    }

    if (!sameEntityVersions(dashboard.work.parties, dashboard.repairs.parties)) {
      context.addIssue({
        code: 'custom',
        path: ['repairs', 'parties'],
        message: 'Dashboard Work and Repairs must share Party versions',
      });
    }
    if (!sameEntityVersions(dashboard.work.jobs, dashboard.repairs.jobs)) {
      context.addIssue({
        code: 'custom',
        path: ['repairs', 'jobs'],
        message: 'Dashboard Work and Repairs must share Job versions',
      });
    }
    if (!subsetEntityVersions(dashboard.today.tasks, dashboard.work.tasks)) {
      context.addIssue({
        code: 'custom',
        path: ['today', 'tasks'],
        message: 'Dashboard Today Tasks must match Work Task versions',
      });
    }
    if (!subsetEntityVersions(dashboard.today.repairs, dashboard.repairs.repairs)) {
      context.addIssue({
        code: 'custom',
        path: ['today', 'repairs'],
        message: 'Dashboard Today Repairs must match Repairs versions',
      });
    }
    if (!sameEntityVersions(dashboard.today.scheduledActions, dashboard.schedule.due)) {
      context.addIssue({
        code: 'custom',
        path: ['today', 'scheduledActions'],
        message: 'Dashboard Today Scheduled Actions must equal Schedule due actions',
      });
    }
  });

export const searchResultSchema = z
  .object({
    parties: z.array(partySchema),
    jobs: z.array(jobSchema),
    tasks: z.array(taskSchema),
    repairs: z.array(repairSchema),
    scheduledActions: z.array(scheduledActionSchema),
    events: z.array(eventSchema),
  })
  .strict()
  .superRefine((result, context) => {
    for (const [path, values] of [
      ['parties', result.parties],
      ['jobs', result.jobs],
      ['tasks', result.tasks],
      ['repairs', result.repairs],
      ['scheduledActions', result.scheduledActions],
      ['events', result.events],
    ] as const) {
      const message = duplicateMessage(values, path);
      if (message !== null) {
        context.addIssue({ code: 'custom', path: [path], message });
      }
    }
  });

export type TaskViewPayload = z.infer<typeof taskViewSchema>;
export type RepairViewPayload = z.infer<typeof repairViewSchema>;
export type JobViewPayload = z.infer<typeof jobViewSchema>;
export type TodayResultPayload = z.infer<typeof todayResultSchema>;
export type WorkResultPayload = z.infer<typeof workResultSchema>;
export type RepairsResultPayload = z.infer<typeof repairsResultSchema>;
export type ScheduleResultPayload = z.infer<typeof scheduleResultSchema>;
export type DashboardResultPayload = z.infer<typeof dashboardResultSchema>;
export type SearchResultPayload = z.infer<typeof searchResultSchema>;
