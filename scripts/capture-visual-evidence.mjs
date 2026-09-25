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
    env: { ...process.env, TZ: 'Africa/Johannesburg' },
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
