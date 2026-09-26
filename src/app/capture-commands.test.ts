import { describe, expect, it, vi } from 'vitest';
import type { DashboardResultPayload } from '../contracts/read-model';
import type { OperationsApi } from './operations-api';
import {
  CaptureValidationError,
  createReminderCapturePlan,
  createRepairCapturePlan,
  createTaskCapturePlan,
  johannesburgLocalToIso,
  submitReminderCapture,
  submitRepairCapture,
  submitTaskCapture,
} from './capture-commands';

const PARTY_ID = '10000000-0000-4000-8000-000000000001';
const JOB_ID = '10000000-0000-4000-8000-000000000002';
const TASK_ID = '10000000-0000-4000-8000-000000000003';
const REPAIR_ID = '10000000-0000-4000-8000-000000000004';
const ACTION_ID = '10000000-0000-4000-8000-000000000005';

const dashboard = {
  today: {
    asOf: '2026-09-26T03:00:00.000Z',
    tasks: [],
    repairs: [],
    scheduledActions: [],
  },
  work: {
    parties: [
      {
        id: PARTY_ID,
        name: 'Existing Customer',
        kind: 'CUSTOMER',
        createdAt: '2026-09-26T02:00:00.000Z',
        updatedAt: '2026-09-26T02:00:00.000Z',
        revision: 1,
      },
    ],
    jobs: [
      {
        id: JOB_ID,
        key: 'JOB-ABCDEF12',
        title: 'Existing Job',
        category: 'ACTIVE',
        partyId: PARTY_ID,
        createdAt: '2026-09-26T02:00:00.000Z',
        updatedAt: '2026-09-26T02:00:00.000Z',
        revision: 1,
      },
    ],
    tasks: [],
  },
  repairs: {
    parties: [
      {
        id: PARTY_ID,
        name: 'Existing Customer',
        kind: 'CUSTOMER',
        createdAt: '2026-09-26T02:00:00.000Z',
        updatedAt: '2026-09-26T02:00:00.000Z',
        revision: 1,
      },
    ],
    jobs: [
      {
        id: JOB_ID,
        key: 'JOB-ABCDEF12',
        title: 'Existing Job',
        category: 'ACTIVE',
        partyId: PARTY_ID,
        createdAt: '2026-09-26T02:00:00.000Z',
        updatedAt: '2026-09-26T02:00:00.000Z',
        revision: 1,
      },
    ],
    repairs: [],
  },
  schedule: {
    asOf: '2026-09-26T03:00:00.000Z',
    due: [],
    upcoming: [],
    paused: [],
  },
} satisfies DashboardResultPayload;

function apiMock() {
  return {
    createParty: vi.fn(),
    createJob: vi.fn(),
    createTask: vi.fn(),
    createRepair: vi.fn(),
    createRepairCase: vi.fn(),
    createScheduledAction: vi.fn(),
  } as unknown as OperationsApi;
}

