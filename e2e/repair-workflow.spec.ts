import { expect, test, type Locator, type Page } from '@playwright/test';
import { createApi } from '../src/api/app';
import { MemoryDomainStore } from '../src/db/memory/memory-store';
import { DomainKernel } from '../src/domain/kernel';
import { installLiveHarness, signInOwner } from './live-harness';

const now = '2026-09-27T10:00:00.000Z';

// Browser requests exercise the real authenticated routes and kernel, not a
// second implementation of the Repair state machine in the browser harness.
async function setup(page: Page) {
  await installLiveHarness(page);
  let nextId = 1;
  const kernel = new DomainKernel(new MemoryDomainStore(), {
    clock: () => now,
    idGenerator: () =>
      `${String(nextId++).padStart(8, '0')}-0000-4000-8000-000000000001`,
  });
  const created = await kernel.createRepairCase(
    { mutationId: 'MUT-browser-repair-case-001', actor: 'operator-ui' },
    {
      party: { mode: 'NEW_CUSTOMER', name: 'Workshop customer' },
      jobTitle: 'Regulator repair',
      reportedFault: 'Pressure drops under load',
      serialState: 'UNKNOWN',
      serialValue: null,
      storageLocation: 'Shelf A',
    },
  );
  const api = createApi(kernel, {
    verify: () =>
      Promise.resolve({
        userId: '30000000-0000-4000-8000-000000000001',
        sessionId: '30000000-0000-4000-8000-000000000002',
        email: 'owner@example.com',
        aal: 'aal1',
      }),
  });
  const faults = {
    failWrites: 0,
    failReads: 0,
    failDashboard: 0,
    loseResponse: false,
  };
  const writes: unknown[] = [];
  await page.route('**/api-test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api-test', '');
    const writing = request.method() !== 'GET';
    if (writing) writes.push(request.postDataJSON() as unknown);
    if (
      (writing && faults.failWrites-- > 0) ||
      (!writing && path.startsWith('/repairs/') && faults.failReads-- > 0) ||
      (!writing && path === '/dashboard' && faults.failDashboard-- > 0)
    ) {
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'UNAVAILABLE',
            message: 'Connection interrupted. Please retry.',
          },
        },
      });
      return;
    }
    const response = await api.request(`${path}${url.search}`, {
      method: request.method(),
      headers: request.headers(),
      ...(writing ? { body: request.postData() ?? '' } : {}),
    });
    if (writing && faults.loseResponse) {
      faults.loseResponse = false;
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  await page.goto('/');
  await signInOwner(page);
  await page.getByRole('button', { name: 'Repairs', exact: true }).click();
  await page.getByRole('button', { name: /Open Regulator repair/ }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Regulator repair',
    exact: true,
  });
  await expect(
    dialog.getByRole('button', { name: 'Change stage', exact: true }),
  ).toBeVisible();
  return { kernel, repairId: created.repair.id, dialog, faults, writes };
}

async function stage(dialog: Locator, value: string) {
  await dialog
    .getByRole('button', { name: 'Change stage', exact: true })
    .click();
  await dialog.getByLabel('Next stage').selectOption(value);
  await dialog.getByRole('button', { name: 'Save stage', exact: true }).click();
}

async function expectStage(dialog: Locator, value: string) {
  await expect(
    dialog.locator('.detailFields').getByText(value, { exact: true }),
  ).toBeVisible();
}

