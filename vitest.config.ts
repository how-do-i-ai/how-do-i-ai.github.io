import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest runs unit tests under src/.
    // Playwright e2e tests live under tests/ and are run by `npm run test:e2e`.
    exclude: [...configDefaults.exclude, 'tests/**', 'playwright-report/**'],
  },
});
