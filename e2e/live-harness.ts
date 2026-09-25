import type { Page } from '@playwright/test';

const IDS = {
  user: '30000000-0000-4000-8000-000000000001',
  session: '30000000-0000-4000-8000-000000000002',
  party: '10000000-0000-4000-8000-000000000001',
  jobRepair: '10000000-0000-4000-8000-000000000002',
  jobWebsite: '10000000-0000-4000-8000-000000000003',
  jobReady: '10000000-0000-4000-8000-000000000004',
  taskStock: '10000000-0000-4000-8000-000000000005',
  taskPressure: '10000000-0000-4000-8000-000000000006',
  taskWebsite: '10000000-0000-4000-8000-000000000007',
  taskInbox: '10000000-0000-4000-8000-000000000008',
  taskSupplier: '10000000-0000-4000-8000-000000000009',
  repairWaiting: '10000000-0000-4000-8000-000000000010',
  repairReady: '10000000-0000-4000-8000-000000000011',
  actionDue: '10000000-0000-4000-8000-000000000012',
  actionNext: '10000000-0000-4000-8000-000000000013',
  actionPaused: '10000000-0000-4000-8000-000000000014',
  eventJob: '10000000-0000-4000-8000-000000000015',
} as const;

export interface LiveHarnessOptions {
  firstWhoAmIUnauthorized?: boolean;
  malformedWork?: boolean;
}

function isoOffset(asOf: string, minutes: number): string {
  return new Date(Date.parse(asOf) + minutes * 60_000).toISOString();
}

function sessionPayload() {
  return {
    access_token: 'test-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'test-refresh-token',
    user: {
      id: IDS.user,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'owner@example.com',
      email_confirmed_at: '2026-09-24T08:00:00.000Z',
      phone: '',
      confirmed_at: '2026-09-24T08:00:00.000Z',
      last_sign_in_at: '2026-09-25T04:00:00.000Z',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: '2026-09-24T08:00:00.000Z',
      updated_at: '2026-09-25T04:00:00.000Z',
      is_anonymous: false,
    },
  };
}

function baseParty() {
  return {
    id: IDS.party,
    name: 'Demo workshop customer',
    kind: 'CUSTOMER',
    createdAt: '2026-09-24T08:00:00.000Z',
    updatedAt: '2026-09-24T08:00:00.000Z',
    revision: 1,
  };
}

function jobs() {
  return [
    {
      id: IDS.jobRepair,
      key: 'JOB-7A31C4F2',
      title: 'Avenge X regulator repair',
      category: 'WAITING',
      partyId: IDS.party,
      createdAt: '2026-09-24T08:20:00.000Z',
      updatedAt: '2026-09-25T03:18:00.000Z',
      revision: 6,
    },
    {
      id: IDS.jobWebsite,
      key: 'JOB-42D117A0',
      title: 'Website product cleanup',
      category: 'ACTIVE',
      partyId: null,
      createdAt: '2026-09-24T09:00:00.000Z',
      updatedAt: '2026-09-25T03:10:00.000Z',
      revision: 2,
    },
    {
      id: IDS.jobReady,
      key: 'JOB-18E92B11',
      title: 'Baredda S56 — final check complete',
      category: 'DONE',
      partyId: IDS.party,
      createdAt: '2026-09-23T08:00:00.000Z',
      updatedAt: '2026-09-25T02:10:00.000Z',
      revision: 8,
    },
  ];
}

