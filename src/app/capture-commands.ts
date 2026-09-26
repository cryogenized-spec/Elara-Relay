import type { Job } from '../contracts/job';
import type { Party } from '../contracts/party';
import { createRepairCaseInputSchema } from '../contracts/repair-case';
import type { Repair } from '../contracts/repair';
import {
  createScheduledActionInputSchema,
  type ScheduledAction,
} from '../contracts/scheduler';
import {
  createTaskInputSchema,
  type Task,
} from '../contracts/task';
import type { DashboardResultPayload } from '../contracts/read-model';
import type { OperationsApi } from './operations-api';

export class CaptureValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CaptureValidationError';
  }
}

export interface TaskCaptureDraft {
  title: string;
  dueLocal: string;
  jobKey: string;
}

export interface RepairCaptureDraft {
  partyName: string;
  itemTitle: string;
  reportedFault: string;
  serial: string;
}

export interface ReminderCaptureDraft {
  title: string;
  runAtLocal: string;
  repeat: 'once' | 'daily' | 'weekly';
  jobKey: string;
}

export interface TaskCapturePlan {
  mutationId: string;
}

export interface RepairCapturePlan {
  mutationId: string;
}

export interface ReminderCapturePlan {
  mutationId: string;
}

export function createMutationId(
  uuid: () => string = () => crypto.randomUUID(),
): string {
  return `MUT-${uuid()}`;
}

export function createTaskCapturePlan(
  uuid?: () => string,
): TaskCapturePlan {
  return { mutationId: createMutationId(uuid) };
}

export function createRepairCapturePlan(
  uuid?: () => string,
): RepairCapturePlan {
  return { mutationId: createMutationId(uuid) };
}

export function createReminderCapturePlan(
  uuid?: () => string,
): ReminderCapturePlan {
  return { mutationId: createMutationId(uuid) };
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('en-ZA');
}

function resolveJob(
  dashboard: DashboardResultPayload,
  rawKey: string,
): Job | null {
  const key = rawKey.trim().toUpperCase();
  if (key === '') return null;

  const job = dashboard.work.jobs.find((candidate) => candidate.key === key);
  if (job === undefined) {
    throw new CaptureValidationError(`Job ${key} was not found`);
  }
  return job;
}

function resolveParty(
  dashboard: DashboardResultPayload,
  rawName: string,
): Party | null {
  const target = normalized(rawName);
  if (target === '') {
    throw new CaptureValidationError('Customer or Party is required');
  }

  const matches = dashboard.work.parties.filter(
    (party) => normalized(party.name) === target,
  );

  if (matches.length > 1) {
    throw new CaptureValidationError(
      'Multiple Parties share this exact name; choose the intended Party before creating the Repair',
    );
  }

  return matches[0] ?? null;
}

export function johannesburgLocalToIso(value: string): string {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (match === null) {
    throw new CaptureValidationError(
      'Date and time must use the Johannesburg local format',
    );
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  const utcMillis = Date.UTC(year, month - 1, day, hour - 2, minute);
  const localCheck = new Date(utcMillis + 2 * 60 * 60 * 1000);

  if (
    localCheck.getUTCFullYear() !== year ||
    localCheck.getUTCMonth() !== month - 1 ||
    localCheck.getUTCDate() !== day ||
    localCheck.getUTCHours() !== hour ||
    localCheck.getUTCMinutes() !== minute
  ) {
    throw new CaptureValidationError('Date and time is not valid');
  }

  return new Date(utcMillis).toISOString();
}

export async function submitTaskCapture(
  api: OperationsApi,
  dashboard: DashboardResultPayload,
  draft: TaskCaptureDraft,
  plan: TaskCapturePlan,
): Promise<Task> {
  const job = resolveJob(dashboard, draft.jobKey);
  const input = createTaskInputSchema.parse({
    jobId: job?.id ?? null,
    title: draft.title,
    priority: 'NORMAL',
    dueAt:
      draft.dueLocal.trim() === ''
        ? null
        : johannesburgLocalToIso(draft.dueLocal),
    followUpAt: null,
  });
  return api.createTask(plan.mutationId, input);
}

export async function submitRepairCapture(
  api: OperationsApi,
  dashboard: DashboardResultPayload,
  draft: RepairCaptureDraft,
  plan: RepairCapturePlan,
): Promise<{ party: Party; job: Job; repair: Repair }> {
  const existingParty = resolveParty(dashboard, draft.partyName);
  const serial = draft.serial.trim();

  return api.createRepairCase(
    plan.mutationId,
    createRepairCaseInputSchema.parse({
      party:
        existingParty === null
          ? {
              mode: 'NEW_CUSTOMER',
              name: draft.partyName,
            }
          : {
              mode: 'EXISTING',
              partyId: existingParty.id,
            },
      jobTitle: draft.itemTitle,
      reportedFault: draft.reportedFault,
      serialState: serial === '' ? 'UNKNOWN' : 'KNOWN',
      serialValue: serial === '' ? null : serial,
      storageLocation: null,
    }),
  );
}

export async function submitReminderCapture(
  api: OperationsApi,
  dashboard: DashboardResultPayload,
  draft: ReminderCaptureDraft,
  plan: ReminderCapturePlan,
): Promise<ScheduledAction> {
  const job = resolveJob(dashboard, draft.jobKey);
  const recurrenceRule =
    draft.repeat === 'once'
      ? null
      : draft.repeat === 'daily'
        ? 'FREQ=DAILY;INTERVAL=1'
        : 'FREQ=WEEKLY;INTERVAL=1';

  const input = createScheduledActionInputSchema.parse({
    jobId: job?.id ?? null,
    taskId: null,
    title: draft.title,
    actionType: 'REMINDER',
    payload: {
      kind: 'REMINDER',
      message: draft.title,
    },
    timezone: 'Africa/Johannesburg',
    recurrenceRule,
    runAt: johannesburgLocalToIso(draft.runAtLocal),
  });

  return api.createScheduledAction(plan.mutationId, input);
}
