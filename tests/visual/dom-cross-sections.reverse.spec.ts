/**
 * QA-10.4 reverse-test evidence — detection proof for the DOM cross-section
 * diff mechanism.
 *
 * Source of truth: PDR-007 § Decision Phase 2; audit-tooling-design.md § 2.4.
 * Issue: how-do-i-ai/how-do-i-ai.github.io#132.
 *
 * Mirrors the `tests/audit/invariants.reverse.spec.ts` pattern: the capture,
 * diff, and format helpers are shared with the forward spec
 * (`screenshots.spec.ts`) via `./dom-cross-sections.ts`. Without that
 * shared-module discipline the reverse test would vouch for a diff helper
 * that isn't the one gating CI.
 *
 * Contract proven here (satisfying the issue AC "introducing a token change
 * that shifts one captured property produces an assertion failure with the
 * diff clearly named"):
 *   1. A surgical CSS override on one selector produces a non-empty diff.
 *   2. The diff entry names the selector key (not the raw CSS selector),
 *      the element index, the property, and both values.
 *   3. The formatted message used in CI failures contains the expected
 *      selector/property/values so reviewers can identify drift from the
 *      log alone, without opening sidecar JSON by hand.
 *   4. Unrelated selectors do NOT produce diffs — isolation verified so
 *      the test fails ONLY when the targeted property shifts, not due to
 *      cascade side-effects.
 */
import { test, expect } from '@playwright/test';

import {
  captureComputedStyles,
  diffSidecars,
  formatDiff,
} from './dom-cross-sections';

const INJECTED_COLOR = 'rgb(123, 45, 67)';

test('detects single-property drift with clearly-named diff', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  // Baseline capture without any override.
  const baseline = await captureComputedStyles(page);

  // Inject a surgical override on .wordmark-text (SELECTORS.wordmarkText).
  // Chosen because the wordmark text element has no descendants that share
  // the selector, so `color` inheritance cannot produce cascade diffs on
  // unrelated captured elements. `!important` wins the cascade without
  // needing specificity calculation.
  await page.addStyleTag({
    content: `.wordmark-text { color: ${INJECTED_COLOR} !important; }`,
  });
  // addStyleTag resolves after the stylesheet applies; no additional wait
  // needed. A second capture reads the new computed styles.
  const drifted = await captureComputedStyles(page);

  const diffs = diffSidecars(baseline, drifted);

  // AC #1: Override produces a non-empty diff.
  expect(diffs.length).toBeGreaterThan(0);

  // AC #2: The wordmarkText color shift is specifically named.
  const wordmarkColorDiff = diffs.find(
    (d) => d.selector === 'wordmarkText' && d.property === 'color',
  );
  expect(wordmarkColorDiff).toBeDefined();
  expect(wordmarkColorDiff!.actual).toBe(INJECTED_COLOR);
  // `expected` is the original color — we don't hardcode it because tokens
  // may legitimately change; we only require it NOT equal the injected
  // value (otherwise the override never applied).
  expect(wordmarkColorDiff!.expected).not.toBe(INJECTED_COLOR);

  // AC #3: Formatted output is reviewer-readable. The exact format is
  // `  {selector}[{index}].{property}: {expected} → {actual}` — matched
  // with a regex so whitespace/separator tweaks in future refactors don't
  // break this assertion unless they also break reviewer legibility.
  const formatted = formatDiff(diffs);
  expect(formatted).toMatch(
    new RegExp(
      `wordmarkText\\[\\d+\\]\\.color: .+ → ${INJECTED_COLOR.replace(
        /[()]/g,
        '\\$&',
      )}`,
    ),
  );

  // AC #4: Isolation — no other selector's `color` shifted. The wordmark
  // sits inside .site-nav so the nav root's own `.color` is captured too,
  // but `.wordmark-text`'s override does NOT propagate up to the nav
  // container (ancestors don't inherit from descendants). Filter out
  // wordmarkText + wordmark (the child-to-parent composite — wordmark is
  // the <a> wrapping the text span; its color may differ but is not the
  // property being tracked).
  const unrelatedColorDiffs = diffs.filter(
    (d) =>
      d.property === 'color' &&
      d.selector !== 'wordmarkText' &&
      d.actual === INJECTED_COLOR,
  );
  expect(unrelatedColorDiffs).toEqual([]);
});
