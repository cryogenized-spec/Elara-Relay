import { describe, expect, it } from 'vitest';
import {
  dashboardResultSchema,
  jobViewSchema,
  repairViewSchema,
  repairsResultSchema,
  scheduleResultSchema,
  searchResultSchema,
  taskViewSchema,
  todayResultSchema,
  workResultSchema,
} from './read-model';

const PARTY_ID = '10000000-0000-4000-8000-000000000001';
const JOB_ID = '10000000-0000-4000-8000-000000000002';
const OTHER_JOB_ID = '10000000-0000-4000-8000-000000000003';
const TASK_ID = '10000000-0000-4000-8000-000000000004';
const REPAIR_ID = '10000000-0000-4000-8000-000000000005';
const ACTION_ID = '10000000-0000-4000-8000-000000000006';

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
  category: 'ACTIVE' as const,
  partyId: PARTY_ID,
  createdAt: '2026-09-24T08:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
  revision: 1,
};

const task = {
  id: TASK_ID,
  jobId: JOB_ID,
  title: 'Pressure test',
  status: 'NEXT' as const,
  priority: 'NORMAL' as const,
  dueAt: null,
  followUpAt: null,
  waitingOn: null,
  waitingSince: null,
  createdAt: '2026-09-24T08:00:00.000Z',
  updatedAt: '2026-09-24T08:00:00.000Z',
  revision: 1,
};

const repair = {
  id: REPAIR_ID,
  jobId: JOB_ID,
  stage: 'DIAGNOSING' as const,
  reportedFault: 'Pressure loss',
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
  receivedAt: '2026-09-24T08:00:00.000Z',
  readyAt: null,
  collectedAt: null,
  cancelledAt: null,
  createdAt: '2026-09-24T08:00:00.000Z',
  updatedAt: '2026-09-24T08:00:00.000Z',
  revision: 1,
};

function action(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTION_ID,
    jobId: JOB_ID,
    taskId: TASK_ID,
    title: 'Follow up',
    actionType: 'REMINDER' as const,
    payload: { kind: 'REMINDER' as const, message: 'Follow up' },
    timezone: 'Africa/Johannesburg' as const,
    recurrenceRule: null,
    status: 'ACTIVE' as const,
    runAt: '2026-09-25T08:00:00.000Z',
    nextRunAt: '2026-09-25T08:00:00.000Z',
    lastRunAt: null,
    createdAt: '2026-09-24T08:00:00.000Z',
    updatedAt: '2026-09-24T08:00:00.000Z',
    revision: 1,
    ...overrides,
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000009',
    mutationId: 'MUT-read-model-test-0001',
    entityType: 'JOB' as const,
    entityId: JOB_ID,
    eventType: 'JOB_NOTE' as const,
    actor: 'operator-ui' as const,
    occurredAt: '2026-09-25T08:00:00.000Z',
    detail: 'Timeline note',
    changes: {},
    revisionAfter: 1,
    ...overrides,
  };
}

