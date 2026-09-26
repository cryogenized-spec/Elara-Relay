import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const REVIEW_VIEWPORT = Object.freeze({ width: 412, height: 915 });
const PRODUCT_VIEWPORT = Object.freeze({ width: 405, height: 720 });

function argument(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline !== undefined) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name) {
  const value = argument(name)?.trim();
  if (value === undefined || value === '') {
    throw new Error(`Missing required --${name} argument`);
  }
  return value;
}

const targetDir = resolve(requiredArgument('target'));
const label = requiredArgument('label');
const outputRoot = resolve(requiredArgument('output'));
const sourceSha = requiredArgument('source-sha');
const baseSha = requiredArgument('base-sha');
const headSha = requiredArgument('head-sha');
const port = Number.parseInt(requiredArgument('port'), 10);

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Visual evidence port must be a valid non-privileged port');
}

const origin = `http://127.0.0.1:${port}`;
const outputDir = join(outputRoot, label);
const serverLog = [];


const LIVE_IDS = Object.freeze({
  user: '30000000-0000-4000-8000-000000000001',
  session: '30000000-0000-4000-8000-000000000002',
  party: '10000000-0000-4000-8000-000000000001',
  jobRepair: '10000000-0000-4000-8000-000000000002',
  jobWebsite: '10000000-0000-4000-8000-000000000003',
  jobReady: '10000000-0000-4000-8000-000000000004',
  taskPressure: '10000000-0000-4000-8000-000000000005',
  taskWebsite: '10000000-0000-4000-8000-000000000006',
  taskInbox: '10000000-0000-4000-8000-000000000007',
  taskSupplier: '10000000-0000-4000-8000-000000000008',
  repairWaiting: '10000000-0000-4000-8000-000000000009',
  repairReady: '10000000-0000-4000-8000-000000000010',
  actionDue: '10000000-0000-4000-8000-000000000011',
  actionNext: '10000000-0000-4000-8000-000000000012',
  actionPaused: '10000000-0000-4000-8000-000000000013',
  eventJob: '10000000-0000-4000-8000-000000000014',
});

function isoOffset(asOf, minutes) {
  return new Date(Date.parse(asOf) + minutes * 60_000).toISOString();
}

function liveJwt() {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'none', typ: 'JWT' });
  const payload = encode({
    sub: LIVE_IDS.user,
    session_id: LIVE_IDS.session,
    role: 'authenticated',
    aal: 'aal1',
    jti: 'visual-evidence',
  });
  return `${header}.${payload}.fixture`;
}

