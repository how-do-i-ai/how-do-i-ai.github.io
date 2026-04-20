import { defineConfig, configDefaults } from 'vitest/config';

/**
 * Vitest configuration.
 *
 * Vitest's default include pattern (`**\/*.spec.ts`) would pick up
 * Playwright specs under `tests/`, which use `@playwright/test` and
 * call `test()` outside of Vitest's runner context. Excluding the
 * Playwright dir keeps unit tests (`src/**\/*.test.ts`) and a11y tests
 * (`tests/a11y/*.spec.ts`) on separate runners.
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'tests/**'],
  },
});
