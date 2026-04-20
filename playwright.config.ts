import { defineConfig, devices } from '@playwright/test';

/**
 * Visual regression test configuration (QA-09).
 *
 * Single chromium project — additional browsers are not required for
 * visual regression; browser-render drift is not the invariant being
 * guarded. See `tests/visual/README.md` for rationale.
 */
export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  snapshotPathTemplate: '{testDir}/__baselines__/{arg}{ext}',

  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },

  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'on-first-retry',
    deviceScaleFactor: 1,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // `astro preview` serves the `dist/` build output — so a `npm run build`
  // MUST have run first. `npm run test:visual` handles this via its script
  // definition in package.json; the CI workflow builds explicitly as a
  // separate step before invoking the tests.
  webServer: {
    command: 'npx astro preview --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
