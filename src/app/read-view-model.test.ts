import { describe, expect, it } from 'vitest';
import {
  buildRepairsView,
  buildScheduleView,
  buildSearchGroups,
  buildTodayView,
  buildWorkView,
} from './read-view-model';

const PARTY_ID = '10000000-0000-4000-8000-000000000001';
const JOB_ID = '10000000-0000-4000-8000-000000000002';
const TASK_ID = '10000000-0000-4000-8000-000000000003';
const REPAIR_ID = '10000000-0000-4000-8000-000000000004';
const ACTION_ID = '10000000-0000-4000-8000-000000000005';

const party = {
  id: PARTY_ID,
  name: 'Workshop customer',
  kind: 'CUSTOMER' as const,
  createdAt: '2026-09-24T08:00:00.000Z',
  updatedAt: '2026-09-24T08:00:00.000Z',
  revision: 1,
};

const job = {
  id: JOB_ID,
  key: 'JOB-ABCDEF12',
  title: 'Regulator service',
  category: 'WAITING' as const,
  partyId: PARTY_ID,
  createdAt: '2026-09-24T08:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
  revision: 2,
};

const task = {
  id: TASK_ID,
  jobId: JOB_ID,
  title: 'Pressure test',
  status: 'DOING' as const,
  priority: 'HIGH' as const,
  dueAt: '2026-09-25T02:00:00.000Z',
  followUpAt: null,
  waitingOn: null,
  waitingSince: null,
  createdAt: '2026-09-24T08:30:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
  revision: 2,
};

const repair = {
  id: REPAIR_ID,
  jobId: JOB_ID,
  stage: 'AWAITING_PARTS' as const,
  reportedFault: 'Pressure loss',
  diagnosis: 'Transfer seal',
  currentFinding: 'Seal leaks under pressure',
  serialState: 'KNOWN' as const,
  serialValue: 'AVX-240924',
  storageLocation: 'Workshop',
  waitingOn: 'Seal kit',
  followUpAt: '2026-09-25T02:00:00.000Z',
  finalTestResult: null,
  finalTestDetail: null,
  testedAt: null,
  receivedAt: '2026-09-24T08:00:00.000Z',
  readyAt: null,
  collectedAt: null,
  cancelledAt: null,
  createdAt: '2026-09-24T08:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
  revision: 3,
};

const action = {
  id: ACTION_ID,
  jobId: JOB_ID,
  taskId: TASK_ID,
  title: 'Check supplier ETA',
  actionType: 'REMINDER' as const,
  payload: { kind: 'REMINDER' as const, message: 'Check supplier ETA' },
  timezone: 'Africa/Johannesburg' as const,
  recurrenceRule: null,
  status: 'ACTIVE' as const,
  runAt: '2026-09-25T12:00:00.000Z',
  nextRunAt: '2026-09-25T12:00:00.000Z',
  lastRunAt: null,
  createdAt: '2026-09-24T08:00:00.000Z',
  updatedAt: '2026-09-24T08:00:00.000Z',
  revision: 1,
};