describe('read-model aggregate invariants', () => {
  it('rejects dangling Work relationships and duplicate ids', () => {
    expect(() =>
      workResultSchema.parse({
        parties: [party],
        jobs: [{ ...job, partyId: '10000000-0000-4000-8000-999999999999' }],
        tasks: [task],
      }),
    ).toThrow('Job partyId must reference a Party');

    expect(() =>
      workResultSchema.parse({
        parties: [party],
        jobs: [job],
        tasks: [{ ...task, jobId: OTHER_JOB_ID }],
      }),
    ).toThrow('Task jobId must reference a Job');

    expect(() =>
      workResultSchema.parse({
        parties: [party, party],
        jobs: [job],
        tasks: [task],
      }),
    ).toThrow('parties must contain unique ids');
  });

  it('rejects Repairs that reference missing Jobs', () => {
    expect(() =>
      repairsResultSchema.parse({
        parties: [party],
        jobs: [job],
        repairs: [{ ...repair, jobId: OTHER_JOB_ID }],
      }),
    ).toThrow('Repair jobId must reference a Job');
  });

  it('rejects Task detail with a mismatched Job', () => {
    expect(() =>
      taskViewSchema.parse({
        task,
        job: { ...job, id: OTHER_JOB_ID },
      }),
    ).toThrow('Task view Job must match task.jobId');
  });

  it('rejects semantically invalid or duplicated scheduler buckets', () => {
    const asOf = '2026-09-25T09:00:00.000Z';

    expect(() =>
      scheduleResultSchema.parse({
        asOf,
        due: [],
        upcoming: [action({ nextRunAt: '2026-09-25T08:00:00.000Z' })],
        paused: [],
      }),
    ).toThrow('Upcoming actions must be ACTIVE with nextRunAt after asOf');

    expect(() =>
      scheduleResultSchema.parse({
        asOf,
        due: [],
        upcoming: [],
        paused: [action()],
      }),
    ).toThrow('Paused bucket may contain only PAUSED actions');

    const repeated = action({ nextRunAt: '2026-09-25T10:00:00.000Z' });
    expect(() =>
      scheduleResultSchema.parse({
        asOf,
        due: [],
        upcoming: [repeated, repeated],
        paused: [],
      }),
    ).toThrow('schedule must contain unique ids');
  });

  it('rejects every invalid Task detail relationship shape', () => {
    expect(() =>
      taskViewSchema.parse({
        task: { ...task, jobId: null },
        job,
      }),
    ).toThrow('Standalone Task view cannot contain a Job');

    expect(() =>
      taskViewSchema.parse({
        task,
        job: null,
      }),
    ).toThrow('Task view Job must match task.jobId');
  });

  it('rejects malformed Job detail aggregates', () => {
    const base = {
      job,
      party,
      tasks: [task],
      repair,
      repairWarnings: ['SERIAL_UNKNOWN'],
      scheduledActions: [action()],
      events: [],
    };

    expect(() =>
      jobViewSchema.parse({
        ...base,
        job: { ...job, partyId: null },
      }),
    ).toThrow('Job without partyId cannot contain a Party');

    expect(() =>
      jobViewSchema.parse({
        ...base,
        party: { ...party, id: '10000000-0000-4000-8000-999999999999' },
      }),
    ).toThrow('Job view Party must match job.partyId');

    expect(() =>
      jobViewSchema.parse({
        ...base,
        tasks: [{ ...task, jobId: OTHER_JOB_ID }],
      }),
    ).toThrow('Job view Tasks must reference the viewed Job');

    expect(() =>
      jobViewSchema.parse({
        ...base,
        repair: { ...repair, jobId: OTHER_JOB_ID },
      }),
    ).toThrow('Job view Repair must reference the viewed Job');

    expect(() =>
      jobViewSchema.parse({
        ...base,
        scheduledActions: [action({ jobId: OTHER_JOB_ID })],
      }),
    ).toThrow(
      'Job view Scheduled Actions must reference the viewed Job directly or through one of its Tasks',
    );

    expect(() =>
      jobViewSchema.parse({
        ...base,
        tasks: [base.tasks[0], base.tasks[0]],
      }),
    ).toThrow('tasks must contain unique ids');

    const repeatedAction = action();
    expect(() =>
      jobViewSchema.parse({
        ...base,
        scheduledActions: [repeatedAction, repeatedAction],
      }),
    ).toThrow('scheduledActions must contain unique ids');
  });

  it('rejects suppressed or fabricated Repair warnings', () => {
    expect(() =>
      repairViewSchema.parse({
        repair,
        warnings: [],
      }),
    ).toThrow('Repair view warnings must match the Repair state');

    expect(
      repairViewSchema.parse({
        repair,
        warnings: ['SERIAL_UNKNOWN'],
      }),
    ).toBeTruthy();

    const knownRepair = {
      ...repair,
      serialState: 'KNOWN' as const,
      serialValue: 'AVX-240924',
    };

    expect(() =>
      repairViewSchema.parse({
        repair: knownRepair,
        warnings: ['SERIAL_UNKNOWN'],
      }),
    ).toThrow('Repair view warnings must match the Repair state');

    expect(() =>
      jobViewSchema.parse({
        job,
        party,
        tasks: [task],
        repair,
        repairWarnings: [],
        scheduledActions: [action()],
        events: [],
      }),
    ).toThrow('Job Repair warnings must match the Repair state');

    expect(() =>
      jobViewSchema.parse({
        job,
        party,
        tasks: [task],
        repair: null,
        repairWarnings: ['SERIAL_UNKNOWN'],
        scheduledActions: [action()],
        events: [],
      }),
    ).toThrow('Job without a Repair cannot contain Repair warnings');
  });

  it('rejects event types that contradict their entity type', () => {
    expect(() =>
      jobViewSchema.parse({
        job,
        party,
        tasks: [task],
        repair,
        repairWarnings: ['SERIAL_UNKNOWN'],
        scheduledActions: [action()],
        events: [
          event({
            entityType: 'JOB',
            entityId: JOB_ID,
            eventType: 'TASK_COMPLETED',
          }),
        ],
      }),
    ).toThrow('TASK_COMPLETED is not valid for JOB events');

    expect(() =>
      jobViewSchema.parse({
        job,
        party,
        tasks: [task],
        repair,
        repairWarnings: ['SERIAL_UNKNOWN'],
        scheduledActions: [action()],
        events: [
          event({
            entityType: 'TASK',
            entityId: TASK_ID,
            eventType: 'REPAIR_STAGE_CHANGED',
          }),
        ],
      }),
    ).toThrow('REPAIR_STAGE_CHANGED is not valid for TASK events');
  });

  it('rejects duplicate Today entities instead of double-counting attention', () => {
    const base = {
      asOf: '2026-09-25T09:00:00.000Z',
      tasks: [
        {
          ...task,
          dueAt: '2026-09-25T08:00:00.000Z',
        },
      ],
      repairs: [
        {
          ...repair,
          stage: 'AWAITING_PARTS' as const,
          waitingOn: 'Seal kit',
          followUpAt: '2026-09-25T08:00:00.000Z',
        },
      ],
      scheduledActions: [
        action({ nextRunAt: '2026-09-25T08:00:00.000Z' }),
      ],
    };

    expect(() =>
      todayResultSchema.parse({
        ...base,
        tasks: [task, task],
      }),
    ).toThrow('tasks must contain unique ids');

    expect(() =>
      todayResultSchema.parse({
        ...base,
        repairs: [base.repairs[0], base.repairs[0]],
      }),
    ).toThrow('repairs must contain unique ids');

    const repeatedAction = base.scheduledActions[0];
    expect(() =>
      todayResultSchema.parse({
        ...base,
        scheduledActions: [repeatedAction, repeatedAction],
      }),
    ).toThrow('scheduledActions must contain unique ids');
  });

  it('rejects duplicate Work and Repairs entity sets', () => {
    expect(() =>
      workResultSchema.parse({
        parties: [party],
        jobs: [job, job],
        tasks: [task],
      }),
    ).toThrow('jobs must contain unique ids');

    expect(() =>
      workResultSchema.parse({
        parties: [party],
        jobs: [job],
        tasks: [task, task],
      }),
    ).toThrow('tasks must contain unique ids');

    expect(() =>
      repairsResultSchema.parse({
        parties: [party, party],
        jobs: [job],
        repairs: [repair],
      }),
    ).toThrow('parties must contain unique ids');

    expect(() =>
      repairsResultSchema.parse({
        parties: [party],
        jobs: [job, job],
        repairs: [repair],
      }),
    ).toThrow('jobs must contain unique ids');

    expect(() =>
      repairsResultSchema.parse({
        parties: [party],
        jobs: [job],
        repairs: [repair, repair],
      }),
    ).toThrow('repairs must contain unique ids');
  });

  it('rejects Repairs Jobs whose Party is absent', () => {
    expect(() =>
      repairsResultSchema.parse({
        parties: [party],
        jobs: [{ ...job, partyId: '10000000-0000-4000-8000-999999999999' }],
        repairs: [repair],
      }),
    ).toThrow('Job partyId must reference a Party in the Repairs aggregate');
  });

  it('rejects every invalid active scheduler bucket condition', () => {
    const asOf = '2026-09-25T09:00:00.000Z';

    for (const invalidDue of [
      action({ status: 'PAUSED', nextRunAt: '2026-09-25T08:00:00.000Z' }),
      action({ nextRunAt: null }),
      action({ nextRunAt: '2026-09-25T10:00:00.000Z' }),
    ]) {
      expect(() =>
        scheduleResultSchema.parse({
          asOf,
          due: [invalidDue],
          upcoming: [],
          paused: [],
        }),
      ).toThrow('Due actions must be ACTIVE with nextRunAt at or before asOf');
    }

    for (const invalidUpcoming of [
      action({ status: 'PAUSED', nextRunAt: '2026-09-25T10:00:00.000Z' }),
      action({ nextRunAt: null }),
      action({ nextRunAt: '2026-09-25T09:00:00.000Z' }),
    ]) {
      expect(() =>
        scheduleResultSchema.parse({
          asOf,
          due: [],
          upcoming: [invalidUpcoming],
          paused: [],
        }),
      ).toThrow('Upcoming actions must be ACTIVE with nextRunAt after asOf');
    }
  });

  it('accepts valid due, upcoming, and paused scheduler buckets together', () => {
    expect(
      scheduleResultSchema.parse({
        asOf: '2026-09-25T09:00:00.000Z',
        due: [action({ nextRunAt: '2026-09-25T08:00:00.000Z' })],
        upcoming: [
          action({
            id: '10000000-0000-4000-8000-000000000007',
            nextRunAt: '2026-09-25T10:00:00.000Z',
          }),
        ],
        paused: [
          action({
            id: '10000000-0000-4000-8000-000000000008',
            status: 'PAUSED',
          }),
        ],
      }),
    ).toBeTruthy();
  });

  it('accepts Job actions linked only through one of the Job Tasks', () => {
    expect(
      jobViewSchema.parse({
        job,
        party,
        tasks: [task],
        repair,
        repairWarnings: ['SERIAL_UNKNOWN'],
        scheduledActions: [action({ jobId: null, taskId: TASK_ID })],
        events: [],
      }),
    ).toBeTruthy();

    expect(() =>
      jobViewSchema.parse({
        job,
        party,
        tasks: [task],
        repair,
        repairWarnings: ['SERIAL_UNKNOWN'],
        scheduledActions: [
          action({
            jobId: null,
            taskId: '10000000-0000-4000-8000-999999999999',
          }),
        ],
        events: [],
      }),
    ).toThrow(
      'Job view Scheduled Actions must reference the viewed Job directly or through one of its Tasks',
    );
  });

  it('rejects events that are not members of the viewed Job aggregate', () => {
    const valid = {
      job,
      party,
      tasks: [task],
      repair,
      repairWarnings: ['SERIAL_UNKNOWN'],
      scheduledActions: [action()],
    };

    expect(
      jobViewSchema.parse({
        ...valid,
        events: [
          event(),
          event({
            id: '10000000-0000-4000-8000-000000000010',
            entityType: 'TASK',
            entityId: TASK_ID,
            eventType: 'TASK_UPDATED',
          }),
          event({
            id: '10000000-0000-4000-8000-000000000011',
            entityType: 'REPAIR',
            entityId: REPAIR_ID,
            eventType: 'REPAIR_DETAILS_UPDATED',
          }),
          event({
            id: '10000000-0000-4000-8000-000000000012',
            entityType: 'SCHEDULED_ACTION',
            entityId: ACTION_ID,
            eventType: 'SCHEDULED_ACTION_UPDATED',
          }),
        ],
      }),
    ).toBeTruthy();

    expect(() =>
      jobViewSchema.parse({
        ...valid,
        events: [
          event({
            entityType: 'PARTY',
            entityId: PARTY_ID,
            eventType: 'PARTY_CREATED',
          }),
        ],
      }),
    ).toThrow('Job view Events must reference the viewed Job aggregate');

    expect(() =>
      jobViewSchema.parse({
        ...valid,
        events: [
          event({
            entityId: OTHER_JOB_ID,
          }),
        ],
      }),
    ).toThrow('Job view Events must reference the viewed Job aggregate');
  });

  it('enforces Today membership semantics from the domain query', () => {
    const asOf = '2026-09-25T09:00:00.000Z';
    const dueTask = { ...task, dueAt: '2026-09-25T08:00:00.000Z' };
    const waitingRepair = {
      ...repair,
      stage: 'AWAITING_CUSTOMER' as const,
      waitingOn: 'Customer',
      followUpAt: '2026-09-25T08:00:00.000Z',
    };
    const dueAction = action({ nextRunAt: '2026-09-25T08:00:00.000Z' });

    expect(
      todayResultSchema.parse({
        asOf,
        tasks: [dueTask],
        repairs: [waitingRepair],
        scheduledActions: [dueAction],
      }),
    ).toBeTruthy();

    for (const invalidTask of [
      { ...dueTask, status: 'DONE' as const },
      { ...task, dueAt: '2026-09-25T10:00:00.000Z' },
      { ...task, dueAt: null, followUpAt: null },
    ]) {
      expect(() =>
        todayResultSchema.parse({
          asOf,
          tasks: [invalidTask],
          repairs: [],
          scheduledActions: [],
        }),
      ).toThrow(
        'Today Tasks must be non-terminal with dueAt or followUpAt at or before asOf',
      );
    }

    for (const invalidRepair of [
      repair,
      {
        ...waitingRepair,
        followUpAt: '2026-09-25T10:00:00.000Z',
      },
    ]) {
      expect(() =>
        todayResultSchema.parse({
          asOf,
          tasks: [],
          repairs: [invalidRepair],
          scheduledActions: [],
        }),
      ).toThrow(
        'Today Repairs must be waiting with followUpAt at or before asOf',
      );
    }

    for (const invalidAction of [
      action({
        status: 'PAUSED',
        nextRunAt: '2026-09-25T08:00:00.000Z',
      }),
      action({ nextRunAt: '2026-09-25T10:00:00.000Z' }),
    ]) {
      expect(() =>
        todayResultSchema.parse({
          asOf,
          tasks: [],
          repairs: [],
          scheduledActions: [invalidAction],
        }),
      ).toThrow(
        'Today Scheduled Actions must be ACTIVE with nextRunAt at or before asOf',
      );
    }
  });

  it('rejects internally inconsistent Dashboard snapshots', () => {
    const asOf = '2026-09-25T09:00:00.000Z';
    const dueTask = { ...task, dueAt: '2026-09-25T08:00:00.000Z' };
    const dueAction = action({ nextRunAt: '2026-09-25T08:00:00.000Z' });
    const dashboard = {
      today: {
        asOf,
        tasks: [dueTask],
        repairs: [],
        scheduledActions: [dueAction],
      },
      work: {
        parties: [party],
        jobs: [job],
        tasks: [dueTask],
      },
      repairs: {
        parties: [party],
        jobs: [job],
        repairs: [],
      },
      schedule: {
        asOf,
        due: [dueAction],
        upcoming: [],
        paused: [],
      },
    };

    expect(dashboardResultSchema.parse(dashboard)).toBeTruthy();

    expect(() =>
      dashboardResultSchema.parse({
        ...dashboard,
        schedule: { ...dashboard.schedule, asOf: '2026-09-25T09:01:00.000Z' },
      }),
    ).toThrow('Dashboard Today and Schedule must share one asOf timestamp');

    expect(() =>
      dashboardResultSchema.parse({
        ...dashboard,
        repairs: {
          ...dashboard.repairs,
          jobs: [{ ...job, revision: 2 }],
        },
      }),
    ).toThrow('Dashboard Work and Repairs must share Job versions');

    expect(() =>
      dashboardResultSchema.parse({
        ...dashboard,
        today: {
          ...dashboard.today,
          tasks: [{ ...dueTask, revision: 2 }],
        },
      }),
    ).toThrow('Dashboard Today Tasks must match Work Task versions');

    expect(() =>
      dashboardResultSchema.parse({
        ...dashboard,
        today: {
          ...dashboard.today,
          scheduledActions: [],
        },
      }),
    ).toThrow('Dashboard Today Scheduled Actions must equal Schedule due actions');
  });

  it('rejects duplicate entities in Search results', () => {
    expect(() =>
      searchResultSchema.parse({
        parties: [party, party],
        jobs: [],
        tasks: [],
        repairs: [],
        scheduledActions: [],
        events: [],
      }),
    ).toThrow('parties must contain unique ids');

    expect(() =>
      searchResultSchema.parse({
        parties: [],
        jobs: [job, job],
        tasks: [],
        repairs: [],
        scheduledActions: [],
        events: [],
      }),
    ).toThrow('jobs must contain unique ids');
  });

});