test('operator progresses, waits, records findings, fails/retests and collects through the domain', async ({
  page,
}) => {
  const { kernel, repairId, dialog } = await setup(page);
  await expectStage(dialog, 'Received');
  await stage(dialog, 'DIAGNOSING');
  await expectStage(dialog, 'Diagnosing');
  await dialog.getByRole('button', { name: 'Edit findings' }).click();
  await dialog
    .getByLabel('Diagnosis', { exact: true })
    .fill('Transfer seal leaking');
  await dialog
    .getByLabel('Current finding', { exact: true })
    .fill('Replace transfer seal');
  await dialog.getByRole('button', { name: 'Save findings' }).click();
  await expect(
    dialog.locator('.detailFields').getByText('Transfer seal leaking'),
  ).toBeVisible();

  for (const waiting of ['AWAITING_PARTS', 'AWAITING_CUSTOMER']) {
    await dialog
      .getByRole('button', { name: 'Change stage', exact: true })
      .click();
    await dialog.getByLabel('Next stage').selectOption(waiting);
    await dialog
      .getByLabel('Waiting on', { exact: true })
      .fill(
        waiting === 'AWAITING_PARTS'
          ? 'Supplier seal kit'
          : 'Customer approval',
      );
    await dialog
      .getByLabel('Follow-up (Africa/Johannesburg)')
      .fill('2026-09-28T09:30');
    await dialog.getByRole('button', { name: 'Save stage' }).click();
    await expect(dialog.getByRole('form')).toHaveCount(0);
    const saved = (await kernel.getRepair(repairId)).repair;
    expect(saved.stage).toBe(waiting);
    expect(saved.followUpAt).toBe('2026-09-28T07:30:00.000Z');
    await stage(dialog, 'REPAIRING');
    await expectStage(dialog, 'Repairing');
    expect((await kernel.getRepair(repairId)).repair.waitingOn).toBeNull();
    expect((await kernel.getRepair(repairId)).repair.followUpAt).toBeNull();
  }

  await stage(dialog, 'TESTING');
  await expectStage(dialog, 'Testing');
  await stage(dialog, 'READY');
  await expect(dialog.getByRole('alert')).toContainText(
    'require a passing final test',
  );
  await expect(dialog.getByLabel('Next stage')).toHaveValue('READY');
  await dialog.getByRole('button', { name: 'Discard edits' }).click();
  await dialog
    .getByRole('button', { name: 'Record final test', exact: true })
    .click();
  await dialog.getByLabel('Final-test result').selectOption('FAIL');
  await dialog
    .getByLabel('Test detail')
    .fill('Still losing pressure after ten minutes');
  await dialog.getByRole('button', { name: 'Save final test' }).click();
  await expect(dialog.locator('.repairWorkflow__testState')).toContainText(
    'Fail',
  );
  await stage(dialog, 'READY');
  await expect(dialog.getByRole('alert')).toContainText(
    'require a passing final test',
  );
  await dialog.getByRole('button', { name: 'Discard edits' }).click();
  await stage(dialog, 'REPAIRING');
  await stage(dialog, 'TESTING');
  await expect(dialog.locator('.repairWorkflow__testState')).toContainText(
    'Not recorded',
  );
  await dialog
    .getByRole('button', { name: 'Record final test', exact: true })
    .click();
  await dialog.getByLabel('Final-test result').selectOption('PASS');
  await dialog
    .getByLabel('Test detail')
    .fill('Pressure stable after seal replacement');
  await dialog.getByRole('button', { name: 'Save final test' }).click();
  await expect(dialog.locator('.repairWorkflow__testState')).toContainText(
    'Pass',
  );
  await stage(dialog, 'READY');
  await expectStage(dialog, 'Ready');
  page.once('dialog', (confirmation) => {
    void confirmation.accept();
  });
  await stage(dialog, 'COLLECTED');
  await expectStage(dialog, 'Collected');
  await expect(
    dialog.getByRole('button', { name: 'Change stage', exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'Record final test', exact: true }),
  ).toHaveCount(0);
  const durable = (await kernel.getRepair(repairId)).repair;
  expect(durable.finalTestResult).toBe('PASS');
  expect(durable.collectedAt).toBe(now);
  const job = await kernel.getJob(durable.jobId);
  expect(
    job.events.filter((event) => event.eventType === 'REPAIR_TEST_RECORDED'),
  ).toHaveLength(2);
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    page.getByText('No active Repairs', { exact: true }),
  ).toBeVisible();
});

