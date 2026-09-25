import type { Job } from '../contracts/job';
import type { Party } from '../contracts/party';
import type { Repair, RepairStage } from '../contracts/repair';
import type { ScheduledAction } from '../contracts/scheduler';
import type { Task } from '../contracts/task';
import type {
  RepairsResultPayload,
  ScheduleResultPayload,
  SearchResultPayload,
  TodayResultPayload,
  WorkResultPayload,
} from '../contracts/read-model';

export type UiTone = 'danger' | 'attention' | 'success' | 'info' | 'neutral';
export type UiEntityType =
  | 'PARTY'
  | 'JOB'
  | 'TASK'
  | 'REPAIR'
  | 'SCHEDULED_ACTION'
  | 'EVENT';

export interface UiRow {
  id: string;
  entityType: UiEntityType;
  eyebrow: string;
  title: string;
  meta: string;
  badge: string;
  tone: UiTone;
}

export interface TodayViewModel {
  summary: {
    overdue: number;
    today: number;
    waiting: number;
    ready: number;
  };
  attention: UiRow[];
  ready: UiRow[];
  next: UiRow[];
}

export interface WorkViewModel {
  jobs: UiRow[];
  tasks: UiRow[];
}

export interface RepairsViewModel {
  groups: Array<{
    label: string;
    rows: UiRow[];
  }>;
}

export interface ScheduleViewModel {
  rows: UiRow[];
}

export interface SearchGroupViewModel {
  label: string;
  rows: UiRow[];
}

const formatClock = new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const formatDay = new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
});

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function indexById<T extends { id: string }>(values: T[]): Map<string, T> {
  return new Map(values.map((value) => [value.id, value]));
}

function jobKey(jobId: string | null, jobs: Map<string, Job>): string | null {
  if (jobId === null) return null;
  return jobs.get(jobId)?.key ?? null;
}

function partyName(partyId: string | null, parties: Map<string, Party>): string | null {
  if (partyId === null) return null;
  return parties.get(partyId)?.name ?? null;
}

function relativeScheduleLabel(value: string | null): string {
  if (value === null) return 'No next run';
  const date = new Date(value);
  return `${formatDay.format(date)} · ${formatClock.format(date)}`;
}

function elapsedAt(value: string | null, asOf?: string): boolean {
  return (
    value !== null &&
    asOf !== undefined &&
    Date.parse(value) <= Date.parse(asOf)
  );
}

function taskNeedsAttention(task: Task, asOf?: string): boolean {
  return elapsedAt(task.dueAt, asOf) || elapsedAt(task.followUpAt, asOf);
}

function taskTone(task: Task, asOf?: string): UiTone {
  if (task.status === 'WAITING') return 'attention';
  if (
    taskNeedsAttention(task, asOf) &&
    task.status !== 'DONE' &&
    task.status !== 'CANCELLED'
  ) {
    return 'danger';
  }
  if (task.status === 'DOING' || task.status === 'NEXT') return 'info';
  return 'neutral';
}

function taskBadge(task: Task, asOf?: string): string {
  if (
    task.status !== 'WAITING' &&
    task.status !== 'DONE' &&
    task.status !== 'CANCELLED' &&
    taskNeedsAttention(task, asOf)
  ) {
    return 'Overdue';
  }
  return titleCase(task.status);
}

function taskRow(task: Task, jobs: Map<string, Job>, asOf?: string): UiRow {
  const linkedKey = jobKey(task.jobId, jobs);
  const dueElapsed = elapsedAt(task.dueAt, asOf);
  const followUpElapsed = elapsedAt(task.followUpAt, asOf);
  const timingParts: string[] = [];

  if (dueElapsed && task.dueAt !== null) {
    timingParts.push(
      `Due ${formatDay.format(new Date(task.dueAt))} · ${formatClock.format(new Date(task.dueAt))}`,
    );
  }
  if (followUpElapsed && task.followUpAt !== null) {
    timingParts.push(
      `Follow up ${formatDay.format(new Date(task.followUpAt))} · ${formatClock.format(new Date(task.followUpAt))}`,
    );
  }

  if (timingParts.length === 0) {
    if (task.status === 'WAITING' && task.waitingOn !== null) {
      timingParts.push(`Waiting on ${task.waitingOn}`);
    } else if (task.dueAt !== null) {
      timingParts.push(
        `Due ${formatDay.format(new Date(task.dueAt))} · ${formatClock.format(new Date(task.dueAt))}`,
      );
    } else if (task.followUpAt !== null) {
      timingParts.push(
        `Follow up ${formatDay.format(new Date(task.followUpAt))} · ${formatClock.format(new Date(task.followUpAt))}`,
      );
    } else {
      timingParts.push('No due date');
    }
  }

  if (
    task.status === 'WAITING' &&
    task.waitingOn !== null &&
    !timingParts.some((part) => part.startsWith('Waiting on '))
  ) {
    timingParts.push(`Waiting on ${task.waitingOn}`);
  }

  return {
    id: task.id,
    entityType: 'TASK',
    eyebrow: linkedKey === null ? 'TASK' : `TASK · ${linkedKey}`,
    title: task.title,
    meta: `${timingParts.join(' · ')} · ${titleCase(task.priority)} priority`,
    badge: taskBadge(task, asOf),
    tone: taskTone(task, asOf),
  };
}

