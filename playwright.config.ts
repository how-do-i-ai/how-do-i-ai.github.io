import { defineConfig } from '@playwright/test';

// Per QA-07 + PDR-006 Measurement Baseline:
// mandatory viewports for mobile touch-target audit.
const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 568 },
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'mobile-414', width: 414, height: 736 },
  { name: 'mobile-768', width: 768, height: 1024 },
] as const;

const CI = !!process.env.CI;
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4321';

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: VIEWPORTS.map((v) => ({
    name: v.name,
    use: {
      browserName: 'chromium',
      viewport: { width: v.width, height: v.height },
      hasTouch: true,
    },
  })),
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4321',
    url: BASE_URL,
    timeout: 180_000,
    reuseExistingServer: !CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