function tasks(asOf: string) {
  return [
    {
      id: IDS.taskStock,
      jobId: null,
      title: 'Confirm incoming PCP seal stock',
      status: 'NEXT',
      priority: 'HIGH',
      dueAt: isoOffset(asOf, -30),
      followUpAt: null,
      waitingOn: null,
      waitingSince: null,
      createdAt: '2026-09-24T08:00:00.000Z',
      updatedAt: '2026-09-24T08:00:00.000Z',
      revision: 1,
    },
    {
      id: IDS.taskPressure,
      jobId: IDS.jobRepair,
      title: 'Pressure-test regulator block',
      status: 'DOING',
      priority: 'HIGH',
      dueAt: isoOffset(asOf, 120),
      followUpAt: null,
      waitingOn: null,
      waitingSince: null,
      createdAt: '2026-09-25T02:42:00.000Z',
      updatedAt: '2026-09-25T03:04:00.000Z',
      revision: 3,
    },
    {
      id: IDS.taskWebsite,
      jobId: IDS.jobWebsite,
      title: 'Review product description queue',
      status: 'NEXT',
      priority: 'NORMAL',
      dueAt: isoOffset(asOf, 180),
      followUpAt: null,
      waitingOn: null,
      waitingSince: null,
      createdAt: '2026-09-25T02:00:00.000Z',
      updatedAt: '2026-09-25T02:00:00.000Z',
      revision: 1,
    },
    {
      id: IDS.taskInbox,
      jobId: null,
      title: 'Inspect returned CO₂ pistol',
      status: 'INBOX',
      priority: 'NORMAL',
      dueAt: null,
      followUpAt: null,
      waitingOn: null,
      waitingSince: null,
      createdAt: '2026-09-25T02:12:00.000Z',
      updatedAt: '2026-09-25T02:12:00.000Z',
      revision: 1,
    },
    {
      id: IDS.taskSupplier,
      jobId: IDS.jobRepair,
      title: 'Confirm supplier part availability',
      status: 'WAITING',
      priority: 'NORMAL',
      dueAt: null,
      followUpAt: isoOffset(asOf, 60),
      waitingOn: 'Supplier response',
      waitingSince: '2026-09-25T03:18:00.000Z',
      createdAt: '2026-09-25T02:30:00.000Z',
      updatedAt: '2026-09-25T03:18:00.000Z',
      revision: 2,
    },
  ];
}

function repairs(asOf: string) {
  return [
    {
      id: IDS.repairWaiting,
      jobId: IDS.jobRepair,
      stage: 'AWAITING_PARTS',
      reportedFault: 'Pressure drops after refill',
      diagnosis: 'Transfer seal leak',
      currentFinding: 'Regulator transfer seal leaking under pressure',
      serialState: 'KNOWN',
      serialValue: 'AVX-240924',
      storageLocation: 'Workshop · regulator tray',
      waitingOn: 'Transfer seal kit',
      followUpAt: isoOffset(asOf, -42),
      finalTestResult: null,
      finalTestDetail: null,
      testedAt: null,
      receivedAt: '2026-09-24T08:21:00.000Z',
      readyAt: null,
      collectedAt: null,
      cancelledAt: null,
      createdAt: '2026-09-24T08:21:00.000Z',
      updatedAt: '2026-09-25T03:18:00.000Z',
      revision: 4,
    },
    {
      id: IDS.repairReady,
      jobId: IDS.jobReady,
      stage: 'READY',
      reportedFault: 'Final function check',
      diagnosis: 'Service complete',
      currentFinding: 'Final test passed',
      serialState: 'UNKNOWN',
      serialValue: null,
      storageLocation: 'Collection shelf',
      waitingOn: null,
      followUpAt: null,
      finalTestResult: 'PASS',
      finalTestDetail: 'Four-point final test passed',
      testedAt: '2026-09-25T02:10:00.000Z',
      receivedAt: '2026-09-23T08:00:00.000Z',
      readyAt: '2026-09-25T02:10:00.000Z',
      collectedAt: null,
      cancelledAt: null,
      createdAt: '2026-09-23T08:00:00.000Z',
      updatedAt: '2026-09-25T02:10:00.000Z',
      revision: 8,
    },
  ];
}

function scheduledActions(asOf: string) {
  const make = (
    id: string,
    title: string,
    status: 'ACTIVE' | 'PAUSED',
    nextRunAt: string,
    recurrenceRule: string | null,
  ) => ({
    id,
    jobId: IDS.jobRepair,
    taskId: null,
    title,
    actionType: 'REMINDER',
    payload: { kind: 'REMINDER', message: title },
    timezone: 'Africa/Johannesburg',
    recurrenceRule,
    status,
    runAt: nextRunAt,
    nextRunAt,
    lastRunAt: null,
    createdAt: '2026-09-24T08:00:00.000Z',
    updatedAt: '2026-09-24T08:00:00.000Z',
    revision: 1,
  });

  return {
    due: [
      make(
        IDS.actionDue,
        'Follow up seal supplier',
        'ACTIVE',
        isoOffset(asOf, -10),
        null,
      ),
    ],
    upcoming: [
      make(
        IDS.actionNext,
        'Check supplier ETA',
        'ACTIVE',
        isoOffset(asOf, 60),
        null,
      ),
    ],
    paused: [
      make(
        IDS.actionPaused,
        'Website backlog review',
        'PAUSED',
        isoOffset(asOf, 1440),
        'FREQ=WEEKLY;INTERVAL=1',
      ),
    ],
  };
}

