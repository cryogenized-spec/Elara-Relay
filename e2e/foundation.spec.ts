import { expect, test } from '@playwright/test';
import { installLiveHarness, signInOwner } from './live-harness';

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
  await page.keyboard.press('Escape');
  await expect(searchDialog).toBeHidden();
  await expect(searchButton).toBeFocused();

  const captureButton = page.getByRole('button', { name: 'Capture' });
  await captureButton.click();
  await expect(page.getByRole('dialog', { name: 'Capture' })).toBeVisible();
  await page.getByRole('button', { name: /Repair \/ Job/ }).click();
  await expect(
    page.getByRole('button', { name: 'Save unavailable in preview' }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Capture' })).toBeHidden();

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