describe('read model view adapter', () => {
  it('keeps Jobs and Tasks distinct in Work', () => {
    const view = buildWorkView({
      parties: [party],
      jobs: [job],
      tasks: [task],
    });

    expect(view.jobs).toHaveLength(1);
    expect(view.jobs[0]).toMatchObject({
      entityType: 'JOB',
      title: 'Regulator service',
      badge: 'Waiting',
    });
    expect(view.tasks[0]).toMatchObject({
      entityType: 'TASK',
      title: 'Pressure test',
      badge: 'Doing',
    });
  });

  it('groups waiting repairs by their real stage', () => {
    const view = buildRepairsView({
      parties: [party],
      jobs: [job],
      repairs: [repair],
    });

    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]?.label).toBe('Waiting');
    expect(view.groups[0]?.rows[0]).toMatchObject({
      entityType: 'REPAIR',
      title: 'Regulator service',
      badge: 'Waiting',
    });
  });

  it('builds Today from due work, waiting repairs, ready work and upcoming schedule', () => {
    const readyRepair = {
      ...repair,
      id: '10000000-0000-4000-8000-000000000006',
      stage: 'READY' as const,
      waitingOn: null,
      followUpAt: null,
      finalTestResult: 'PASS' as const,
      finalTestDetail: 'Passed',
      testedAt: '2026-09-25T02:10:00.000Z',
      readyAt: '2026-09-25T02:10:00.000Z',
    };

    const view = buildTodayView(
      {
        asOf: '2026-09-25T03:00:00.000Z',
        tasks: [task],
        repairs: [repair],
        scheduledActions: [],
      },
      {
        parties: [party],
        jobs: [job],
        repairs: [repair, readyRepair],
      },
      {
        asOf: '2026-09-25T03:00:00.000Z',
        due: [],
        upcoming: [action],
        paused: [],
      },
      { parties: [party], jobs: [job], tasks: [task] },
    );

    expect(view.summary).toEqual({
      overdue: 1,
      today: 1,
      waiting: 1,
      ready: 1,
    });
    expect(view.attention).toHaveLength(2);
    expect(view.ready[0]?.badge).toBe('Ready');
    expect(view.next[0]?.title).toBe('Check supplier ETA');
  });

  it('renders due Scheduled Actions in Today attention', () => {
    const dueAction = {
      ...action,
      nextRunAt: '2026-09-25T02:50:00.000Z',
      runAt: '2026-09-25T02:50:00.000Z',
    };

    const view = buildTodayView(
      {
        asOf: '2026-09-25T03:00:00.000Z',
        tasks: [],
        repairs: [],
        scheduledActions: [dueAction],
      },
      { parties: [party], jobs: [job], repairs: [] },
      {
        asOf: '2026-09-25T03:00:00.000Z',
        due: [dueAction],
        upcoming: [],
        paused: [],
      },
      { parties: [party], jobs: [job], tasks: [task] },
    );

    expect(view.summary.today).toBe(1);
    expect(view.attention).toEqual([
      expect.objectContaining({
        entityType: 'SCHEDULED_ACTION',
        title: 'Check supplier ETA',
        badge: 'Due',
        tone: 'attention',
      }),
    ]);
  });

  it('uses an expired follow-up when that is what made a Task due', () => {
    const followUpTask = {
      ...task,
      dueAt: '2026-09-25T05:00:00.000Z',
      followUpAt: '2026-09-25T02:30:00.000Z',
    };

    const view = buildTodayView(
      {
        asOf: '2026-09-25T03:00:00.000Z',
        tasks: [followUpTask],
        repairs: [],
        scheduledActions: [],
      },
      { parties: [party], jobs: [job], repairs: [] },
      {
        asOf: '2026-09-25T03:00:00.000Z',
        due: [],
        upcoming: [],
        paused: [],
      },
      { parties: [party], jobs: [job], tasks: [followUpTask] },
    );

    expect(view.summary.overdue).toBe(1);
    expect(view.attention[0]).toMatchObject({
      badge: 'Overdue',
      tone: 'danger',
    });
    expect(view.attention[0]?.meta).toContain('Follow up');
    expect(view.attention[0]?.meta).not.toContain('Due Fri');
  });

  it('surfaces Event-only Search matches as non-domain history rows', () => {
    const groups = buildSearchGroups({
      parties: [],
      jobs: [],
      tasks: [],
      repairs: [],
      scheduledActions: [],
      events: [
        {
          id: '10000000-0000-4000-8000-000000000099',
          mutationId: 'MUT-search-history-0001',
          entityType: 'JOB',
          entityId: JOB_ID,
          eventType: 'JOB_NOTE',
          actor: 'operator-ui',
          occurredAt: '2026-09-25T02:30:00.000Z',
          detail: 'Supplier confirmed seal kit',
          changes: {},
          revisionAfter: 2,
        },
      ],
    }, '2026-09-25T03:00:00.000Z');

    expect(groups).toEqual([
      expect.objectContaining({
        label: 'History',
        rows: [
          expect.objectContaining({
            entityType: 'EVENT',
            title: 'Supplier confirmed seal kit',
            badge: 'History',
          }),
        ],
      }),
    ]);
  });

  it('does not describe a Search Repair as unlinked when Job context is absent', () => {
    const groups = buildSearchGroups({
      parties: [],
      jobs: [],
      tasks: [],
      repairs: [repair],
      scheduledActions: [],
      events: [],
    }, '2026-09-25T03:00:00.000Z');

    expect(groups[0]?.rows[0]).toMatchObject({
      entityType: 'REPAIR',
      eyebrow: 'REPAIR · LINKED JOB',
      title: 'Pressure loss',
    });
  });

  it('does not infer open Task counts from partial Search matches', () => {
    const groups = buildSearchGroups(
      {
        parties: [party],
        jobs: [job],
        tasks: [],
        repairs: [],
        scheduledActions: [],
        events: [],
      },
      '2026-09-25T03:00:00.000Z',
    );

    expect(groups[0]?.label).toBe('Jobs');
    expect(groups[0]?.rows[0]).toMatchObject({
      title: 'Regulator service',
      meta: 'Workshop customer',
    });
    expect(groups[0]?.rows[0]?.meta).not.toContain('open Task');
  });

  it('preserves terminal and due Scheduled Action state in Search', () => {
    const completed = {
      ...action,
      id: '10000000-0000-4000-8000-000000000080',
      status: 'COMPLETED' as const,
      nextRunAt: null,
    };
    const cancelled = {
      ...action,
      id: '10000000-0000-4000-8000-000000000081',
      status: 'CANCELLED' as const,
      nextRunAt: null,
    };
    const due = {
      ...action,
      id: '10000000-0000-4000-8000-000000000082',
      nextRunAt: '2026-09-25T02:30:00.000Z',
    };

    const groups = buildSearchGroups(
      {
        parties: [],
        jobs: [],
        tasks: [],
        repairs: [],
        scheduledActions: [completed, cancelled, due],
        events: [],
      },
      '2026-09-25T03:00:00.000Z',
    );

    expect(groups[0]?.label).toBe('Schedule');
    expect(groups[0]?.rows.map((row) => row.badge)).toEqual([
      'Completed',
      'Cancelled',
      'Due',
    ]);
  });

  it('preserves due/upcoming/paused scheduler state', () => {
    const view = buildScheduleView(
      {
        asOf: '2026-09-25T03:00:00.000Z',
        due: [action],
        upcoming: [{ ...action, id: '10000000-0000-4000-8000-000000000006' }],
        paused: [{
          ...action,
          id: '10000000-0000-4000-8000-000000000007',
          status: 'PAUSED' as const,
        }],
      },
      { parties: [party], jobs: [job], tasks: [task] },
    );

    expect(view.rows.map((row) => row.badge)).toEqual([
      'Due',
      'Upcoming',
      'Paused',
    ]);
  });
});

describe('scheduled relationship presentation', () => {
  it('resolves task-only Scheduled Action Job context', () => {
    const taskOnlyAction = {
      ...action,
      jobId: null,
      taskId: task.id,
      id: '10000000-0000-4000-8000-000000000099',
    };
    const view = buildScheduleView(
      {
        asOf: '2026-09-25T03:00:00.000Z',
        due: [],
        upcoming: [taskOnlyAction],
        paused: [],
      },
      { parties: [party], jobs: [job], tasks: [task] },
    );

    expect(view.rows[0]?.meta).toContain(job.key);
  });
});
