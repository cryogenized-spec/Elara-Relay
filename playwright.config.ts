import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-9x16',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 405, height: 720 },
      },
    },
    {
      name: 'android-portrait',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 412, height: 915 },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: baseURL,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_playwright',
      VITE_ELARA_API_URL: `${baseURL}/api-test`,
    },
  },
});