describe('capture commands', () => {
  it('converts Johannesburg wall-clock values explicitly to UTC', () => {
    expect(johannesburgLocalToIso('2026-09-26T14:30')).toBe(
      '2026-09-26T12:30:00.000Z',
    );
    expect(() => johannesburgLocalToIso('2026-02-31T14:30')).toThrow(
      CaptureValidationError,
    );
  });

  it('resolves exact Job keys for Task capture', async () => {
    const api = apiMock();
    vi.mocked(api.createTask).mockResolvedValue({
      id: TASK_ID,
      jobId: JOB_ID,
      title: 'Check stock',
      status: 'INBOX',
      priority: 'NORMAL',
      dueAt: '2026-09-26T12:30:00.000Z',
      followUpAt: null,
      waitingOn: null,
      waitingSince: null,
      createdAt: '2026-09-26T03:00:00.000Z',
      updatedAt: '2026-09-26T03:00:00.000Z',
      revision: 1,
    });

    const plan = createTaskCapturePlan(() => '11111111-1111-4111-8111-111111111111');
    await submitTaskCapture(
      api,
      dashboard,
      {
        title: 'Check stock',
        dueLocal: '2026-09-26T14:30',
        jobKey: 'job-abcdef12',
      },
      plan,
    );

    expect(api.createTask).toHaveBeenCalledWith(
      'MUT-11111111-1111-4111-8111-111111111111',
      {
        jobId: JOB_ID,
        title: 'Check stock',
        priority: 'NORMAL',
        dueAt: '2026-09-26T12:30:00.000Z',
        followUpAt: null,
      },
    );
  });

  it('reuses an exact Party match instead of creating a duplicate', async () => {
    const api = apiMock();
    const createdJob = {
      ...dashboard.work.jobs[0]!,
      id: '10000000-0000-4000-8000-000000000020',
      key: 'JOB-11223344',
      title: 'Avenge X',
    };
    vi.mocked(api.createJob).mockResolvedValue(createdJob);
    vi.mocked(api.createRepair).mockResolvedValue({
      id: REPAIR_ID,
      jobId: createdJob.id,
      stage: 'RECEIVED',
      reportedFault: 'Pressure loss',
      diagnosis: null,
      currentFinding: null,
      serialState: 'KNOWN',
      serialValue: 'AVX-1',
      storageLocation: null,
      waitingOn: null,
      followUpAt: null,
      finalTestResult: null,
      finalTestDetail: null,
      testedAt: null,
      receivedAt: '2026-09-26T03:00:00.000Z',
      readyAt: null,
      collectedAt: null,
      cancelledAt: null,
      createdAt: '2026-09-26T03:00:00.000Z',
      updatedAt: '2026-09-26T03:00:00.000Z',
      revision: 1,
    });

    const plan = createRepairCapturePlan(() => '22222222-2222-4222-8222-222222222222');
    await submitRepairCapture(
      api,
      dashboard,
      {
        partyName: ' existing customer ',
        itemTitle: 'Avenge X',
        reportedFault: 'Pressure loss',
        serial: 'AVX-1',
      },
      plan,
    );

    expect(api.createParty).not.toHaveBeenCalled();
    expect(api.createJob).toHaveBeenCalledWith(
      'MUT-22222222-2222-4222-8222-222222222222',
      expect.objectContaining({ partyId: PARTY_ID }),
    );
  });

  it('reuses one atomic Repair-case mutation ID across retries', async () => {
    const api = apiMock();
    const result = {
      party: {
        id: '10000000-0000-4000-8000-000000000030',
        name: 'New Customer',
        kind: 'CUSTOMER' as const,
        createdAt: '2026-09-26T03:00:00.000Z',
        updatedAt: '2026-09-26T03:00:00.000Z',
        revision: 1,
      },
      job: {
        id: '10000000-0000-4000-8000-000000000031',
        key: 'JOB-55667788',
        title: 'P29 repair',
        category: 'ACTIVE' as const,
        partyId: '10000000-0000-4000-8000-000000000030',
        createdAt: '2026-09-26T03:00:00.000Z',
        updatedAt: '2026-09-26T03:00:00.000Z',
        revision: 1,
      },
      repair: {
        id: REPAIR_ID,
        jobId: '10000000-0000-4000-8000-000000000031',
        stage: 'RECEIVED' as const,
        reportedFault: 'Trigger fault',
        diagnosis: null,
        currentFinding: null,
        serialState: 'UNKNOWN' as const,
        serialValue: null,
        storageLocation: null,
        waitingOn: null,
        followUpAt: null,
        finalTestResult: null,
        finalTestDetail: null,
        testedAt: null,
        receivedAt: '2026-09-26T03:00:00.000Z',
        readyAt: null,
        collectedAt: null,
        cancelledAt: null,
        createdAt: '2026-09-26T03:00:00.000Z',
        updatedAt: '2026-09-26T03:00:00.000Z',
        revision: 1,
      },
    };

    vi.mocked(api.createRepairCase)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(result);

    const plan = createRepairCapturePlan(
      () => '33333333-3333-4333-8333-333333333333',
    );
    const draft = {
      partyName: 'New Customer',
      itemTitle: 'P29 repair',
      reportedFault: 'Trigger fault',
      serial: '',
    };

    await expect(
      submitRepairCapture(api, dashboard, draft, plan),
    ).rejects.toThrow('network');
    await submitRepairCapture(api, dashboard, draft, plan);

    expect(api.createRepairCase).toHaveBeenCalledTimes(2);
    expect(api.createRepairCase).toHaveBeenNthCalledWith(
      1,
      'MUT-33333333-3333-4333-8333-333333333333',
      expect.objectContaining({
        party: {
          mode: 'NEW_CUSTOMER',
          name: 'New Customer',
        },
        jobTitle: 'P29 repair',
      }),
    );
    expect(api.createRepairCase).toHaveBeenNthCalledWith(
      2,
      'MUT-33333333-3333-4333-8333-333333333333',
      expect.anything(),
    );
  });

  it('creates a Johannesburg reminder with reviewed recurrence', async () => {
    const api = apiMock();
    vi.mocked(api.createScheduledAction).mockResolvedValue({
      id: ACTION_ID,
      jobId: JOB_ID,
      taskId: null,
      title: 'Check supplier',
      actionType: 'REMINDER',
      payload: { kind: 'REMINDER', message: 'Check supplier' },
      timezone: 'Africa/Johannesburg',
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      status: 'ACTIVE',
      runAt: '2026-09-26T12:00:00.000Z',
      nextRunAt: '2026-09-26T12:00:00.000Z',
      lastRunAt: null,
      createdAt: '2026-09-26T03:00:00.000Z',
      updatedAt: '2026-09-26T03:00:00.000Z',
      revision: 1,
    });

    const plan = createReminderCapturePlan(() => '44444444-4444-4444-8444-444444444444');
    await submitReminderCapture(
      api,
      dashboard,
      {
        title: 'Check supplier',
        runAtLocal: '2026-09-26T14:00',
        repeat: 'daily',
        jobKey: 'JOB-ABCDEF12',
      },
      plan,
    );

    expect(api.createScheduledAction).toHaveBeenCalledWith(
      'MUT-44444444-4444-4444-8444-444444444444',
      expect.objectContaining({
        jobId: JOB_ID,
        recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
        runAt: '2026-09-26T12:00:00.000Z',
      }),
    );
  });
});
