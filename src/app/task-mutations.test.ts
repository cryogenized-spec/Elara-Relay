import { describe, expect, it, vi } from 'vitest';
import type { OperationsApi } from './operations-api';
import {
  createTaskMutationPlan,
  johannesburgIsoToLocalInput,
  submitTaskCancel,
  submitTaskComplete,
  submitTaskEdit,
  submitTaskWaiting,
} from './task-mutations';

const task = {
  id: '10000000-0000-4000-8000-000000000001',
  jobId: null,
  title: 'Pressure test',
  status: 'NEXT' as const,
  priority: 'NORMAL' as const,
  dueAt: '2026-09-26T12:30:00.000Z',
  followUpAt: null,
  waitingOn: null,
  waitingSince: null,
  createdAt: '2026-09-26T03:00:00.000Z',
  updatedAt: '2026-09-26T03:00:00.000Z',
  revision: 4,
};

function createApiMocks() {
  const updateTask = vi.fn<OperationsApi['updateTask']>();
  const markTaskWaiting = vi.fn<OperationsApi['markTaskWaiting']>();
  const completeTask = vi.fn<OperationsApi['completeTask']>();
  const cancelTask = vi.fn<OperationsApi['cancelTask']>();
  return {
    api: {
      updateTask,
      markTaskWaiting,
      completeTask,
      cancelTask,
    } as unknown as OperationsApi,
    updateTask,
    markTaskWaiting,
    completeTask,
    cancelTask,
  };
}

describe('Task mutation commands', () => {
  it('formats persisted timestamps back into Johannesburg form values', () => {
    expect(
      johannesburgIsoToLocalInput('2026-09-26T12:30:00.000Z'),
    ).toBe('2026-09-26T14:30');
    expect(johannesburgIsoToLocalInput(null)).toBe('');
  });

  it('submits direct edits against the exact loaded revision', async () => {
    const { api, updateTask } = createApiMocks();
    updateTask.mockResolvedValue({ ...task, revision: 5, status: 'DOING' });

    const plan = createTaskMutationPlan(
      () => '11111111-1111-4111-8111-111111111111',
    );
    await submitTaskEdit(
      api,
      task,
      {
        status: 'DOING',
        priority: 'HIGH',
        dueLocal: '2026-09-26T15:00',
        followUpLocal: '',
      },
      plan,
    );

    expect(updateTask).toHaveBeenCalledWith(
      task.id,
      'MUT-11111111-1111-4111-8111-111111111111',
      4,
      {
        status: 'DOING',
        priority: 'HIGH',
        dueAt: '2026-09-26T13:00:00.000Z',
        followUpAt: null,
      },
    );
  });

  it('keeps a Waiting transition versioned and explicit', async () => {
    const { api, markTaskWaiting } = createApiMocks();
    markTaskWaiting.mockResolvedValue({
      ...task,
      status: 'WAITING',
      waitingOn: 'Supplier',
      waitingSince: '2026-09-26T03:10:00.000Z',
      revision: 5,
    });

    await submitTaskWaiting(
      api,
      task,
      'Supplier',
      '2026-09-27T09:00',
      createTaskMutationPlan(
        () => '22222222-2222-4222-8222-222222222222',
      ),
    );

    expect(markTaskWaiting).toHaveBeenCalledWith(
      task.id,
      'MUT-22222222-2222-4222-8222-222222222222',
      4,
      {
        waitingOn: 'Supplier',
        followUpAt: '2026-09-27T07:00:00.000Z',
      },
    );
  });

  it('uses the same revision contract for terminal actions', async () => {
    const { api, completeTask, cancelTask } = createApiMocks();
    completeTask.mockResolvedValue({ ...task, status: 'DONE', revision: 5 });
    cancelTask.mockResolvedValue({ ...task, status: 'CANCELLED', revision: 5 });

    const completePlan = createTaskMutationPlan(
      () => '33333333-3333-4333-8333-333333333333',
    );
    const cancelPlan = createTaskMutationPlan(
      () => '44444444-4444-4444-8444-444444444444',
    );

    await submitTaskComplete(api, task, completePlan);
    await submitTaskCancel(api, task, cancelPlan);

    expect(completeTask).toHaveBeenCalledWith(
      task.id,
      completePlan.mutationId,
      4,
    );
    expect(cancelTask).toHaveBeenCalledWith(
      task.id,
      cancelPlan.mutationId,
      4,
    );
  });
});
