import { defineConfig, devices } from '@playwright/test';

/**
 * Unified Playwright configuration for QA-07 / QA-08 / QA-09.
 *
 * Three test suites share this config and one `astro preview` webServer:
 *   - `tests/visual/**`        — QA-09 visual regression baselines.
 *   - `tests/a11y/axe.spec.ts` — QA-08 axe-core WCAG 2.2 AA (drives its
 *                                own viewports / color-modes in-code).
 *   - `tests/a11y/touch-targets.spec.ts` — QA-07 touch-target audit
 *                                (uses the project's viewport directly).
 *
 * Visual + axe run in a single chromium project (Desktop Chrome device
 * metrics); touch-targets runs once per mobile viewport because its spec
 * reads the viewport from the project, not from in-spec iteration.
 *
 * Per `tests/visual/README.md`: snapshotPathTemplate keeps baselines at
 * `tests/visual/__baselines__/` regardless of the new `./tests` testDir.
 */

const MOBILE_VIEWPORTS = [
  { label: '320', width: 320, height: 568 },
  { label: '375', width: 375, height: 667 },
  { label: '414', width: 414, height: 736 },
  { label: '768', width: 768, height: 1024 },
] as const;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  snapshotPathTemplate: '{testDir}/visual/__baselines__/{arg}{ext}',

  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },

  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'retain-on-failure',
    deviceScaleFactor: 1,
  },

  projects: [
    {
      name: 'chromium',
      testMatch: /(visual\/.*|a11y\/axe)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    ...MOBILE_VIEWPORTS.map((v) => ({
      name: `touch-targets-${v.label}`,
      testMatch: /touch-targets\.spec\.ts$/,
      use: {
        browserName: 'chromium' as const,
        viewport: { width: v.width, height: v.height },
        hasTouch: true,
      },
    })),
  ],

  // `astro preview` serves the `dist/` build output — caller must run
  // `npm run build` first. The `test:*` package.json scripts handle this;
  // the CI workflow builds in a separate step before invoking tests.
  webServer: {
    command: 'npx astro preview --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
