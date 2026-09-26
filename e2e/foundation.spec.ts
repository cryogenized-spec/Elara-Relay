import { expect, test } from '@playwright/test';

test('mobile operations shell renders and navigates without browser errors', async ({
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

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByText('Needs attention')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ready for collection' }),
  ).toBeVisible();
  await expect(page.getByText('Preview')).toBeVisible();

  const repairAttentionRow = page.getByRole('button', {
    name: /Open Avenge X regulator/,
  });
  await repairAttentionRow.click();
  const repairDetail = page.getByRole('dialog', { name: 'Avenge X regulator' });
  await expect(repairDetail).toBeVisible();
  await expect(
    repairDetail.getByRole('heading', { name: 'Avenge X regulator' }),
  ).toBeFocused();
  await expect(
    repairDetail.getByText('Awaiting parts', { exact: true }),
  ).toBeVisible();
  await expect(
    repairDetail
      .locator('.detailFields')
      .getByText('Regulator transfer seal leaking under pressure', {
        exact: true,
      }),
  ).toBeVisible();
  await expect(
    repairDetail.getByRole('heading', { name: 'Linked tasks' }),
  ).toBeVisible();
  await expect(
    repairDetail.getByRole('heading', { name: 'Timeline' }),
  ).toBeVisible();
  await repairDetail.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(repairDetail).toBeHidden();
  await expect(repairAttentionRow).toBeFocused();

  await page.getByRole('button', { name: 'Work' }).click();
  await expect(page.getByRole('heading', { name: 'Work' })).toBeVisible();
  await expect(page.getByText('Jobs & tasks')).toBeVisible();
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
    jobDetail.getByRole('heading', { name: 'Avenge X regulator repair' }),
  ).toBeFocused();
  await expect(
    jobDetail.getByRole('heading', { name: 'Linked Repair' }),
  ).toBeVisible();
  await expect(jobDetail.getByText('Avenge X regulator', { exact: true })).toBeVisible();
  await expect(jobDetail.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  await expect(jobDetail.getByRole('heading', { name: 'Timeline' })).toBeVisible();
  await jobDetail.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(jobDetail).toBeHidden();
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
    taskDetail.getByRole('heading', { name: 'Pressure-test regulator block' }),
  ).toBeFocused();
  await expect(
    taskDetail.getByText('Doing', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    taskDetail.getByRole('heading', { name: 'Linked Job' }),
  ).toBeVisible();
  await expect(
    taskDetail.getByText('Avenge X regulator repair', { exact: true }),
  ).toBeVisible();
  await expect(
    taskDetail.getByRole('heading', { name: 'Timeline' }),
  ).toBeVisible();
  await taskDetail.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(taskDetail).toBeHidden();
  await expect(taskRow).toBeFocused();

  await page.getByRole('button', { name: 'Repairs' }).click();
  await expect(page.getByRole('heading', { name: 'Repairs' })).toBeVisible();
  await expect(page.getByText('Workshop')).toBeVisible();

  await page.getByRole('button', { name: 'Schedule' }).click();
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
  await expect(page.getByText('Africa/Johannesburg')).toBeVisible();

  const searchButton = page.getByRole('button', { name: 'Search' });
  await searchButton.click();
  const searchDialog = page.getByRole('dialog', { name: 'Search' });
  await expect(searchDialog).toBeVisible();
  const searchInput = page.getByPlaceholder('Job, serial, task, customer…');
  await expect(searchInput).toBeFocused();
  await searchInput.fill('Avenge');
  await expect(
    searchDialog.getByRole('heading', { name: 'Repairs' }),
  ).toBeVisible();
  await expect(searchDialog.getByText('Avenge X regulator')).toBeVisible();
  await expect(searchDialog.getByText('Preview results')).toBeVisible();
  await searchInput.fill('no-such-preview-item');
  await expect(searchDialog.getByText('No preview results')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(searchDialog).toBeHidden();
  await expect(searchButton).toBeFocused();

  const captureButton = page.getByRole('button', { name: 'Capture' });
  await captureButton.click();
  await expect(page.getByRole('dialog', { name: 'Capture' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Capture' })).toBeFocused();

  await page.getByRole('button', { name: /Repair \/ Job/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'New repair / Job' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'New repair / Job' }),
  ).toBeFocused();
  await expect(page.getByLabel('Customer')).toBeVisible();
  await expect(page.getByLabel('Item / model')).toBeVisible();
  await expect(page.getByLabel('Reported fault')).toBeVisible();
  await expect(page.getByLabel('Serial')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save unavailable in preview' }),
  ).toBeDisabled();

  const repairDialog = page.getByRole('dialog', { name: 'New repair / Job' });
  await repairDialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Capture' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Capture' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Capture' })).toBeHidden();
  await expect(captureButton).toBeFocused();

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);

  const navTargets = await page.locator('.bottomNav button').evaluateAll(
    (buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
  );
  expect(
    navTargets.every(
      (target) => target.width >= 48 && target.height >= 48,
    ),
  ).toBe(true);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(serverErrors).toEqual([]);
});
