/**
 * Visual regression baselines (QA-09) + DOM cross-section sidecars (QA-10.4).
 *
 * Captures full-page screenshots at 12 viewport widths × 2 color schemes
 * × 3 target pages (home, blog index, blog post) = 72 snapshots total.
 * Each screenshot carries a JSON sidecar at
 * `tests/visual/__baselines__/{name}-{width}-{mode}.styles.json` recording
 * the computed styles of a curated selector set (see
 * `./dom-cross-sections.ts`). QA-10.4 attaches to the existing matrix
 * rather than duplicating it — see audit-tooling-design.md § 2.4 for the
 * rationale.
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
 * review so any intended visual shift is explicitly approved — the JSON
 * sidecars follow the same review gate as the PNG baselines.
 */
import { test, expect } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WIDTHS } from '../config/widths';
import {
  captureComputedStyles,
  reconcileSidecar,
  sidecarFilename,
  type UpdateSnapshotsMode,
} from './dom-cross-sections';

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = resolve(here, '__baselines__');

type Mode = 'light' | 'dark';
const MODES: readonly Mode[] = ['light', 'dark'] as const;

/**
 * Target pages. The blog-post slug `the-30-second-ai-explainer` is the only
 * post currently in `src/content/blog/`. When additional posts are added,
 * this baseline suite intentionally remains pinned to this slug so the
 * regression gate isn't noisy on content changes — it's a layout/tokens
 * gate, not a content gate.
 */
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'blog-index', path: '/blog/' },
  { name: 'blog-post', path: '/blog/the-30-second-ai-explainer/' },
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

          // QA-10.4 sidecar capture — runs AFTER the PNG assertion so a
          // pixel regression surfaces before the computed-style drift
          // (PNG failure is usually more actionable during review).
          const sidecar = await captureComputedStyles(page);
          const sidecarPath = resolve(
            BASELINE_DIR,
            sidecarFilename(pageDef.name, width, mode),
          );
          const updateMode = test.info().config
            .updateSnapshots as UpdateSnapshotsMode;
          const outcome = reconcileSidecar(sidecarPath, sidecar, updateMode);

          if (outcome.kind === 'fail-missing') {
            throw new Error(
              `QA-10.4 sidecar missing: ${outcome.path}\n` +
                `Run \`npm run test:visual:update\` (inside the Playwright ` +
                `Docker container per tests/visual/README.md) to create it.`,
            );
          }
          if (outcome.kind === 'fail-diff') {
            throw new Error(
              `QA-10.4 DOM cross-section drift (${pageDef.name} ${width}w ${mode}):\n` +
                `${outcome.formatted}\n` +
                `If the shift is intentional, regenerate sidecars via ` +
                `\`npm run test:visual:update\` in the Playwright Docker ` +
                `container and commit the updated JSON alongside the PNG diff.`,
            );
          }
          // 'pass' and 'wrote' outcomes continue silently — matches QA-09
          // PNG behavior where a first-run auto-create and a no-op match
          // are both green.
        });
      }
    }
  });
}
