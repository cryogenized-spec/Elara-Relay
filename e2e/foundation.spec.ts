import { expect, test } from '@playwright/test';
import { installLiveHarness, signInOwner } from './live-harness';

const IDS_FOR_TEST = {
  jobRepair: '10000000-0000-4000-8000-000000000002',
} as const;

test('authenticated mobile operations shell reads live domain state', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const serverErrors: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await installLiveHarness(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today' })).toHaveCount(0);

  await signInOwner(page);

  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByText('Needs attention')).toBeVisible();
  await expect(page.getByText('Follow up seal supplier')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ready for collection' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toContainText(
    'Online',
  );

  const repairAttentionRow = page.getByRole('button', {
    name: /Open Avenge X regulator repair/,
  });
  await repairAttentionRow.click();
  const repairDetail = page.getByRole('dialog', {
    name: 'Avenge X regulator repair',
  });
  await expect(repairDetail).toBeVisible();
  await expect(
    repairDetail.getByRole('heading', { name: 'Avenge X regulator repair' }),
  ).toBeFocused();
  await expect(
    repairDetail
      .locator('.detailFields')
      .getByText('Awaiting Parts', { exact: true }),
  ).toBeVisible();
  await expect(
    repairDetail.getByText('Regulator transfer seal leaking under pressure', {
      exact: true,
    }),
  ).toBeVisible();
  await repairDetail.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(repairDetail).toBeHidden();
  await expect(repairAttentionRow).toBeFocused();

  await page.getByRole('button', { name: 'Work' }).click();
  await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  await expect(page.getByText('Avenge X regulator repair')).toBeVisible();
  await expect(page.getByText('Inspect returned CO₂ pistol')).toBeVisible();

  const jobRow = page.getByRole('button', {
    name: /Open Avenge X regulator repair/,
  });
  await jobRow.click();
  const jobDetail = page.getByRole('dialog', {
    name: 'Avenge X regulator repair',
  });
  await expect(jobDetail).toBeVisible();
  await expect(
    jobDetail.getByRole('heading', { name: 'Linked Repair' }),
  ).toBeVisible();
  await expect(jobDetail.getByText('Pressure drops after refill')).toBeVisible();
  await expect(
    jobDetail.getByRole('heading', { name: 'Scheduled actions' }),
  ).toBeVisible();
  await expect(jobDetail.getByText('Check supplier ETA')).toBeVisible();
  await expect(jobDetail.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  await expect(jobDetail.getByRole('heading', { name: 'Timeline' })).toBeVisible();
  await jobDetail.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(jobRow).toBeFocused();

  const taskRow = page.getByRole('button', {
    name: /Open Pressure-test regulator block/,
  });
  await taskRow.click();
  const taskDetail = page.getByRole('dialog', {
    name: 'Pressure-test regulator block',
  });
  await expect(taskDetail).toBeVisible();
  await expect(
    taskDetail.getByText('Doing', { exact: true }).first(),
  ).toBeVisible();
  await expect(taskDetail.getByText('Avenge X regulator repair')).toBeVisible();
  await taskDetail.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(taskRow).toBeFocused();

  await page.getByRole('button', { name: 'Repairs' }).click();
  await expect(page.getByRole('heading', { name: 'Repairs' })).toBeVisible();
  await expect(page.getByText('Workshop')).toBeVisible();

  await page.getByRole('button', { name: 'Schedule' }).click();
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
  await expect(page.getByText('Follow up seal supplier')).toBeVisible();
  await expect(page.getByText('Website backlog review')).toBeVisible();

  const searchButton = page.getByRole('button', { name: 'Search' });
  await searchButton.click();
  const searchDialog = page.getByRole('dialog', { name: 'Search' });
  const searchInput = page.getByPlaceholder('Job, serial, task, customer…');
  await searchInput.fill('Avenge');
  await expect(
    searchDialog.getByRole('heading', { name: 'Repairs' }),
  ).toBeVisible();
  const repairSearchGroup = searchDialog
    .locator('.searchResultGroup')
    .filter({ hasText: 'Repairs' });
  await expect(
    repairSearchGroup.getByText('Avenge X regulator repair', { exact: true }),
  ).toBeVisible();
  await expect(searchDialog.getByText('Results')).toBeVisible();
  await expect(
    searchDialog.getByRole('heading', { name: 'History' }),
  ).toBeVisible();
  await expect(
    searchDialog.getByText('Waiting on transfer seal kit', { exact: true }),
  ).toBeVisible();
  await expect(
    searchDialog.getByRole('button', { name: /Waiting on transfer seal kit/ }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(searchDialog).toBeHidden();
  await expect(searchButton).toBeFocused();

  const captureButton = page.getByRole('button', { name: 'Capture' });
  await captureButton.click();
  const captureDialog = page.getByRole('dialog', { name: 'Capture' });
  await expect(captureDialog).toBeVisible();
  await captureDialog.getByRole('button', { name: /^Task/ }).click();
  const taskCaptureDialog = page.getByRole('dialog', { name: 'New task' });
  await taskCaptureDialog.getByLabel('Title').fill('Count incoming repair seals');
  await taskCaptureDialog.getByLabel('Priority').selectOption('HIGH');
  await taskCaptureDialog.getByRole('button', { name: 'Save Task' }).click();

  await expect(taskCaptureDialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
  await page.getByRole('button', { name: 'Work' }).click();
  await expect(
    page.getByText('Count incoming repair seals', { exact: true }),
  ).toBeVisible();

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(serverErrors).toEqual([]);
});

test('shell stays gated when the server rejects authorization', async ({
  page,
}) => {
  await installLiveHarness(page);
  await page.route('**/api-test/auth/whoami', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      }),
    });
  });

  await page.goto('/');
  await signInOwner(page);

  await expect(
    page.getByRole('heading', { name: 'Access not authorized' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today' })).toHaveCount(0);
});

test('later authorization denial clears the cached operational shell', async ({
  page,
}) => {
  await installLiveHarness(page);
  await page.goto('/');
  await signInOwner(page);

  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  await page.route('**/api-test/search*', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'text/html',
      body: '<html>forbidden</html>',
    });
  });

  await page.getByRole('button', { name: 'Search' }).click();
  await page
    .getByPlaceholder('Job, serial, task, customer…')
    .fill('Avenge');

  await expect(
    page.getByRole('heading', { name: 'Access not authorized' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Search' })).toHaveCount(0);
});

test('authorization denial from a stale Search UI request still clears current shell', async ({
  page,
}) => {
  await installLiveHarness(page);
  await page.goto('/');
  await signInOwner(page);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  let releaseSearch: (() => void) | undefined;
  let markSearchStarted: (() => void) | undefined;
  const searchStarted = new Promise<void>((resolve) => {
    markSearchStarted = resolve;
  });
  const searchReleased = new Promise<void>((resolve) => {
    releaseSearch = resolve;
  });

  await page.route('**/api-test/search*', async (route) => {
    markSearchStarted?.();
    await searchReleased;
    await route.fulfill({
      status: 403,
      contentType: 'text/plain',
      body: 'forbidden',
    });
  });

  await page.getByRole('button', { name: 'Search' }).click();
  const input = page.getByPlaceholder('Job, serial, task, customer…');
  await input.fill('Avenge');
  await searchStarted;
  await input.fill('');
  releaseSearch?.();

  await expect(
    page.getByRole('heading', { name: 'Access not authorized' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today' })).toHaveCount(0);
});

test('denial from an obsolete signed-out Search session cannot clear a new session', async ({
  page,
}) => {
  await installLiveHarness(page);
  await page.goto('/');
  await signInOwner(page);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  let releaseSearch: (() => void) | undefined;
  let markSearchStarted: (() => void) | undefined;
  const searchStarted = new Promise<void>((resolve) => {
    markSearchStarted = resolve;
  });
  const searchReleased = new Promise<void>((resolve) => {
    releaseSearch = resolve;
  });

  await page.route('**/api-test/search*', async (route) => {
    markSearchStarted?.();
    await searchReleased;
    await route.fulfill({
      status: 403,
      contentType: 'text/plain',
      body: 'old session forbidden',
    });
  });

  await page.getByRole('button', { name: 'Search' }).click();
  await page
    .getByPlaceholder('Job, serial, task, customer…')
    .fill('Avenge');
  await searchStarted;

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Search' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await signInOwner(page);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  releaseSearch?.();
  await page.waitForTimeout(100);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Access not authorized' }),
  ).toHaveCount(0);
});

test('stale bearer gets one refresh and server authorization retry', async ({
  page,
}) => {
  await installLiveHarness(page, { firstWhoAmIUnauthorized: true });
  await page.goto('/');
  await signInOwner(page);

  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toContainText(
    'Online',
  );
});

test('malformed successful aggregate fails closed instead of rendering plausible state', async ({
  page,
}) => {
  await installLiveHarness(page, { malformedWork: true });
  await page.goto('/');
  await signInOwner(page);

  await expect(
    page.getByRole('heading', { name: 'Workspace unavailable' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today' })).toHaveCount(0);
});


test('Task Capture retries one unchanged durable mutation intent', async ({
  page,
}) => {
  await installLiveHarness(page, { failFirstTaskCreate: true });
  await page.goto('/');
  await signInOwner(page);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  await page.getByRole('button', { name: 'Capture' }).click();
  const capture = page.getByRole('dialog', { name: 'Capture' });
  await capture.getByRole('button', { name: /^Task/ }).click();
  const taskCapture = page.getByRole('dialog', { name: 'New task' });

  await taskCapture.getByLabel('Title').fill('Retry-safe captured Task');
  await taskCapture.getByLabel('Priority').selectOption('URGENT');
  await taskCapture.getByRole('button', { name: 'Save Task' }).click();

  await expect(
    taskCapture.getByRole('alert'),
  ).toContainText('Temporary Task save failure');
  await expect(taskCapture.getByLabel('Title')).toHaveValue(
    'Retry-safe captured Task',
  );
  await expect(
    taskCapture.getByRole('button', { name: 'Retry save' }),
  ).toBeVisible();

  await taskCapture.getByRole('button', { name: 'Retry save' }).click();

  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: 'Work' }).click();
  await expect(
    page.getByText('Retry-safe captured Task', { exact: true }),
  ).toBeVisible();
});


test('Capture stays locked while a durable Task save is unresolved', async ({
  page,
}) => {
  await installLiveHarness(page);

  let releaseTaskCreate: (() => void) | undefined;
  let markTaskCreateStarted: (() => void) | undefined;
  const taskCreateStarted = new Promise<void>((resolve) => {
    markTaskCreateStarted = resolve;
  });
  const taskCreateReleased = new Promise<void>((resolve) => {
    releaseTaskCreate = resolve;
  });

  await page.route('**/api-test/tasks', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    markTaskCreateStarted?.();
    await taskCreateReleased;
    await route.fallback();
  });

  await page.goto('/');
  await signInOwner(page);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  await page.getByRole('button', { name: 'Capture' }).click();
  await page
    .getByRole('dialog', { name: 'Capture' })
    .getByRole('button', { name: /^Task/ })
    .click();

  const taskCapture = page.getByRole('dialog', { name: 'New task' });
  await taskCapture.getByLabel('Title').fill('Pending durable Task');
  await taskCapture.getByRole('button', { name: 'Save Task' }).click();
  await taskCreateStarted;

  await expect(taskCapture).toHaveAttribute('aria-busy', 'true');
  await expect(taskCapture.getByRole('button', { name: 'Back' })).toBeDisabled();
  await expect(taskCapture.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await expect(taskCapture.getByLabel('Title')).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(taskCapture).toBeVisible();

  releaseTaskCreate?.();
  await expect(taskCapture).toHaveCount(0);
});


test('Repair Capture opens one atomic durable workshop case', async ({
  page,
}) => {
  await installLiveHarness(page);
  let repairCaseBody: unknown = null;
  page.on('request', (request) => {
    if (
      request.url().includes('/api-test/repair-cases') &&
      request.method() === 'POST'
    ) {
      repairCaseBody = request.postDataJSON();
    }
  });

  await page.goto('/');
  await signInOwner(page);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  await page.getByRole('button', { name: 'Capture' }).click();
  const capture = page.getByRole('dialog', { name: 'Capture' });
  await capture.getByRole('button', { name: /^Repair \/ Job/ }).click();
  const repairCapture = page.getByRole('dialog', {
    name: 'New repair / Job',
  });

  await repairCapture.getByLabel('Customer').fill('Demo workshop customer');
  await repairCapture.getByLabel('Item / model').fill('Spyder Victor service');
  await repairCapture
    .getByLabel('Reported fault')
    .fill('CO₂ leak around valve body');
  await repairCapture.getByLabel('Serial').fill('SV-TEST-01');
  await repairCapture
    .getByLabel('Storage location')
    .fill('Workshop test shelf');
  await repairCapture.getByRole('button', { name: 'Open Repair' }).click();

  await expect(repairCapture).toHaveCount(0);
  expect(repairCaseBody).toMatchObject({
    mutation: { mutationId: expect.any(String) },
    input: {
      party: {
        mode: 'EXISTING',
        partyId: '10000000-0000-4000-8000-000000000001',
      },
      jobTitle: 'Spyder Victor service',
      reportedFault: 'CO₂ leak around valve body',
      serialState: 'KNOWN',
      serialValue: 'SV-TEST-01',
      storageLocation: 'Workshop test shelf',
    },
  });

  await page.getByRole('button', { name: 'Repairs' }).click();
  await expect(
    page.getByText('Spyder Victor service', { exact: true }),
  ).toBeVisible();
});


test('Task detail can edit, wait, and complete through versioned writes', async ({
  page,
}) => {
  await installLiveHarness(page);
  await page.goto('/');
  await signInOwner(page);
  await page.getByRole('button', { name: 'Work' }).click();

  await page
    .getByRole('button', { name: /Open Pressure-test regulator block/ })
    .click();
  const taskDetail = page.locator('dialog.detailSurface');
  await expect(taskDetail).toHaveAttribute(
    'aria-label',
    'Pressure-test regulator block',
  );

  await taskDetail.getByRole('button', { name: 'Edit Task' }).click();
  const edit = taskDetail.getByRole('form', { name: 'Edit Task' });
  await edit.getByLabel('Title').fill('Pressure-test regulator block today');
  await edit.getByLabel('Priority').selectOption('NORMAL');
  await edit.getByRole('button', { name: 'Save changes' }).click();

  await expect(taskDetail).toHaveAttribute(
    'aria-label',
    'Pressure-test regulator block today',
  );
  await expect(
    taskDetail.getByText('Normal', { exact: true }),
  ).toBeVisible();

  await taskDetail.getByRole('button', { name: 'Mark waiting' }).click();
  const waiting = taskDetail.getByRole('form', {
    name: 'Mark Task waiting',
  });
  await waiting.getByLabel('Waiting on').fill('Seal supplier');
  await waiting.getByLabel('Follow-up').fill('2026-09-26T15:00');
  await waiting.getByRole('button', { name: 'Save waiting state' }).click();

  await expect(
    taskDetail.getByText('Waiting', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    taskDetail.getByText('Seal supplier', { exact: true }),
  ).toBeVisible();

  await taskDetail.getByRole('button', { name: 'Complete' }).click();
  await expect(taskDetail).toHaveCount(0);
});


test('Reminder Capture persists recurrence and Job context', async ({ page }) => {
  await installLiveHarness(page);
  await page.goto('/');
  await signInOwner(page);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  await page.getByRole('button', { name: 'Capture' }).click();
  const capture = page.getByRole('dialog', { name: 'Capture' });
  await capture.getByRole('button', { name: /^Reminder/ }).click();

  await page.getByLabel('Title').fill('Check regulator supplier ETA');
  await page.getByLabel('Run at').fill('2026-09-26T14:30');
  await page.getByLabel('Repeat').selectOption('daily');
  await page.getByLabel('Linked Job').selectOption(IDS_FOR_TEST.jobRepair);
  await page.getByRole('button', { name: 'Save Reminder' }).click();

  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: 'Schedule' }).click();
  await expect(
    page.getByText('Check regulator supplier ETA', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/FREQ=DAILY;INTERVAL=1.*JOB-7A31C4F2/),
  ).toBeVisible();
});
