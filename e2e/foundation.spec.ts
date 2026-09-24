import { expect, test } from '@playwright/test';

test('foundation shell renders without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Elara Relay' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Foundation online');
  await expect(page.getByText('TS6 + TS7')).toBeVisible();

  expect(errors).toEqual([]);
});