function jobEvent() {
  return {
    id: IDS.eventJob,
    mutationId: 'MUT-playwright-job-note-01',
    entityType: 'JOB',
    entityId: IDS.jobRepair,
    eventType: 'JOB_NOTE',
    actor: 'operator-ui',
    occurredAt: '2026-09-25T03:18:00.000Z',
    detail: 'Waiting on transfer seal kit',
    changes: {},
    revisionAfter: 6,
  };
}

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

export async function installLiveHarness(
  page: Page,
  options: LiveHarnessOptions = {},
): Promise<void> {
  let whoAmICalls = 0;

  await page.route('**/auth/v1/**', async (route) => {
    const url = new URL(route.request().url());

    if (
      url.pathname.endsWith('/token') ||
      url.pathname.endsWith('/token/')
    ) {
      await route.fulfill(json(sessionPayload()));
      return;
    }

    if (url.pathname.endsWith('/logout')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.fulfill(json(sessionPayload().user));
  });

  await page.route('**/api-test/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api-test/, '');
    const asOf =
      url.searchParams.get('asOf') ?? '2026-09-25T04:00:00.000Z';
    const allJobs = jobs();
    const allTasks = tasks(asOf);
    const allRepairs = repairs(asOf);
    const schedule = scheduledActions(asOf);

    if (path === '/auth/whoami') {
      whoAmICalls += 1;
      if (options.firstWhoAmIUnauthorized === true && whoAmICalls === 1) {
        await route.fulfill(
          json(
            {
              error: {
                code: 'UNAUTHENTICATED',
                message: 'Authentication required',
              },
            },
            401,
          ),
        );
        return;
      }
      await route.fulfill(
        json({
          userId: IDS.user,
          sessionId: IDS.session,
          email: 'owner@example.com',
          aal: 'aal1',
        }),
      );
      return;
    }

    if (path === '/today') {
      await route.fulfill(
        json({
          asOf,
          tasks: [allTasks[0]],
          repairs: [allRepairs[0]],
          scheduledActions: schedule.due,
        }),
      );
      return;
    }

    if (path === '/work') {
      if (options.malformedWork === true) {
        await route.fulfill(
          json({
            parties: [baseParty()],
            jobs: [allJobs[0]],
            tasks: [{ ...allTasks[1], jobId: IDS.jobWebsite }],
          }),
        );
        return;
      }
      await route.fulfill(
        json({
          parties: [baseParty()],
          jobs: allJobs,
          tasks: allTasks,
        }),
      );
      return;
    }

    if (path === '/repairs') {
      await route.fulfill(
        json({
          parties: [baseParty()],
          jobs: allJobs,
          repairs: allRepairs,
        }),
      );
      return;
    }

    if (path === '/schedule') {
      await route.fulfill(json({ asOf, ...schedule }));
      return;
    }

    if (path === '/search') {
      await route.fulfill(
        json({
          parties: [],
          jobs: [allJobs[0]],
          tasks: [],
          repairs: [allRepairs[0]],
          scheduledActions: [],
          events: [jobEvent()],
        }),
      );
      return;
    }

    if (path === `/jobs/${IDS.jobRepair}`) {
      await route.fulfill(
        json({
          job: allJobs[0],
          party: baseParty(),
          tasks: allTasks.filter((task) => task.jobId === IDS.jobRepair),
          repair: allRepairs[0],
          repairWarnings: [],
          scheduledActions: [...schedule.due, ...schedule.upcoming],
          events: [jobEvent()],
        }),
      );
      return;
    }

    if (path === `/tasks/${IDS.taskPressure}`) {
      await route.fulfill(
        json({
          task: allTasks.find((task) => task.id === IDS.taskPressure),
          job: allJobs[0],
        }),
      );
      return;
    }

    if (path === `/repairs/${IDS.repairWaiting}`) {
      await route.fulfill(
        json({
          repair: allRepairs[0],
          warnings: [],
        }),
      );
      return;
    }

    await route.fulfill(
      json({ error: { code: 'NOT_FOUND', message: 'Fixture route missing' } }, 404),
    );
  });
}

export async function signInOwner(page: Page): Promise<void> {
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel('Password').fill('playwright-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
}