function jobTone(job: Job): UiTone {
  if (job.category === 'WAITING') return 'attention';
  if (job.category === 'ACTIVE') return 'info';
  return 'neutral';
}

function jobRow(
  job: Job,
  parties: Map<string, Party>,
  tasks: Task[],
): UiRow {
  const party = partyName(job.partyId, parties);
  const openTaskCount = tasks.filter(
    (task) =>
      task.jobId === job.id &&
      task.status !== 'DONE' &&
      task.status !== 'CANCELLED',
  ).length;

  return {
    id: job.id,
    entityType: 'JOB',
    eyebrow: `${job.key} · ${job.category}`,
    title: job.title,
    meta: [
      party,
      `${openTaskCount} open ${openTaskCount === 1 ? 'Task' : 'Tasks'}`,
    ]
      .filter((value): value is string => value !== null)
      .join(' · '),
    badge: titleCase(job.category),
    tone: jobTone(job),
  };
}

function searchJobRow(
  job: Job,
  parties: Map<string, Party>,
): UiRow {
  const party = partyName(job.partyId, parties);

  return {
    id: job.id,
    entityType: 'JOB',
    eyebrow: `${job.key} · ${job.category}`,
    title: job.title,
    meta: party ?? 'Job',
    badge: titleCase(job.category),
    tone: jobTone(job),
  };
}

function repairTone(stage: RepairStage): UiTone {
  if (stage === 'AWAITING_PARTS' || stage === 'AWAITING_CUSTOMER') {
    return 'attention';
  }
  if (stage === 'READY') return 'success';
  if (stage === 'TESTING' || stage === 'REPAIRING' || stage === 'DIAGNOSING') {
    return 'info';
  }
  return 'neutral';
}

function repairRow(repair: Repair, jobs: Map<string, Job>): UiRow {
  const job = jobs.get(repair.jobId);
  const title = job?.title ?? repair.reportedFault;
  const serial =
    repair.serialState === 'KNOWN' && repair.serialValue !== null
      ? `serial ${repair.serialValue}`
      : repair.serialState === 'UNKNOWN'
        ? 'serial unknown'
        : 'no serial';

  return {
    id: repair.id,
    entityType: 'REPAIR',
    eyebrow: `REPAIR · ${job?.key ?? 'LINKED JOB'}`,
    title,
    meta: [
      titleCase(repair.stage),
      serial,
      repair.waitingOn === null ? null : `waiting on ${repair.waitingOn}`,
    ]
      .filter((value): value is string => value !== null)
      .join(' · '),
    badge:
      repair.stage === 'READY'
        ? 'Ready'
        : repair.stage === 'AWAITING_PARTS' ||
            repair.stage === 'AWAITING_CUSTOMER'
          ? 'Waiting'
          : titleCase(repair.stage),
    tone: repairTone(repair.stage),
  };
}

function scheduleRow(
  action: ScheduledAction,
  state: 'Due' | 'Upcoming' | 'Paused' | 'Completed' | 'Cancelled',
  jobs: Map<string, Job>,
): UiRow {
  const linkedKey = jobKey(action.jobId, jobs);
  return {
    id: action.id,
    entityType: 'SCHEDULED_ACTION',
    eyebrow: `${action.actionType} · ${relativeScheduleLabel(action.nextRunAt)}`,
    title: action.title,
    meta: [
      action.recurrenceRule === null ? 'One time' : action.recurrenceRule,
      linkedKey,
    ]
      .filter((value): value is string => value !== null)
      .join(' · '),
    badge: state,
    tone:
      state === 'Due'
        ? 'attention'
        : state === 'Upcoming'
          ? 'info'
          : 'neutral',
  };
}

export function buildTodayView(
  today: TodayResultPayload,
  repairs: RepairsResultPayload,
  schedule: ScheduleResultPayload,
): TodayViewModel {
  const jobs = indexById(repairs.jobs);
  const dueTasks = today.tasks.map((task) => taskRow(task, jobs, today.asOf));
  const waitingRepairs = today.repairs.map((repair) => repairRow(repair, jobs));
  const dueActions = today.scheduledActions.map((action) =>
    scheduleRow(action, 'Due', jobs),
  );
  const ready = repairs.repairs
    .filter((repair) => repair.stage === 'READY')
    .map((repair) => repairRow(repair, jobs));
  const next = schedule.upcoming.slice(0, 2).map((action) =>
    scheduleRow(action, 'Upcoming', jobs),
  );

  return {
    summary: {
      overdue: today.tasks.filter((task) =>
        taskNeedsAttention(task, today.asOf),
      ).length,
      today: today.tasks.length + today.scheduledActions.length,
      waiting: today.repairs.length,
      ready: ready.length,
    },
    attention: [...waitingRepairs, ...dueTasks, ...dueActions],
    ready,
    next,
  };
}

