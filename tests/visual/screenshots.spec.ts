/**
 * Visual regression baselines (QA-09).
 *
 * Captures full-page screenshots at 12 viewport widths × 2 color schemes
 * × 3 target pages (home, blog index, blog post) = 72 snapshots total.
 *
 * Widths span the PDR-006 mobile-through-desktop coverage, including the
 * 480-767 collapse band (the range where Pattern A's single-row nav is
 * emergent rather than enforced). The 2026-04-19 PDR-006 constraint 6
 * amendment made this band required coverage after the PR #99 B1
 * regression revealed untested assumptions about 480px single-row
 * behavior.
 *
 * Baselines live at `tests/visual/__baselines__/` (see
 * `playwright.config.ts` snapshotPathTemplate). Updates go through PR
 * review so any intended visual shift is explicitly approved.
 */
import { test, expect } from '@playwright/test';

/** Viewport widths (CSS px). See PRD § QA-09 / PDR-006 constraint 6. */
const WIDTHS = [
  320, 375, 414, 480, 500, 600, 640, 700, 767, 768, 1024, 1440,
] as const;

type Mode = 'light' | 'dark';
const MODES: readonly Mode[] = ['light', 'dark'] as const;

/**
 * Target pages. The blog-post slug `sample-post` is the only post
 * currently in `src/content/blog/`. When additional posts are added,
 * this baseline suite intentionally remains pinned to `sample-post` so
 * the regression gate isn't noisy on content changes — it's a
 * layout/tokens gate, not a content gate.
 */
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'blog-index', path: '/blog/' },
  { name: 'blog-post', path: '/blog/sample-post/' },
] as const;

/**
 * Viewport heights. 320×568 uses the iPhone SE 1st gen aspect (per
 * PRD § QA-09 note). Other widths use 900px — enough to cover the
 * above-the-fold hero and some scroll content without pushing CI
 * screenshot size unnecessarily.
 */
function heightFor(width: number): number {
  return width === 320 ? 568 : 900;
}

for (const pageDef of PAGES) {
  test.describe(pageDef.name, () => {
    for (const width of WIDTHS) {
      for (const mode of MODES) {
        test(`${pageDef.name} ${width}w ${mode}`, async ({ page }) => {
          await page.setViewportSize({
            width,
            height: heightFor(width),
          });
          await page.emulateMedia({
            colorScheme: mode,
            reducedMotion: 'reduce',
          });

          await page.goto(pageDef.path, { waitUntil: 'networkidle' });

          // Web fonts must be loaded before the screenshot — otherwise
          // first capture shows fallback metrics and subsequent runs
          // show Inter/JetBrains Mono, producing a false diff.
          await page.evaluate(() => document.fonts.ready);

          await expect(page).toHaveScreenshot(
            `${pageDef.name}-${width}-${mode}.png`,
            {
              fullPage: true,
            },
          );
        });
      }
    }
  });
}
