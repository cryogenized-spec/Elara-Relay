import { describe, expect, it } from 'vitest';
import {
  repairsResultSchema,
  scheduleResultSchema,
  taskViewSchema,
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
});
