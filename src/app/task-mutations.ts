import type { Task, TaskDirectStatus, TaskPriority } from '../contracts/task';
import type { OperationsApi } from './operations-api';
import {
  createMutationId,
  johannesburgLocalToIso,
} from './capture-commands';

export interface TaskMutationPlan {
  mutationId: string;
}

export interface TaskEditDraft {
  status: TaskDirectStatus;
  priority: TaskPriority;
  dueLocal: string;
  followUpLocal: string;
}

export function createTaskMutationPlan(
  uuid?: () => string,
): TaskMutationPlan {
  return { mutationId: createMutationId(uuid) };
}

export function johannesburgIsoToLocalInput(value: string | null): string {
  if (value === null) return '';
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${read('year')}-${read('month')}-${read('day')}T${read('hour')}:${read('minute')}`;
}

export async function submitTaskEdit(
  api: OperationsApi,
  task: Task,
  draft: TaskEditDraft,
  plan: TaskMutationPlan,
): Promise<Task> {
  return api.updateTask(
    task.id,
    plan.mutationId,
    task.revision,
    {
      status: draft.status,
      priority: draft.priority,
      dueAt:
        draft.dueLocal.trim() === ''
          ? null
          : johannesburgLocalToIso(draft.dueLocal),
      followUpAt:
        draft.followUpLocal.trim() === ''
          ? null
          : johannesburgLocalToIso(draft.followUpLocal),
    },
  );
}

export async function submitTaskWaiting(
  api: OperationsApi,
  task: Task,
  waitingOn: string,
  followUpLocal: string,
  plan: TaskMutationPlan,
): Promise<Task> {
  return api.markTaskWaiting(
    task.id,
    plan.mutationId,
    task.revision,
    {
      waitingOn,
      followUpAt:
        followUpLocal.trim() === ''
          ? null
          : johannesburgLocalToIso(followUpLocal),
    },
  );
}

export async function submitTaskComplete(
  api: OperationsApi,
  task: Task,
  plan: TaskMutationPlan,
): Promise<Task> {
  return api.completeTask(
    task.id,
    plan.mutationId,
    task.revision,
  );
}

export async function submitTaskCancel(
  api: OperationsApi,
  task: Task,
  plan: TaskMutationPlan,
): Promise<Task> {
  return api.cancelTask(
    task.id,
    plan.mutationId,
    task.revision,
  );
}
