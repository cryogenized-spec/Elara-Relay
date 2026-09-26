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
  taskCaptured: '10000000-0000-4000-8000-000000000016',
  actionCaptured: '10000000-0000-4000-8000-000000000017',
  partyCaptured: '10000000-0000-4000-8000-000000000018',
  jobCaptured: '10000000-0000-4000-8000-000000000019',
  repairCaptured: '10000000-0000-4000-8000-000000000020',
} as const;

type HarnessParty = {
  id: string;
  name: string;
  kind: 'CUSTOMER' | 'SUPPLIER' | 'OTHER';
  createdAt: string;
  updatedAt: string;
  revision: number;
};

type HarnessJob = {
  id: string;
  key: string;
  title: string;
  category: 'ACTIVE' | 'WAITING' | 'DONE' | 'CANCELLED';
  partyId: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

type HarnessRepair = {
  id: string;
  jobId: string;
  stage: 'RECEIVED' | 'DIAGNOSING' | 'AWAITING_PARTS' | 'AWAITING_CUSTOMER' | 'REPAIRING' | 'TESTING' | 'READY' | 'COLLECTED' | 'CANCELLED';
  reportedFault: string;
  diagnosis: string | null;
  currentFinding: string | null;
  serialState: 'KNOWN' | 'UNKNOWN' | 'NOT_APPLICABLE';
  serialValue: string | null;
  storageLocation: string | null;
  waitingOn: string | null;
  followUpAt: string | null;
  finalTestResult: 'PASS' | 'FAIL' | null;
  finalTestDetail: string | null;
  testedAt: string | null;
  receivedAt: string;
  readyAt: string | null;
  collectedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

type HarnessTask = {
  id: string;
  jobId: string | null;
  title: string;
  status: 'INBOX' | 'NEXT' | 'DOING' | 'WAITING' | 'DONE' | 'CANCELLED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  dueAt: string | null;
  followUpAt: string | null;
  waitingOn: string | null;
  waitingSince: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

type HarnessScheduledAction = {
  id: string;
  jobId: string | null;
  taskId: string | null;
  title: string;
  actionType: 'REMINDER';
  payload: {
    kind: 'REMINDER';
    message: string;
  };
  timezone: 'Africa/Johannesburg';
  recurrenceRule: string | null;
  status: 'ACTIVE' | 'PAUSED';
  runAt: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export interface LiveHarnessOptions {
  firstWhoAmIUnauthorized?: boolean;
  malformedWork?: boolean;
  failFirstTaskCreate?: boolean;
}

function isoOffset(asOf: string, minutes: number): string {
  return new Date(Date.parse(asOf) + minutes * 60_000).toISOString();
}

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value))
    .toString('base64url');
}

function sessionIdFor(index: number): string {
  return `30000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`;
}

function testAccessToken(
  grant: number,
  sessionId: string = IDS.session,
): string {
  const header = base64Url({ alg: 'none', typ: 'JWT' });
  const payload = base64Url({
    sub: IDS.user,
    session_id: sessionId,
    role: 'authenticated',
    aal: 'aal1',
    jti: `playwright-${grant}`,
  });
  return `${header}.${payload}.fixture`;
}

function sessionPayload(
  accessToken = testAccessToken(0),
) {
  return {
    access_token: accessToken,
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

function baseParty(): HarnessParty {
  return {
    id: IDS.party,
    name: 'Demo workshop customer',
    kind: 'CUSTOMER',
    createdAt: '2026-09-24T08:00:00.000Z',
    updatedAt: '2026-09-24T08:00:00.000Z',
    revision: 1,
  };
}

function jobs(): HarnessJob[] {
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

function tasks(asOf: string): HarnessTask[] {
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

function repairs(asOf: string): HarnessRepair[] {
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
  ): HarnessScheduledAction => ({
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
  let tokenGrantCount = 0;
  let logicalSessionIndex = -1;
  let currentSessionId: string = IDS.session;
  let capturedTask: HarnessTask | null = null;
  let mutatedPressureTask: HarnessTask | null = null;
  let capturedAction: HarnessScheduledAction | null = null;
  let capturedParty: HarnessParty | null = null;
  let capturedJob: HarnessJob | null = null;
  let capturedRepair: HarnessRepair | null = null;
  let taskCreateAttempts = 0;
  let firstTaskIntent:
    | { mutationId: string; inputJson: string }
    | null = null;

  await page.route('**/auth/v1/**', async (route) => {
    const url = new URL(route.request().url());

    if (
      url.pathname.endsWith('/token') ||
      url.pathname.endsWith('/token/')
    ) {
      tokenGrantCount += 1;
      if (url.searchParams.get('grant_type') !== 'refresh_token') {
        logicalSessionIndex += 1;
        currentSessionId = sessionIdFor(logicalSessionIndex);
      }
      await route.fulfill(
        json(
          sessionPayload(
            testAccessToken(tokenGrantCount, currentSessionId),
          ),
        ),
      );
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
    const allParties = [
      baseParty(),
      ...(capturedParty === null ? [] : [capturedParty]),
    ];
    const allJobs = [
      ...jobs(),
      ...(capturedJob === null ? [] : [capturedJob]),
    ];
    const baseTasks = tasks(asOf).map((task) =>
      task.id === IDS.taskPressure && mutatedPressureTask !== null
        ? mutatedPressureTask
        : task,
    );
    const allTasks = [
      ...baseTasks,
      ...(capturedTask === null ? [] : [capturedTask]),
    ];
    const allRepairs = [
      ...repairs(asOf),
      ...(capturedRepair === null ? [] : [capturedRepair]),
    ];
    const schedule = scheduledActions(asOf);
    if (capturedAction !== null) {
      if (
        capturedAction.nextRunAt !== null &&
        Date.parse(capturedAction.nextRunAt) <= Date.parse(asOf)
      ) {
        schedule.due.push(capturedAction);
      } else {
        schedule.upcoming.push(capturedAction);
      }
    }

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
          sessionId: currentSessionId,
          email: 'owner@example.com',
          aal: 'aal1',
        }),
      );
      return;
    }

    if (path === '/repair-cases' && route.request().method() === 'POST') {
      const raw = route.request().postDataJSON() as {
        mutation?: { mutationId?: unknown };
        input?: {
          party?: { mode?: unknown; partyId?: unknown; name?: unknown };
          jobTitle?: unknown;
          reportedFault?: unknown;
          serialState?: unknown;
          serialValue?: unknown;
          storageLocation?: unknown;
        };
      };

      if (
        typeof raw.mutation?.mutationId !== 'string' ||
        typeof raw.input?.jobTitle !== 'string' ||
        typeof raw.input?.reportedFault !== 'string'
      ) {
        await route.fulfill(
          json(
            {
              error: {
                code: 'INVALID_REQUEST',
                message: 'Repair-case fixture received invalid durable intent',
              },
            },
            400,
          ),
        );
        return;
      }

      let party: HarnessParty;
      if (raw.input.party?.mode === 'EXISTING') {
        const partyId =
          typeof raw.input.party.partyId === 'string'
            ? raw.input.party.partyId
            : '';
        const existing = allParties.find((candidate) => candidate.id === partyId);
        if (existing === undefined) {
          await route.fulfill(
            json(
              { error: { code: 'NOT_FOUND', message: 'Party not found' } },
              404,
            ),
          );
          return;
        }
        party = existing;
      } else {
        capturedParty ??= {
          id: IDS.partyCaptured,
          name:
            typeof raw.input.party?.name === 'string'
              ? raw.input.party.name
              : 'Captured customer',
          kind: 'CUSTOMER',
          createdAt: '2026-09-26T05:00:00.000Z',
          updatedAt: '2026-09-26T05:00:00.000Z',
          revision: 1,
        };
        party = capturedParty;
      }

      capturedJob ??= {
        id: IDS.jobCaptured,
        key: 'JOB-CAPTURE1',
        title: raw.input.jobTitle,
        category: 'ACTIVE',
        partyId: party.id,
        createdAt: '2026-09-26T05:00:00.000Z',
        updatedAt: '2026-09-26T05:00:00.000Z',
        revision: 1,
      };
      capturedRepair ??= {
        id: IDS.repairCaptured,
        jobId: capturedJob.id,
        stage: 'RECEIVED',
        reportedFault: raw.input.reportedFault,
        diagnosis: null,
        currentFinding: null,
        serialState:
          raw.input.serialState === 'KNOWN'
            ? 'KNOWN'
            : raw.input.serialState === 'NOT_APPLICABLE'
              ? 'NOT_APPLICABLE'
              : 'UNKNOWN',
        serialValue:
          typeof raw.input.serialValue === 'string'
            ? raw.input.serialValue
            : null,
        storageLocation:
          typeof raw.input.storageLocation === 'string'
            ? raw.input.storageLocation
            : null,
        waitingOn: null,
        followUpAt: null,
        finalTestResult: null,
        finalTestDetail: null,
        testedAt: null,
        receivedAt: '2026-09-26T05:00:00.000Z',
        readyAt: null,
        collectedAt: null,
        cancelledAt: null,
        createdAt: '2026-09-26T05:00:00.000Z',
        updatedAt: '2026-09-26T05:00:00.000Z',
        revision: 1,
      };

      await route.fulfill(
        json({ party, job: capturedJob, repair: capturedRepair }, 201),
      );
      return;
    }

    if (path === '/tasks' && route.request().method() === 'POST') {
      const raw = route.request().postDataJSON() as {
        mutation?: { mutationId?: unknown };
        input?: {
          jobId?: unknown;
          title?: unknown;
          priority?: unknown;
          dueAt?: unknown;
          followUpAt?: unknown;
        };
      };
      const mutationId =
        typeof raw.mutation?.mutationId === 'string'
          ? raw.mutation.mutationId
          : '';
      const inputJson = JSON.stringify(raw.input ?? null);
      taskCreateAttempts += 1;

      if (
        options.failFirstTaskCreate === true &&
        taskCreateAttempts === 1
      ) {
        firstTaskIntent = { mutationId, inputJson };
        await route.fulfill(
          json(
            {
              error: {
                code: 'TRANSIENT_TEST_FAILURE',
                message: 'Temporary Task save failure',
              },
            },
            503,
          ),
        );
        return;
      }

      if (
        firstTaskIntent !== null &&
        (firstTaskIntent.mutationId !== mutationId ||
          firstTaskIntent.inputJson !== inputJson)
      ) {
        await route.fulfill(
          json(
            {
              error: {
                code: 'CONFLICT',
                message: 'Retry changed durable mutation intent',
              },
            },
            409,
          ),
        );
        return;
      }

      if (capturedTask === null) {
        capturedTask = {
          id: IDS.taskCaptured,
          jobId:
            typeof raw.input?.jobId === 'string'
              ? raw.input.jobId
              : null,
          title:
            typeof raw.input?.title === 'string'
              ? raw.input.title
              : 'Captured Task',
          status: 'INBOX',
          priority:
            raw.input?.priority === 'URGENT' ||
            raw.input?.priority === 'HIGH' ||
            raw.input?.priority === 'LOW'
              ? raw.input.priority
              : 'NORMAL',
          dueAt:
            typeof raw.input?.dueAt === 'string'
              ? raw.input.dueAt
              : null,
          followUpAt:
            typeof raw.input?.followUpAt === 'string'
              ? raw.input.followUpAt
              : null,
          waitingOn: null,
          waitingSince: null,
          createdAt: '2026-09-26T04:45:00.000Z',
          updatedAt: '2026-09-26T04:45:00.000Z',
          revision: 1,
        };
      }

      await route.fulfill(json(capturedTask, 201));
      return;
    }

    if (
      path === `/tasks/${IDS.taskPressure}` &&
      route.request().method() === 'PATCH'
    ) {
      const current =
        mutatedPressureTask ??
        tasks(asOf).find((task) => task.id === IDS.taskPressure)!;
      const raw = route.request().postDataJSON() as {
        mutation?: { expectedRevision?: unknown };
        patch?: {
          title?: unknown;
          status?: unknown;
          priority?: unknown;
          dueAt?: unknown;
          followUpAt?: unknown;
        };
      };
      if (raw.mutation?.expectedRevision !== current.revision) {
        await route.fulfill(
          json(
            { error: { code: 'CONFLICT', message: 'Revision conflict' } },
            409,
          ),
        );
        return;
      }

      const patch = raw.patch ?? {};
      mutatedPressureTask = {
        ...current,
        ...(typeof patch.title === 'string' ? { title: patch.title } : {}),
        ...(patch.status === 'INBOX' ||
        patch.status === 'NEXT' ||
        patch.status === 'DOING'
          ? {
              status: patch.status,
              waitingOn: null,
              waitingSince: null,
            }
          : {}),
        ...(patch.priority === 'URGENT' ||
        patch.priority === 'HIGH' ||
        patch.priority === 'NORMAL' ||
        patch.priority === 'LOW'
          ? { priority: patch.priority }
          : {}),
        ...('dueAt' in patch
          ? {
              dueAt:
                typeof patch.dueAt === 'string' ? patch.dueAt : null,
            }
          : {}),
        ...('followUpAt' in patch
          ? {
              followUpAt:
                typeof patch.followUpAt === 'string'
                  ? patch.followUpAt
                  : null,
            }
          : {}),
        updatedAt: '2026-09-26T05:05:00.000Z',
        revision: current.revision + 1,
      };
      await route.fulfill(json(mutatedPressureTask));
      return;
    }

    if (
      path === `/tasks/${IDS.taskPressure}/wait` &&
      route.request().method() === 'POST'
    ) {
      const current =
        mutatedPressureTask ??
        tasks(asOf).find((task) => task.id === IDS.taskPressure)!;
      const raw = route.request().postDataJSON() as {
        mutation?: { expectedRevision?: unknown };
        input?: { waitingOn?: unknown; followUpAt?: unknown };
      };
      if (raw.mutation?.expectedRevision !== current.revision) {
        await route.fulfill(
          json(
            { error: { code: 'CONFLICT', message: 'Revision conflict' } },
            409,
          ),
        );
        return;
      }
      if (typeof raw.input?.waitingOn !== 'string') {
        await route.fulfill(
          json(
            { error: { code: 'INVALID_REQUEST', message: 'Waiting on is required' } },
            400,
          ),
        );
        return;
      }

      mutatedPressureTask = {
        ...current,
        status: 'WAITING',
        waitingOn: raw.input.waitingOn,
        waitingSince: '2026-09-26T05:06:00.000Z',
        followUpAt:
          typeof raw.input.followUpAt === 'string'
            ? raw.input.followUpAt
            : null,
        updatedAt: '2026-09-26T05:06:00.000Z',
        revision: current.revision + 1,
      };
      await route.fulfill(json(mutatedPressureTask));
      return;
    }

    if (
      (path === `/tasks/${IDS.taskPressure}/complete` ||
        path === `/tasks/${IDS.taskPressure}/cancel`) &&
      route.request().method() === 'POST'
    ) {
      const current =
        mutatedPressureTask ??
        tasks(asOf).find((task) => task.id === IDS.taskPressure)!;
      const raw = route.request().postDataJSON() as {
        mutation?: { expectedRevision?: unknown };
      };
      if (raw.mutation?.expectedRevision !== current.revision) {
        await route.fulfill(
          json(
            { error: { code: 'CONFLICT', message: 'Revision conflict' } },
            409,
          ),
        );
        return;
      }

      mutatedPressureTask = {
        ...current,
        status: path.endsWith('/complete') ? 'DONE' : 'CANCELLED',
        waitingOn: null,
        waitingSince: null,
        updatedAt: '2026-09-26T05:07:00.000Z',
        revision: current.revision + 1,
      };
      await route.fulfill(json(mutatedPressureTask));
      return;
    }

    if (path === '/schedule' && route.request().method() === 'POST') {
      const raw = route.request().postDataJSON() as {
        mutation?: { mutationId?: unknown };
        input?: {
          jobId?: unknown;
          taskId?: unknown;
          title?: unknown;
          actionType?: unknown;
          payload?: unknown;
          timezone?: unknown;
          recurrenceRule?: unknown;
          runAt?: unknown;
        };
      };

      if (
        typeof raw.mutation?.mutationId !== 'string' ||
        raw.input?.actionType !== 'REMINDER' ||
        raw.input?.timezone !== 'Africa/Johannesburg' ||
        typeof raw.input?.title !== 'string' ||
        typeof raw.input?.runAt !== 'string'
      ) {
        await route.fulfill(
          json(
            {
              error: {
                code: 'INVALID_REQUEST',
                message: 'Reminder fixture received invalid durable intent',
              },
            },
            400,
          ),
        );
        return;
      }

      capturedAction = {
        id: IDS.actionCaptured,
        jobId:
          typeof raw.input.jobId === 'string'
            ? raw.input.jobId
            : null,
        taskId: null,
        title: raw.input.title,
        actionType: 'REMINDER',
        payload: {
          kind: 'REMINDER',
          message: raw.input.title,
        },
        timezone: 'Africa/Johannesburg',
        recurrenceRule:
          typeof raw.input.recurrenceRule === 'string'
            ? raw.input.recurrenceRule
            : null,
        status: 'ACTIVE',
        runAt: raw.input.runAt,
        nextRunAt: raw.input.runAt,
        lastRunAt: null,
        createdAt: '2026-09-26T04:50:00.000Z',
        updatedAt: '2026-09-26T04:50:00.000Z',
        revision: 1,
      };

      await route.fulfill(json(capturedAction, 201));
      return;
    }

    if (path === '/dashboard') {
      const work =
        options.malformedWork === true
          ? {
              parties: allParties,
              jobs: allJobs,
              tasks: [{ ...allTasks[1]!, jobId: IDS.jobWebsite }],
            }
          : {
              parties: allParties,
              jobs: allJobs,
              tasks: allTasks,
            };
      await route.fulfill(
        json({
          today: {
            asOf,
            tasks: [allTasks[0]],
            repairs: [allRepairs[0]],
            scheduledActions: schedule.due,
          },
          work,
          repairs: {
            parties: allParties,
            jobs: allJobs,
            repairs: allRepairs,
          },
          schedule: { asOf, ...schedule },
        }),
      );
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
