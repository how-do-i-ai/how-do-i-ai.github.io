import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for the accessibility gate.
 *
 * Serves the production build via `astro preview` and runs axe-core
 * scans against it. See tests/a11y/axe.spec.ts for scope (viewports,
 * pages, color modes) and QA-08 in docs/website/prd.md for requirements.
 *
 * webServer spins up its own preview process per run (rebuilds first so
 * local `npm run test:a11y` is self-contained). In CI the existing
 * `npm run build` step has already produced `dist/`, so the rebuild is a
 * near-no-op incremental pass.
 */
export default defineConfig({
  testDir: './tests/a11y',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
