// Vitest runs unit tests colocated with source under `src/`. The
// Playwright visual-regression suite under `tests/visual/` uses
// `@playwright/test` — a different runner — and must be excluded here
// so `npm run test` stays fast and unit-focused.
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'tests/visual/**'],
  },
});
