import { defineConfig, devices } from '@playwright/test';

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;
process.env.PLAYWRIGHT_BASE_URL ??= baseURL;

export default defineConfig({
  testDir: '..',
  testMatch: ['e2e/**/*.spec.ts', 'accessibility/**/*.spec.ts'],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: 'artifacts/playwright-report', open: 'never' }]]
    : 'line',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_URL: 'https://qa-placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'qa-anon-placeholder-not-a-secret',
      ALLOWED_EMAIL_DOMAINS: 'example.invalid',
    },
  },
});