function liveSessionPayload() {
  return {
    access_token: liveJwt(),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'visual-refresh-token',
    user: {
      id: LIVE_IDS.user,
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

function liveParty() {
  return {
    id: LIVE_IDS.party,
    name: 'Demo workshop customer',
    kind: 'CUSTOMER',
    createdAt: '2026-09-24T08:00:00.000Z',
    updatedAt: '2026-09-24T08:00:00.000Z',
    revision: 1,
  };
}

function liveJobs() {
  return [
    {
      id: LIVE_IDS.jobRepair,
      key: 'JOB-7A31C4F2',
      title: 'Avenge X regulator repair',
      category: 'WAITING',
      partyId: LIVE_IDS.party,
      createdAt: '2026-09-24T08:20:00.000Z',
      updatedAt: '2026-09-25T03:18:00.000Z',
      revision: 6,
    },
    {
      id: LIVE_IDS.jobWebsite,
      key: 'JOB-42D117A0',
      title: 'Website product cleanup',
      category: 'ACTIVE',
      partyId: null,
      createdAt: '2026-09-24T09:00:00.000Z',
      updatedAt: '2026-09-25T03:10:00.000Z',
      revision: 2,
    },
    {
      id: LIVE_IDS.jobReady,
      key: 'JOB-18E92B11',
      title: 'Baredda S56 — final check complete',
      category: 'DONE',
      partyId: LIVE_IDS.party,
      createdAt: '2026-09-23T08:00:00.000Z',
      updatedAt: '2026-09-25T02:10:00.000Z',
      revision: 8,
    },
  ];
}

function liveTasks(asOf) {
  return [
    {
      id: LIVE_IDS.taskPressure,
      jobId: LIVE_IDS.jobRepair,
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
      id: LIVE_IDS.taskWebsite,
      jobId: LIVE_IDS.jobWebsite,
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
      id: LIVE_IDS.taskInbox,
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
      id: LIVE_IDS.taskSupplier,
      jobId: LIVE_IDS.jobRepair,
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

function liveRepairs(asOf) {
  return [
    {
      id: LIVE_IDS.repairWaiting,
      jobId: LIVE_IDS.jobRepair,
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
      id: LIVE_IDS.repairReady,
      jobId: LIVE_IDS.jobReady,
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

function liveSchedule(asOf) {
  const make = (id, title, status, nextRunAt, recurrenceRule = null) => ({
    id,
    jobId: LIVE_IDS.jobRepair,
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
        LIVE_IDS.actionDue,
        'Follow up seal supplier',
        'ACTIVE',
        isoOffset(asOf, -10),
      ),
    ],
    upcoming: [
      make(
        LIVE_IDS.actionNext,
        'Check supplier ETA',
        'ACTIVE',
        isoOffset(asOf, 60),
      ),
    ],
    paused: [
      make(
        LIVE_IDS.actionPaused,
        'Website backlog review',
        'PAUSED',
        isoOffset(asOf, 1440),
        'FREQ=WEEKLY;INTERVAL=1',
      ),
    ],
  };
}

function liveEvent() {
  return {
    id: LIVE_IDS.eventJob,
    mutationId: 'MUT-visual-job-note-01',
    entityType: 'JOB',
    entityId: LIVE_IDS.jobRepair,
    eventType: 'JOB_NOTE',
    actor: 'operator-ui',
    occurredAt: '2026-09-25T03:18:00.000Z',
    detail: 'Waiting on transfer seal kit',
    changes: {},
    revisionAfter: 6,
  };
}

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

async function installLiveVisualRoutes(page) {
  await page.route('**/auth/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/token') || url.pathname.endsWith('/token/')) {
      await route.fulfill(jsonResponse(liveSessionPayload()));
      return;
    }
    if (url.pathname.endsWith('/logout')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill(jsonResponse(liveSessionPayload().user));
  });

  await page.route('**/api-test/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api-test/, '');
    const asOf =
      url.searchParams.get('asOf') ?? '2026-09-25T04:00:00.000Z';
    const jobs = liveJobs();
    const tasks = liveTasks(asOf);
    const repairs = liveRepairs(asOf);
    const schedule = liveSchedule(asOf);

    if (path === '/auth/whoami') {
      await route.fulfill(
        jsonResponse({
          userId: LIVE_IDS.user,
          sessionId: LIVE_IDS.session,
          email: 'owner@example.com',
          aal: 'aal1',
        }),
      );
      return;
    }
    if (path === '/dashboard') {
      await route.fulfill(
        jsonResponse({
          today: {
            asOf,
            tasks: [],
            repairs: [repairs[0]],
            scheduledActions: schedule.due,
          },
          work: {
            parties: [liveParty()],
            jobs,
            tasks,
          },
          repairs: {
            parties: [liveParty()],
            jobs,
            repairs,
          },
          schedule: { asOf, ...schedule },
        }),
      );
      return;
    }
    if (path === '/search') {
      await route.fulfill(
        jsonResponse({
          parties: [],
          jobs: [jobs[0]],
          tasks: [],
          repairs: [repairs[0]],
          scheduledActions: [],
          events: [liveEvent()],
        }),
      );
      return;
    }
    if (path === `/jobs/${LIVE_IDS.jobRepair}`) {
      await route.fulfill(
        jsonResponse({
          job: jobs[0],
          party: liveParty(),
          tasks: tasks.filter((task) => task.jobId === LIVE_IDS.jobRepair),
          repair: repairs[0],
          repairWarnings: [],
          scheduledActions: [...schedule.due, ...schedule.upcoming],
          events: [liveEvent()],
        }),
      );
      return;
    }
    if (path === `/tasks/${LIVE_IDS.taskPressure}`) {
      await route.fulfill(
        jsonResponse({
          task: tasks.find((task) => task.id === LIVE_IDS.taskPressure),
          job: jobs[0],
        }),
      );
      return;
    }
    if (path === `/repairs/${LIVE_IDS.repairWaiting}`) {
      await route.fulfill(
        jsonResponse({ repair: repairs[0], warnings: [] }),
      );
      return;
    }

    await route.fulfill(
      jsonResponse(
        { error: { code: 'NOT_FOUND', message: 'Visual fixture missing' } },
        404,
      ),
    );
  });
}


const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function rememberServerLog(chunk) {
  const message = String(chunk);
  serverLog.push(message);
  if (serverLog.length > 80) serverLog.splice(0, serverLog.length - 80);
  process.stdout.write(`[${label}:vite] ${message}`);
}

async function waitForServer(child) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Vite exited before becoming ready.\n${serverLog.join('')}`,
      );
    }
    try {
      const response = await fetch(origin, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // Socket is not ready yet.
    }
    await delay(250);
  }
  throw new Error(
    `Timed out waiting for ${origin}.\n${serverLog.join('')}`,
  );
}

function signalServerTree(child, signal) {
  if (child.exitCode !== null) return;
  if (process.platform !== 'win32' && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall through when the process group is already gone.
    }
  }
  child.kill(signal);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  signalServerTree(child, 'SIGTERM');
  const stopped = await Promise.race([
    new Promise((resolveStopped) =>
      child.once('exit', () => resolveStopped(true)),
    ),
    delay(5_000).then(() => false),
  ]);
  if (!stopped && child.exitCode === null) {
    signalServerTree(child, 'SIGKILL');
  }
}

async function captureViewport(browser, viewport, fileName) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: 'reduce',
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await installLiveVisualRoutes(page);

  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });

  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.locator('main').waitFor({ state: 'visible' });

  const signInHeading = page.getByRole('heading', { name: 'Sign in' });
  if ((await signInHeading.count()) > 0 && (await signInHeading.isVisible())) {
    await page.getByLabel('Email').fill('owner@example.com');
    await page.getByLabel('Password').fill('visual-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('heading', { name: 'Today' }).waitFor({
      state: 'visible',
      timeout: 5_000,
    });
  }

  const firstPanel = page.locator('main section').first();
  await firstPanel.waitFor({ state: 'visible' });

  const metrics = await page.evaluate(() => {
    const root = globalThis.document.querySelector('#root');
    const main = globalThis.document.querySelector('main');
    const bottomNav = globalThis.document.querySelector('.bottomNav');
    const topBar = globalThis.document.querySelector('.topBar');
    const rootBox = root?.getBoundingClientRect();
    const mainBox = main?.getBoundingClientRect();
    const bottomNavBox = bottomNav?.getBoundingClientRect();
    const topBarBox = topBar?.getBoundingClientRect();
    return {
      viewport: {
        width: globalThis.innerWidth,
        height: globalThis.innerHeight,
      },
      document: {
        scrollWidth: globalThis.document.documentElement.scrollWidth,
        scrollHeight: globalThis.document.documentElement.scrollHeight,
      },
      root: rootBox
        ? {
            width: Number(rootBox.width.toFixed(2)),
            height: Number(rootBox.height.toFixed(2)),
          }
        : null,
      main: mainBox
        ? {
            width: Number(mainBox.width.toFixed(2)),
            height: Number(mainBox.height.toFixed(2)),
          }
        : null,
      topBar: topBarBox
        ? {
            width: Number(topBarBox.width.toFixed(2)),
            height: Number(topBarBox.height.toFixed(2)),
          }
        : null,
      bottomNav: bottomNavBox
        ? {
            width: Number(bottomNavBox.width.toFixed(2)),
            height: Number(bottomNavBox.height.toFixed(2)),
          }
        : null,
      iconSvgCount: globalThis.document.querySelectorAll('svg').length,
      background: globalThis.getComputedStyle(globalThis.document.body).backgroundColor,
      colorScheme: globalThis.getComputedStyle(globalThis.document.documentElement).colorScheme,
    };
  });

  await page.screenshot({
    path: join(outputDir, fileName),
    fullPage: false,
  });
  await firstPanel.screenshot({
    path: join(outputDir, fileName.replace('.png', '-panel.png')),
  });

  let repairDetailFile = null;
  const repairAttentionRow = page.getByRole('button', {
    name: /Open Avenge X regulator/,
  });
  if ((await repairAttentionRow.count()) > 0) {
    await repairAttentionRow.click();
    const repairDetail = page.getByRole('dialog', {
      name: 'Avenge X regulator',
    });
    try {
      await repairDetail.waitFor({ state: 'visible', timeout: 1_500 });
      repairDetailFile = fileName.replace('.png', '-repair-detail.png');
      await page.screenshot({
        path: join(outputDir, repairDetailFile),
        fullPage: false,
      });
      await repairDetail.getByRole('button', {
        name: 'Back',
        exact: true,
      }).click();
    } catch {
      // Older comparison baselines may not have a Repair detail surface yet.
    }
  }

  const surfaceFiles = {};
  const primaryNav = [
    ['Work', 'work'],
    ['Repairs', 'repairs'],
    ['Schedule', 'schedule'],
  ];
  for (const [navLabel, suffix] of primaryNav) {
    const navButton = page.getByRole('button', { name: navLabel, exact: true });
    if ((await navButton.count()) === 0) continue;
    await navButton.click();
    const surfaceFile = fileName.replace('.png', `-${suffix}.png`);
    await page.screenshot({
      path: join(outputDir, surfaceFile),
      fullPage: false,
    });
    surfaceFiles[suffix] = `${label}/${surfaceFile}`;
  }
  let taskDetailFile = null;
  let jobDetailFile = null;
  const workButton = page.getByRole('button', { name: 'Work', exact: true });
  if ((await workButton.count()) > 0) {
    await workButton.click();
    const jobRow = page.getByRole('button', {
      name: /Open Avenge X regulator repair/,
    });
    if ((await jobRow.count()) > 0) {
      await jobRow.click();
      const jobDetail = page.getByRole('dialog', {
        name: 'Avenge X regulator repair',
      });
      try {
        await jobDetail.waitFor({ state: 'visible', timeout: 1_500 });
        jobDetailFile = fileName.replace('.png', '-job-detail.png');
        await page.screenshot({
          path: join(outputDir, jobDetailFile),
          fullPage: false,
        });
        await jobDetail.getByRole('button', {
          name: 'Back',
          exact: true,
        }).click();
      } catch {
        // Older comparison baselines may not have a Job detail surface yet.
      }
    }
  }

  if ((await workButton.count()) > 0) {
    await workButton.click();
    const taskRow = page.getByRole('button', {
      name: /Open Pressure-test regulator block/,
    });
    if ((await taskRow.count()) > 0) {
      await taskRow.click();
      const taskDetail = page.getByRole('dialog', {
        name: 'Pressure-test regulator block',
      });
      try {
        await taskDetail.waitFor({ state: 'visible', timeout: 1_500 });
        taskDetailFile = fileName.replace('.png', '-task-detail.png');
        await page.screenshot({
          path: join(outputDir, taskDetailFile),
          fullPage: false,
        });
        await taskDetail.getByRole('button', {
          name: 'Back',
          exact: true,
        }).click();
      } catch {
        // Older comparison baselines may not have a Task detail surface yet.
      }
    }
  }

  const todayButton = page.getByRole('button', { name: 'Today', exact: true });
  if ((await todayButton.count()) > 0) {
    await todayButton.click();
  }

  let captureFiles = null;
  const captureButton = page.getByRole('button', { name: 'Capture' });
  if ((await captureButton.count()) > 0) {
    await captureButton.click();
    const captureDialog = page.getByRole('dialog', { name: 'Capture' });
    await captureDialog.waitFor({ state: 'visible' });

    const menuFile = fileName.replace('.png', '-capture.png');
    await page.screenshot({
      path: join(outputDir, menuFile),
      fullPage: false,
    });

    let repairFile = null;
    const repairChoice = page.getByRole('button', { name: /Repair \/ Job/ });
    if ((await repairChoice.count()) > 0) {
      await repairChoice.click();
      const repairHeading = page.getByRole('heading', {
        name: 'New repair / Job',
      });
      try {
        await repairHeading.waitFor({ state: 'visible', timeout: 1_500 });
        repairFile = fileName.replace('.png', '-capture-repair.png');
        await page.screenshot({
          path: join(outputDir, repairFile),
          fullPage: false,
        });
      } catch {
        // Older comparison baselines may expose Capture without a focused form.
      }
    }

    await page.keyboard.press('Escape');
    captureFiles = {
      menu: `${label}/${menuFile}`,
      repair: repairFile === null ? null : `${label}/${repairFile}`,
    };
  }

  let searchFile = null;
  const searchButton = page.getByRole('button', { name: 'Search' });
  if ((await searchButton.count()) > 0) {
    await searchButton.click();
    const searchDialog = page.getByRole('dialog', { name: 'Search' });
    await searchDialog.waitFor({ state: 'visible' });
    const searchInput = page.getByPlaceholder('Job, serial, task, customer…');
    if ((await searchInput.count()) > 0) {
      await searchInput.fill('Avenge');
    }
    searchFile = fileName.replace('.png', '-search.png');
    await page.screenshot({
      path: join(outputDir, searchFile),
      fullPage: false,
    });
    await page.keyboard.press('Escape');
  }

  await context.close();
  return {
    metrics,
    pageErrors,
    consoleErrors,
    failedRequests,
    repairDetailFile:
      repairDetailFile === null ? null : `${label}/${repairDetailFile}`,
    surfaceFiles,
    jobDetailFile:
      jobDetailFile === null ? null : `${label}/${jobDetailFile}`,
    taskDetailFile:
      taskDetailFile === null ? null : `${label}/${taskDetailFile}`,
    captureFiles,
    searchFile: searchFile === null ? null : `${label}/${searchFile}`,
  };
}

await mkdir(outputDir, { recursive: true });

const server = spawn(
  'npm',
  ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)],
  {
    cwd: targetDir,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      TZ: 'Africa/Johannesburg',
      VITE_SUPABASE_URL: origin,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_visual',
      VITE_ELARA_API_URL: `${origin}/api-test`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
server.stdout?.on('data', rememberServerLog);
server.stderr?.on('data', rememberServerLog);

let browser;
try {
  await waitForServer(server);
  browser = await chromium.launch();

  const review = await captureViewport(
    browser,
    REVIEW_VIEWPORT,
    'phone-412x915.png',
  );
  const product = await captureViewport(
    browser,
    PRODUCT_VIEWPORT,
    'phone-405x720.png',
  );

  const evidence = {
    schemaVersion: 1,
    label,
    scenario: 'mobile-operations-shell',
    sourceSha,
    baseSha,
    headSha,
    viewports: {
      reviewer: REVIEW_VIEWPORT,
      productAuthority: PRODUCT_VIEWPORT,
    },
    review,
    product,
    files: {
      reviewerPage: `${label}/phone-412x915.png`,
      reviewerPanel: `${label}/phone-412x915-panel.png`,
      productPage: `${label}/phone-405x720.png`,
      productPanel: `${label}/phone-405x720-panel.png`,
    },
  };

  await writeFile(
    join(outputDir, 'evidence.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8',
  );

  for (const capture of [review, product]) {
    if (
      capture.pageErrors.length > 0 ||
      capture.consoleErrors.length > 0 ||
      capture.failedRequests.length > 0
    ) {
      throw new Error(
        `Visual evidence runtime errors detected: ${JSON.stringify(capture)}`,
      );
    }
  }
} finally {
  await browser?.close();
  await stopServer(server);
}