export function buildWorkView(work: WorkResultPayload): WorkViewModel {
  const parties = indexById(work.parties);
  const jobs = indexById(work.jobs);

  return {
    jobs: work.jobs
      .filter((job) => job.category !== 'DONE' && job.category !== 'CANCELLED')
      .map((job) => jobRow(job, parties, work.tasks)),
    tasks: work.tasks
      .filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED')
      .map((task) => taskRow(task, jobs)),
  };
}

export function buildRepairsView(
  result: RepairsResultPayload,
): RepairsViewModel {
  const jobs = indexById(result.jobs);
  const active = result.repairs.filter(
    (repair) => repair.stage !== 'COLLECTED' && repair.stage !== 'CANCELLED',
  );

  const groups = [
    {
      label: 'Testing',
      rows: active
        .filter((repair) => repair.stage === 'TESTING')
        .map((repair) => repairRow(repair, jobs)),
    },
    {
      label: 'Waiting',
      rows: active
        .filter(
          (repair) =>
            repair.stage === 'AWAITING_PARTS' ||
            repair.stage === 'AWAITING_CUSTOMER',
        )
        .map((repair) => repairRow(repair, jobs)),
    },
    {
      label: 'Ready for collection',
      rows: active
        .filter((repair) => repair.stage === 'READY')
        .map((repair) => repairRow(repair, jobs)),
    },
    {
      label: 'In workshop',
      rows: active
        .filter(
          (repair) =>
            repair.stage === 'RECEIVED' ||
            repair.stage === 'DIAGNOSING' ||
            repair.stage === 'REPAIRING',
        )
        .map((repair) => repairRow(repair, jobs)),
    },
  ].filter((group) => group.rows.length > 0);

  return { groups };
}

export function buildScheduleView(
  schedule: ScheduleResultPayload,
  work: WorkResultPayload,
): ScheduleViewModel {
  const jobs = indexById(work.jobs);
  return {
    rows: [
      ...schedule.due.map((action) => scheduleRow(action, 'Due', jobs)),
      ...schedule.upcoming.map((action) =>
        scheduleRow(action, 'Upcoming', jobs),
      ),
      ...schedule.paused.map((action) => scheduleRow(action, 'Paused', jobs)),
    ],
  };
}

export function buildSearchGroups(
  result: SearchResultPayload,
  asOf: string,
): SearchGroupViewModel[] {
  const jobs = indexById(result.jobs);
  const parties = indexById(result.parties);

  const groups: SearchGroupViewModel[] = [
    {
      label: 'Repairs',
      rows: result.repairs.map((repair) => repairRow(repair, jobs)),
    },
    {
      label: 'Jobs',
      rows: result.jobs.map((job) => searchJobRow(job, parties)),
    },
    {
      label: 'Tasks',
      rows: result.tasks.map((task) => taskRow(task, jobs)),
    },
    {
      label: 'Schedule',
      rows: result.scheduledActions.map((action) => {
        const state =
          action.status === 'PAUSED'
            ? 'Paused'
            : action.status === 'COMPLETED'
              ? 'Completed'
              : action.status === 'CANCELLED'
                ? 'Cancelled'
                : action.nextRunAt !== null &&
                    Date.parse(action.nextRunAt) <= Date.parse(asOf)
                  ? 'Due'
                  : 'Upcoming';
        return scheduleRow(action, state, jobs);
      }),
    },
    {
      label: 'Parties',
      rows: result.parties.map((party) => ({
        id: party.id,
        entityType: 'PARTY' as const,
        eyebrow: party.kind,
        title: party.name,
        meta: 'Party',
        badge: titleCase(party.kind),
        tone: 'neutral' as const,
      })),
    },
    {
      label: 'History',
      rows: result.events.map((event) => ({
        id: event.id,
        entityType: 'EVENT' as const,
        eyebrow: `${event.entityType} · EVENT`,
        title: event.detail ?? titleCase(event.eventType),
        meta: `${titleCase(event.eventType)} · ${formatDay.format(new Date(event.occurredAt))} · ${formatClock.format(new Date(event.occurredAt))}`,
        badge: 'History',
        tone: 'neutral' as const,
      })),
    },
  ];

  return groups.filter((group) => group.rows.length > 0);
}