test('conflict refresh retains findings, blocks resubmit on failed refresh, and requires review', async ({
  page,
}) => {
  const { kernel, repairId, dialog, faults } = await setup(page);
  await dialog.getByRole('button', { name: 'Edit findings' }).click();
  await dialog
    .getByLabel('Diagnosis', { exact: true })
    .fill('My retained diagnosis');
  await kernel.updateRepairDetails(
    {
      mutationId: 'MUT-other-operator-001',
      actor: 'operator-ui',
      expectedRevision: 1,
    },
    repairId,
    { currentFinding: 'Updated on another device' },
  );
  faults.failReads = 1;
  await dialog.getByRole('button', { name: 'Save findings' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'could not be refreshed',
  );
  await expect(dialog.getByLabel('Diagnosis', { exact: true })).toHaveValue(
    'My retained diagnosis',
  );
  await expect(
    dialog.getByRole('button', { name: 'Save findings' }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Refresh current state' }).click();
  await expect(
    dialog.locator('.detailFields').getByText('Updated on another device'),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Save findings' }),
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Save findings' }).click();
  await expect(dialog.getByRole('form')).toHaveCount(0);
  expect((await kernel.getRepair(repairId)).repair).toMatchObject({
    diagnosis: 'My retained diagnosis',
    currentFinding: 'Updated on another device',
    revision: 3,
  });
});

test('failed writes and lost success responses retain the same replay-safe intent', async ({
  page,
}) => {
  const { kernel, repairId, dialog, faults, writes } = await setup(page);
  await dialog.getByRole('button', { name: 'Edit findings' }).click();
  await dialog
    .getByLabel('Current finding', { exact: true })
    .fill('Retained through connection loss');
  faults.failWrites = 1;
  await dialog.getByRole('button', { name: 'Save findings' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Connection interrupted',
  );
  await expect(
    dialog.getByLabel('Current finding', { exact: true }),
  ).toHaveValue('Retained through connection loss');
  faults.loseResponse = true;
  await dialog.getByRole('button', { name: 'Save findings' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Failed to fetch');
  await dialog.getByRole('button', { name: 'Save findings' }).click();
  await expect(dialog.getByRole('form')).toHaveCount(0);
  expect(writes).toHaveLength(3);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[2]).toEqual(writes[0]);
  expect((await kernel.getRepair(repairId)).repair.revision).toBe(2);
});

test('a stage made invalid elsewhere is rejected by the server without dropping waiting entries', async ({
  page,
}) => {
  const { kernel, repairId, dialog } = await setup(page);
  await dialog
    .getByRole('button', { name: 'Change stage', exact: true })
    .click();
  await dialog.getByLabel('Next stage').selectOption('AWAITING_CUSTOMER');
  await dialog
    .getByLabel('Waiting on', { exact: true })
    .fill('Customer quote approval');
  await dialog
    .getByLabel('Follow-up (Africa/Johannesburg)')
    .fill('2026-09-28T09:30');
  await kernel.moveRepairStage(
    {
      mutationId: 'MUT-other-cancel-001',
      actor: 'operator-ui',
      expectedRevision: 1,
    },
    repairId,
    { stage: 'CANCELLED' },
  );
  await dialog.getByRole('button', { name: 'Save stage' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Invalid repair stage transition',
  );
  await expect(dialog.getByLabel('Waiting on', { exact: true })).toHaveValue(
    'Customer quote approval',
  );
  await expectStage(dialog, 'Cancelled');
});

test('Repair workflow is usable and visually stable at required viewports', async ({
  page,
  browser,
}) => {
  // Official Chrome for Testing pin from Playwright 1.63 / revision 1243.
  expect(browser.version()).toBe('153.0.8010.12');
  const { dialog } = await setup(page);
  await dialog.evaluate((element) => { element.scrollTop = 0; });
  await expect(page).toHaveScreenshot('repair-workflow.png');
  await dialog
    .getByRole('button', { name: 'Change stage', exact: true })
    .click();
  await dialog.getByLabel('Next stage').selectOption('AWAITING_CUSTOMER');
  await dialog
    .getByLabel('Waiting on', { exact: true })
    .fill('Customer approval for replacement seal');
  await dialog
    .getByLabel('Follow-up (Africa/Johannesburg)')
    .fill('2026-09-28T09:30');
  await dialog
    .getByRole('button', { name: 'Save stage' })
    .scrollIntoViewIfNeeded();
  await dialog.evaluate((element) => { element.scrollTop = 0; });
  await expect(page).toHaveScreenshot('repair-waiting-form.png');
  for (const control of await dialog.locator('button, input, select').all()) {
    const bounds = await control.boundingBox();
    if (bounds !== null) {
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
    }
  }
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await dialog.getByRole('button', { name: 'Discard edits' }).click();
  await stage(dialog, 'DIAGNOSING');
  await stage(dialog, 'TESTING');
  await dialog
    .getByRole('button', { name: 'Record final test', exact: true })
    .click();
  await dialog.getByLabel('Final-test result').selectOption('FAIL');
  await dialog
    .getByLabel('Test detail')
    .fill('Pressure drops during the ten-minute soak test.');
  await dialog
    .getByRole('button', { name: 'Save final test' })
    .scrollIntoViewIfNeeded();
  await dialog.evaluate((element) => { element.scrollTop = 0; });
  await expect(page).toHaveScreenshot('repair-final-test-form.png');
  await dialog.getByRole('button', { name: 'Save final test' }).click();
  await stage(dialog, 'READY');
  await expect(dialog.getByRole('alert')).toContainText(
    'require a passing final test',
  );
  await expect(
    dialog.getByRole('button', { name: 'Save stage' }),
  ).toBeEnabled();
  // Frame the same scroll position after native focus/validation scrolling.
  await dialog.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(page).toHaveScreenshot('repair-ready-blocked.png');
});

test('final test conflict preserves observed result and Ready rework invalidates a passing test', async ({
  page,
}) => {
  const { kernel, repairId, dialog } = await setup(page);
  await stage(dialog, 'DIAGNOSING');
  await stage(dialog, 'TESTING');
  await dialog
    .getByRole('button', { name: 'Record final test', exact: true })
    .click();
  await dialog.getByLabel('Final-test result').selectOption('PASS');
  await dialog.getByLabel('Test detail').fill('Observed pressure stable');
  await kernel.updateRepairDetails(
    {
      mutationId: 'MUT-other-test-findings',
      actor: 'operator-ui',
      expectedRevision: 3,
    },
    repairId,
    { diagnosis: 'Seal replaced' },
  );
  await dialog.getByRole('button', { name: 'Save final test' }).click();
  await expect(dialog.getByRole('status')).toContainText('changed elsewhere');
  await expect(dialog.getByLabel('Final-test result')).toHaveValue('PASS');
  await expect(dialog.getByLabel('Test detail')).toHaveValue(
    'Observed pressure stable',
  );
  await expect(
    dialog.getByRole('button', { name: 'Save final test' }),
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Save final test' }).click();
  await expect(dialog.locator('.repairWorkflow__testState')).toContainText(
    'Pass',
  );
  await stage(dialog, 'READY');
  await stage(dialog, 'REPAIRING');
  await expect(dialog.locator('.repairWorkflow__testState')).toContainText(
    'Not recorded',
  );
  expect((await kernel.getRepair(repairId)).repair.finalTestDetail).toBeNull();
});

test('successful writes survive dashboard refresh failure without being resubmitted', async ({
  page,
}) => {
  const { dialog, faults, writes, kernel, repairId } = await setup(page);
  faults.failDashboard = 1;
  await stage(dialog, 'DIAGNOSING');
  await expect(dialog.getByRole('alert')).toContainText(
    'could not be refreshed',
  );
  await expect(dialog.getByRole('status')).toContainText('Repair saved');
  await expectStage(dialog, 'Diagnosing');
  await expect(
    dialog.getByRole('button', { name: 'Change stage', exact: true }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Refresh current state' }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'Change stage', exact: true }),
  ).toBeEnabled();
  expect(writes).toHaveLength(1);
  expect((await kernel.getRepair(repairId)).repair.revision).toBe(2);
});

test('waiting metadata is required, cancellation is explicit, and terminal state is durable', async ({
  page,
}) => {
  const { dialog, kernel, repairId, writes } = await setup(page);
  await dialog
    .getByRole('button', { name: 'Change stage', exact: true })
    .click();
  await dialog.getByLabel('Next stage').selectOption('AWAITING_CUSTOMER');
  await dialog.getByRole('button', { name: 'Save stage' }).click();
  expect(writes).toHaveLength(0);
  await expect(dialog.getByLabel('Waiting on', { exact: true })).toBeFocused();
  await dialog.getByLabel('Waiting on', { exact: true }).fill('   ');
  await dialog
    .getByLabel('Follow-up (Africa/Johannesburg)')
    .fill('2026-09-28T09:30');
  await dialog.getByRole('button', { name: 'Save stage' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Waiting stage requires waitingOn',
  );
  await dialog.getByLabel('Next stage').selectOption('CANCELLED');
  page.once('dialog', (confirmation) => {
    void confirmation.dismiss();
  });
  await dialog.getByRole('button', { name: 'Save stage' }).click();
  expect((await kernel.getRepair(repairId)).repair.stage).toBe('RECEIVED');
  page.once('dialog', (confirmation) => {
    void confirmation.accept();
  });
  await dialog.getByRole('button', { name: 'Save stage' }).click();
  await expectStage(dialog, 'Cancelled');
  expect((await kernel.getRepair(repairId)).repair.cancelledAt).toBe(now);
});
