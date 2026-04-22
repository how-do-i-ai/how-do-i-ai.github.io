/**
 * QA-10.3 Invariant Specs MVP — 5 home-page layout invariants.
 *
 * Source of truth: PDR-007 § Decision Phase 1; audit-tooling-design.md § 2.3.
 * Issue: how-do-i-ai/how-do-i-ai.github.io#121.
 *
 * Invariants encode design intent as boolean geometric/CSSOM predicates that
 * either hold or do not. They are NOT pixel-exact measurements — per design
 * doc § 2.3, sub-pixel font-metric drift between macOS and Linux must be
 * absorbed by the predicate shape. The precipitating failure (PR #99 B1
 * overlap regression) motivates Invariant 4 specifically.
 *
 * Report contract: a per-run JSON summary is emitted to
 * `tests/audit/__reports__/invariants-report.json` (gitignored) containing
 * per-invariant, per-viewport measurements so CI artifacts can surface
 * WHY a gate fired, not just THAT it fired.
 */
import {
  test,
  expect,
  type Browser,
  type BrowserContext,
} from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectPostSummariesPredicate,
  correlatePostSummaries,
  invariant1Predicate,
  invariant6Predicate,
  invariant7Predicate,
  invariant8Predicate,
  invariant10Predicate,
  invariant11Predicate,
} from './helpers';
import { SELECTORS } from './selectors';

const here = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = resolve(here, '__reports__', 'invariants-report.json');

// Serial mode: tests accumulate results in the module-scoped `results`
// array and afterAll flushes to disk. Parallel workers would fragment the
// report; the project-level fullyParallel: false (in playwright.config.ts)
// is the belt-and-suspenders counterpart.
test.describe.configure({ mode: 'serial' });

type Mode = 'light' | 'dark';

type RunResult = {
  viewport: string;
  mode: Mode;
  pass: boolean;
  measurements: { pass: boolean; [key: string]: unknown };
};

type InvariantResult = {
  id: string;
  title: string;
  pass: boolean;
  runs: RunResult[];
};

const results: InvariantResult[] = [];

test.afterAll(() => {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  const payload = {
    schema: 'qa-10.3/invariants-report/v1',
    timestamp: new Date().toISOString(),
    invariants: results,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(payload, null, 2) + '\n');
});

async function openHome(
  browser: Browser,
  opts: { width: number; height?: number; mode?: Mode },
): Promise<{ context: BrowserContext; page: import('@playwright/test').Page }> {
  return openPath(browser, '/', opts);
}

/**
 * Generalized opener used by Invariant 9 (and any future cross-surface
 * invariant) which must visit more than just `/`. Same theme-pinning
 * semantics as `openHome` — identical contract, parameterized path.
 */
async function openPath(
  browser: Browser,
  path: string,
  opts: { width: number; height?: number; mode?: Mode },
): Promise<{ context: BrowserContext; page: import('@playwright/test').Page }> {
  const mode: Mode = opts.mode ?? 'light';
  const height = opts.height ?? 900;

  const context = await browser.newContext({
    viewport: { width: opts.width, height },
    colorScheme: mode,
    reducedMotion: 'reduce',
  });

  // Pin theme deterministically: BaseHead.astro's inline script reads
  // localStorage.theme pre-paint. Belt-and-suspenders with colorScheme.
  await context.addInitScript((m) => {
    window.localStorage.setItem('theme', m);
  }, mode);

  const page = await context.newPage();
  await page.goto(path, { waitUntil: 'networkidle' });

  // Sanity check the theme actually applied before we measure.
  if (mode === 'dark') {
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  } else {
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  }

  return { context, page };
}

function assertAllRunsPassed(summary: string, runs: RunResult[]): void {
  const fails = runs.filter((r) => !r.pass);
  if (fails.length === 0) return;
  const lines = fails.map(
    (f) =>
      `  - ${f.viewport}px (${f.mode}): ${JSON.stringify(
        f.measurements,
        null,
        2,
      )
        .split('\n')
        .join('\n    ')}`,
  );
  throw new Error(`${summary}\n${lines.join('\n')}`);
}

/* ---------------------------------------------------------------------------
 * Invariant 1 — Wordmark is the strongest type in .site-nav.
 *
 * REQ-NAV-02 GWT: "wordmark remains the strongest type in the nav."
 * Nav.astro:207 anchor comment: "Medium 500 base; wordmark stays strongest
 * at 700." Brand-hierarchy guard.
 *
 * Predicate: for every text-bearing descendant of .site-nav outside
 * .wordmark-text's subtree, computed font-weight ≤ computed font-weight of
 * .wordmark-text. Font-weight is color-scheme-independent; light is enough.
 * ------------------------------------------------------------------------- */
test('Invariant 1: wordmark is the strongest type in the site nav', async ({
  browser,
}) => {
  const viewports = [320, 375, 480, 768, 1024];
  const runs: RunResult[] = [];

  for (const width of viewports) {
    const { context, page } = await openHome(browser, { width });
    try {
      const measurement = await page.evaluate(invariant1Predicate, {
        navSel: SELECTORS.siteNav,
        markSel: SELECTORS.wordmarkText,
      });
      runs.push({
        viewport: String(width),
        mode: 'light',
        pass: measurement.pass,
        measurements: measurement,
      });
    } finally {
      await context.close();
    }
  }

  results.push({
    id: 'invariant-1',
    title: 'Wordmark is the strongest type in .site-nav',
    pass: runs.every((r) => r.pass),
    runs,
  });
  assertAllRunsPassed(
    'Invariant 1 violated — at least one .site-nav text node renders heavier than .wordmark-text:',
    runs,
  );
});

/* ---------------------------------------------------------------------------
 * Invariant 2 — --color-accent resolves to a non-empty color value.
 *
 * REQ-HOME-01 GWT: "accent coloring is non-negotiable at every breakpoint."
 * PDR-004: accent swap #E85D2A (light) → #F06937 (dark) must survive to 320.
 * tokens.css:15 (light), tokens.css:118 (dark).
 *
 * Predicate: getPropertyValue('--color-accent') returns a non-empty string
 * matching #hex or rgb()/rgba(). Light + dark are both required.
 * ------------------------------------------------------------------------- */
test('Invariant 2: --color-accent resolves at every viewport in both modes', async ({
  browser,
}) => {
  const viewports = [320, 768, 1440];
  const modes: Mode[] = ['light', 'dark'];
  const runs: RunResult[] = [];

  for (const width of viewports) {
    for (const mode of modes) {
      const { context, page } = await openHome(browser, { width, mode });
      try {
        const measurement = await page.evaluate(() => {
          const value = getComputedStyle(document.documentElement)
            .getPropertyValue('--color-accent')
            .trim();
          const isHex = /^#[0-9a-f]{3,8}$/i.test(value);
          const isRgb = /^rgba?\(/i.test(value);
          return {
            pass: value !== '' && (isHex || isRgb),
            value,
            format: isHex ? 'hex' : isRgb ? 'rgb' : 'unknown',
          };
        });
        runs.push({
          viewport: String(width),
          mode,
          pass: measurement.pass,
          measurements: measurement,
        });
      } finally {
        await context.close();
      }
    }
  }

  results.push({
    id: 'invariant-2',
    title: '--color-accent resolves to a non-empty color value',
    pass: runs.every((r) => r.pass),
    runs,
  });
  assertAllRunsPassed(
    'Invariant 2 violated — --color-accent is empty or not a recognized color format:',
    runs,
  );
});

/* ---------------------------------------------------------------------------
 * Invariant 3 — .hero-tagline never orphans an accent word on the first or
 *               last visual line.
 *
 * PDR-004 § Wrap behavior (2026-04-19 amendment): "no accent word may stand
 * alone on the first or last line of its phrase." REQ-HOME-01 GWT: "no
 * accent word orphans on the first or last line." The text-wrap: balance
 * CSS is the mechanism; this invariant asserts the OUTCOME.
 *
 * Predicate: after grouping Range.getClientRects() from each top-level
 * child of .hero-tagline into visual lines by top coordinate (1px tolerance
 * for sub-pixel drift), the first line AND the last line each contain at
 * least one rect from a NON-accent source.
 * ------------------------------------------------------------------------- */
test('Invariant 3: .hero-tagline first/last line each contains non-accent text', async ({
  browser,
}) => {
  const viewports = [320, 360, 375, 414];
  const runs: RunResult[] = [];

  for (const width of viewports) {
    const { context, page } = await openHome(browser, { width });
    try {
      const measurement = await page.evaluate(
        ({ taglineSel }) => {
          const tagline = document.querySelector(taglineSel);
          if (!tagline)
            return { pass: false, error: `tagline not found: ${taglineSel}` };

          type RectRecord = {
            top: number;
            left: number;
            right: number;
            bottom: number;
            isAccent: boolean;
            text: string;
          };

          const rectRecords: RectRecord[] = [];
          tagline.childNodes.forEach((child) => {
            const range = document.createRange();
            range.selectNodeContents(child);
            const rects = range.getClientRects();
            const isAccent =
              child.nodeType === Node.ELEMENT_NODE &&
              (child as Element).classList.contains('accent');
            const text = (child.textContent ?? '').trim();
            for (const rect of Array.from(rects)) {
              // Discard empty/whitespace-only rects that collapse under the
              // layout engine — they carry no visible line membership.
              if (rect.width < 0.5 || rect.height < 0.5) continue;
              rectRecords.push({
                top: rect.top,
                left: rect.left,
                right: rect.right,
                bottom: rect.bottom,
                isAccent,
                text,
              });
            }
          });

          // Group by top coordinate within a 1px tolerance to absorb
          // sub-pixel font-metric drift. Iterate rectRecords sorted by top
          // and bucket into lines.
          const tolerance = 1;
          const sorted = [...rectRecords].sort((a, b) => a.top - b.top);
          const lines: { top: number; records: RectRecord[] }[] = [];
          for (const rec of sorted) {
            const existing = lines.find(
              (l) => Math.abs(l.top - rec.top) <= tolerance,
            );
            if (existing) existing.records.push(rec);
            else lines.push({ top: rec.top, records: [rec] });
          }

          if (lines.length === 0) {
            return {
              pass: false,
              error: 'no rects produced for .hero-tagline',
            };
          }

          // The predicate applies uniformly: first line AND last line
          // each contain at least one non-accent character. On a
          // single-line layout the first line IS the last line, so
          // the same check runs once (and would catch a degenerate
          // "whole tagline is accent text" regression too).
          const first = lines[0];
          const last = lines[lines.length - 1];
          const firstHasNonAccent = first.records.some((r) => !r.isAccent);
          const lastHasNonAccent = last.records.some((r) => !r.isAccent);

          return {
            pass: firstHasNonAccent && lastHasNonAccent,
            lineCount: lines.length,
            firstLine: {
              accentOnly: !firstHasNonAccent,
              records: first.records.map((r) => ({
                isAccent: r.isAccent,
                text: r.text,
              })),
            },
            lastLine: {
              accentOnly: !lastHasNonAccent,
              records: last.records.map((r) => ({
                isAccent: r.isAccent,
                text: r.text,
              })),
            },
          };
        },
        { taglineSel: SELECTORS.heroTagline },
      );
      runs.push({
        viewport: String(width),
        mode: 'light',
        pass: measurement.pass,
        measurements: measurement,
      });
    } finally {
      await context.close();
    }
  }

  results.push({
    id: 'invariant-3',
    title: '.hero-tagline does not orphan an accent word on first/last line',
    pass: runs.every((r) => r.pass),
    runs,
  });
  assertAllRunsPassed(
    'Invariant 3 violated — an accent word is the sole content of the first or last visual line:',
    runs,
  );
});

/* ---------------------------------------------------------------------------
 * Invariant 4 — .pillar-links bounding rect does not intersect .nav-actions
 *               bounding rect.
 *
 * PDR-006 constraint 6 (2026-04-19 amendment). Encodes the PR #99 B1
 * regression: at 480vp, flex-wrap: nowrap made .pillar-links (~413px
 * required) overflow its ~316px allocation and overlap .nav-actions,
 * obscuring the theme-toggle moon icon with the active pillar chip.
 * Nav.astro:262-267 names this failure mode explicitly.
 *
 * Predicate: bounding-box intersection test (AABB). No pixel-exact
 * distance measurement; collision is boolean.
 * ------------------------------------------------------------------------- */
test('Invariant 4: .pillar-links and .nav-actions never overlap in the collapse band', async ({
  browser,
}) => {
  const viewports = [320, 375, 414, 480, 500, 600, 640, 700, 767];
  const runs: RunResult[] = [];

  for (const width of viewports) {
    const { context, page } = await openHome(browser, { width });
    try {
      const measurement = await page.evaluate(
        ({ pillarsSel, actionsSel }) => {
          const pillars = document.querySelector(pillarsSel);
          const actions = document.querySelector(actionsSel);
          if (!pillars)
            return { pass: false, error: `not found: ${pillarsSel}` };
          if (!actions)
            return { pass: false, error: `not found: ${actionsSel}` };
          const p = pillars.getBoundingClientRect();
          const a = actions.getBoundingClientRect();
          const overlaps =
            p.left < a.right &&
            p.right > a.left &&
            p.top < a.bottom &&
            p.bottom > a.top;
          return {
            pass: !overlaps,
            pillarsRect: {
              left: p.left,
              right: p.right,
              top: p.top,
              bottom: p.bottom,
              width: p.width,
              height: p.height,
            },
            actionsRect: {
              left: a.left,
              right: a.right,
              top: a.top,
              bottom: a.bottom,
              width: a.width,
              height: a.height,
            },
          };
        },
        { pillarsSel: SELECTORS.pillarLinks, actionsSel: SELECTORS.navActions },
      );
      runs.push({
        viewport: String(width),
        mode: 'light',
        pass: measurement.pass,
        measurements: measurement,
      });
    } finally {
      await context.close();
    }
  }

  results.push({
    id: 'invariant-4',
    title: '.pillar-links does not intersect .nav-actions',
    pass: runs.every((r) => r.pass),
    runs,
  });
  assertAllRunsPassed(
    'Invariant 4 violated — .pillar-links overlaps .nav-actions (PR #99 B1 regression class):',
    runs,
  );
});

/* ---------------------------------------------------------------------------
 * Invariant 5 — No descendant of .site-nav has computed position sticky or
 *               fixed.
 *
 * REQ-MOB-04 declares scroll-padding-top as FORWARD-COMPAT infrastructure
 * for future sticky nav — sticky nav itself is not present at v1 and its
 * adoption is gated behind a new PDR. WCAG SC 2.4.11 Focus Not Obscured
 * (Minimum) is exempted at v1 only while no sticky/fixed elements exist;
 * this invariant enforces that exemption.
 *
 * Predicate: every element under .site-nav has getComputedStyle.position
 * not in {'sticky', 'fixed'}. Viewport-independent in practice; two
 * spot-checks around --bp-md bracket the breakpoint cheaply.
 * ------------------------------------------------------------------------- */
test('Invariant 5: .site-nav subtree has no sticky or fixed descendants', async ({
  browser,
}) => {
  const viewports = [320, 768];
  const runs: RunResult[] = [];

  for (const width of viewports) {
    const { context, page } = await openHome(browser, { width });
    try {
      const measurement = await page.evaluate(
        ({ navSel }) => {
          function describeElement(el: Element): string {
            const tag = el.tagName.toLowerCase();
            const raw =
              typeof el.className === 'string' ? el.className.trim() : '';
            const cls = raw ? '.' + raw.split(/\s+/).join('.') : '';
            return `${tag}${cls}`;
          }
          const rootMatches = Array.from(
            document.querySelectorAll(`${navSel}, ${navSel} *`),
          );
          const violations = rootMatches
            .map((el) => ({
              selector: describeElement(el),
              position: getComputedStyle(el).position,
            }))
            .filter(
              (row) => row.position === 'sticky' || row.position === 'fixed',
            );
          return {
            pass: violations.length === 0,
            scanned: rootMatches.length,
            violations,
          };
        },
        { navSel: SELECTORS.siteNav },
      );
      runs.push({
        viewport: String(width),
        mode: 'light',
        pass: measurement.pass,
        measurements: measurement,
      });
    } finally {
      await context.close();
    }
  }

  results.push({
    id: 'invariant-5',
    title: '.site-nav subtree has no sticky/fixed positioning',
    pass: runs.every((r) => r.pass),
    runs,
  });
  assertAllRunsPassed(
    'Invariant 5 violated — a .site-nav descendant computes to position: sticky or fixed:',
    runs,
  );
});

/* ---------------------------------------------------------------------------
 * Invariant 6 — .latest-section eyebrow label alignment.
 *
 * Issue #147 (supersedes #146). PDR-007 § Consequences — the home-page
 * QA-09 baselines encoded the "LATEST" eyebrow outdent as part of the
 * baseline itself ("the bug IS the baseline"). Pixel-regression therefore
 * cannot catch it; this invariant gates on the design intent directly.
 *
 * Design intent: the `LATEST` eyebrow label above the featured post card
 * aligns horizontally with the card's content origin (not the card's
 * outer edge), and is never closer than 16px to the viewport-left. The
 * eyebrow is the label FOR the card's content — misalignment with the
 * card edge creates the outdent visible at wide widths and the edge-bleed
 * visible at mobile widths (320-414) reported in #146/#147.
 *
 * Predicate: two boolean tests AND-combined, per invariant6Predicate in
 * helpers.ts:
 *   1. |eyebrow.left - cardContentRoot.left| ≤ 2px (tolerance absorbs
 *      sub-pixel font-metric drift between macOS and Linux Chromium —
 *      see tests/visual/README.md § "Baselines must be Linux-generated").
 *   2. eyebrow.left ≥ 16px (viewport-left gutter floor).
 *
 * Viewports per issue #147 proposed spec: 320, 375, 414, 480, 600, 768,
 * 1024, 1440 — the eight that bracket the narrow edge-bleed band, the
 * mid-range collapse band, and the wide-centered band where the outdent
 * was largest in the UI review. Light + dark both iterated so
 * dark-mode-only regressions surface (no known current regression class
 * in dark mode, but the invariant is modality-neutral).
 *
 * Reverse coverage: invariants.reverse.spec.ts injects the pre-fix
 * pattern (zero inline-start inset on the eyebrow) and asserts this
 * predicate detects the outdent with rich measurements.
 * ------------------------------------------------------------------------- */
test('Invariant 6: .latest-section eyebrow aligns with post-card content and respects viewport-left gutter', async ({
  browser,
}) => {
  const viewports = [320, 375, 414, 480, 600, 768, 1024, 1440];
  const modes: Mode[] = ['light', 'dark'];
  const runs: RunResult[] = [];

  for (const width of viewports) {
    for (const mode of modes) {
      const { context, page } = await openHome(browser, { width, mode });
      try {
        const measurement = await page.evaluate(invariant6Predicate, {
          sectionSel: SELECTORS.latestSection,
          eyebrowSel: SELECTORS.latestEyebrow,
          cardContentSel: SELECTORS.latestCardContentRoot,
          tolerancePx: 2,
          minLeftPx: 16,
        });
        runs.push({
          viewport: String(width),
          mode,
          pass: measurement.pass,
          measurements: measurement,
        });
      } finally {
        await context.close();
      }
    }
  }

  results.push({
    id: 'invariant-6',
    title:
      '.latest-section eyebrow aligns with post-card content and clears viewport-left gutter',
    pass: runs.every((r) => r.pass),
    runs,
  });
  assertAllRunsPassed(
    'Invariant 6 violated — .latest-section eyebrow misaligned with post-card content origin or too close to viewport-left (issue #147 class):',
    runs,
  );
});

/* ---------------------------------------------------------------------------
 * Invariant 7 — home-page content-block alignment consistency.
 *
 * Issue #148. PDR-007 § Consequences — the home-page QA-09 baselines at
 * wide viewports encoded the pre-#148 pattern where the .hero section
 * filled the viewport (no max-width) while .latest-section sat in a
 * 48rem-wide centered container. Both section center-x computed to
 * viewport/2, but the rect widths differed, producing the visually
 * "three blocks, three axes" perception reported in the F2 UI-review
 * finding. QA-09 cannot flag this — the baseline IS the pre-#148
 * geometry; pixel regression gates relative to baseline, not relative
 * to design intent. QA-10.3 closes the gap.
 *
 * Design intent (post-#148): .hero and .latest-section share ONE
 * horizontal alignment rule — max-width: 48rem, margin-inline: auto —
 * so their bounding rects are IDENTICAL (and therefore center-aligned)
 * at every viewport. At <768 both fill the viewport; at ≥768 both are
 * 768px centered. Rect identity, not just center-x identity, is the
 * structural guarantee.
 *
 * Predicate (from issue #148 proposed spec):
 *   Math.abs(heroRect.left + heroRect.width/2
 *            - latestRect.left - latestRect.width/2) ≤ 4px.
 *
 * Boolean single-measurement shape, OS-independent. The 4px tolerance
 * absorbs sub-pixel font-metric drift between macOS and Linux Chromium
 * (see tests/visual/README.md § "Baselines must be Linux-generated"):
 * the rect measurement itself is viewport-pixel-exact, but allowing 4px
 * keeps the predicate stable if a future refactor introduces a narrow
 * asymmetry that still preserves visual alignment.
 *
 * Viewports per issue #148 proposed spec: 768, 1024, 1440 — the three
 * desktop widths where the pre-#148 divergence was most visible
 * (hero-fills-viewport vs latest-at-48rem-centered). Light + dark both
 * iterated so dark-mode-only regressions would surface; the invariant
 * is modality-neutral in practice, but the coverage is cheap and
 * symmetric with Invariant 6.
 *
 * Reverse coverage: invariants.reverse.spec.ts injects the pre-#148
 * pattern (zero max-width on .hero, so it re-expands to full viewport
 * width at 1440) and asserts this predicate detects the center-x
 * divergence with rich measurements. The 1440 viewport is chosen for
 * the reverse test because the absolute divergence in rect geometry is
 * largest there and the delta is unambiguous.
 * ------------------------------------------------------------------------- */
test('Invariant 7: .hero and .latest-section share one horizontal alignment axis', async ({
  browser,
}) => {
  const viewports = [768, 1024, 1440];
  const modes: Mode[] = ['light', 'dark'];
  const runs: RunResult[] = [];

  for (const width of viewports) {
    for (const mode of modes) {
      const { context, page } = await openHome(browser, { width, mode });
      try {
        const measurement = await page.evaluate(invariant7Predicate, {
          heroSel: SELECTORS.heroSection,
          latestSel: SELECTORS.latestSection,
          tolerancePx: 4,
        });
        runs.push({
          viewport: String(width),
          mode,
          pass: measurement.pass,
          measurements: measurement,
        });
      } finally {
        await context.close();
      }
    }
  }

  results.push({
    id: 'invariant-7',
    title:
      '.hero and .latest-section center-x match within 4px at desktop widths',
    pass: runs.every((r) => r.pass),
    runs,
  });
  assertAllRunsPassed(
    'Invariant 7 violated — .hero and .latest-section center-x diverge beyond the 4px tolerance (issue #148 F2 class):',
    runs,
  );
});

/* ---------------------------------------------------------------------------
 * Invariant 8 — Footer stacked-layout column alignment.
 *
 * Issue #149 (PDR-007 audit discovery case; F3 Major). The stacked footer
 * layout (≤600px viewport) places the tagline and the About link on
 * consecutive rows at the left edge of the footer's content column. The
 * design intent is that the two elements share a left coordinate — a
 * future refactor that shifted the link box right of the tagline (e.g.,
 * added margin-inline-start, or swapped the flex context so the link no
 * longer tracks flex-start) would visibly break the shared-column
 * rhythm that the stacked layout assumes.
 *
 * Design context (post-#149): the rendered "About" text aligns with the
 * tagline's first character thanks to the stacked-layout `justify-content:
 * flex-start` override on `.footer-link` (Footer.astro). The touch target
 * min-width stays at var(--touch-target) per WCAG 2.5.5 / REQ-MOB-03 —
 * the fix relaxes horizontal text centering only in the stacked layout.
 * Invariant 8 asserts the element-rect alignment as a forward-compat
 * guard (see helpers.ts § invariant8Predicate for the scope note). The
 * rendered-text shift itself is gated by QA-09 pixel baselines
 * regenerated with the fix; this invariant catches element-shift
 * regressions that pixel diff would also catch but at a different
 * abstraction layer.
 *
 * Predicate (from issue #149 proposed spec):
 *   |taglineRect.left - aboutLinkRect.left| ≤ 1px.
 *
 * Viewports per issue #149 proposed spec: 320, 375, 414, 480, 600 — the
 * five within the stacked-layout range (max-width: 639px). At ≥640px
 * the About link moves to the right edge of the horizontal row and the
 * shared-column assumption no longer applies, so the invariant
 * deliberately does NOT cover wider widths. Light + dark both iterated
 * so dark-mode-only regressions surface; the invariant is
 * modality-neutral in practice but the coverage is cheap and symmetric
 * with Invariant 6 / Invariant 7.
 *
 * Reverse coverage: invariants.reverse.spec.ts injects the pre-fix-shape
 * class as a DOM mutation (adds margin-inline-start: 24px to the link)
 * and asserts this predicate detects the element-rect divergence with
 * rich measurements. The DOM-mutation pattern matches the Invariant 9 +
 * 11 reverse tests (OS-robust — see the Invariant 11 reverse block's
 * explanation of why CSS-only injection can miss on Linux at borderline
 * metrics). The injected shift (24px) is well above the 1px tolerance.
 * ------------------------------------------------------------------------- */
test('Invariant 8: footer tagline and About link share a left coordinate in stacked layout', async ({
  browser,
}) => {
  const viewports = [320, 375, 414, 480, 600];
  const modes: Mode[] = ['light', 'dark'];
  const runs: RunResult[] = [];

  for (const width of viewports) {
    for (const mode of modes) {
      const { context, page } = await openHome(browser, { width, mode });
      try {
        const measurement = await page.evaluate(invariant8Predicate, {
          footerSel: SELECTORS.siteFooter,
          taglineSel: SELECTORS.footerTagline,
          aboutLinkSel: SELECTORS.footerAboutLink,
          tolerancePx: 1,
        });
        runs.push({
          viewport: String(width),
          mode,
          pass: measurement.pass,
          measurements: measurement,
        });
      } finally {
        await context.close();
      }
    }
  }

  results.push({
    id: 'invariant-8',
    title:
      'footer tagline and About link share a left coordinate in stacked layout',
    pass: runs.every((r) => r.pass),
    runs,
  });
  assertAllRunsPassed(
    'Invariant 8 violated — footer tagline and About link rects diverge beyond the 1px tolerance in stacked layout (issue #149 F3 class):',
    runs,
  );
});

/* ---------------------------------------------------------------------------
 * Invariant 9 — Post card summary rendering consistency across index surfaces.
 *
 * Issue #150 (second post-MVP addition under § When to add trigger 2 "new
 * failure class discovered"; see INVARIANTS-RUNBOOK.md). Discovered via
 * /review-ui on QA-09 baselines (`.tmp/scopes/ui-review-findings.md` § F4):
 * the same post renders its summary visibly truncated at `.post-card` on
 * `/blog/` but full-length at `.post-card-featured` on `/`, and QA-09
 * cannot distinguish intentional content truncation from bug because the
 * two surfaces render at different DOM nodes.
 *
 * Decision captured in PR #150 body (option a): home LATEST uses
 * PostCardFeatured with no CSS clamp (single featured card, deliberate
 * prominence); blog-index uses PostCard with `-webkit-line-clamp: 2` for
 * grid-uniform card heights. Per-surface VISUAL divergence is intentional
 * and documented in both components. DOM textContent identity, however, is
 * the load-bearing contract: if a future change accidentally truncates a
 * post's `description` prop for one surface only (server-side render path
 * divergence, per-surface length limit, different content source), the
 * reader would see two different post previews depending on entry point.
 * This invariant is the runtime guard against that class.
 *
 * Predicate:
 *   - Visit `/` and `/blog/` at viewport W.
 *   - On each, collect `[data-post-id=X] .post-card-summary` as
 *     `{postId, text, selector}` entries.
 *   - Correlate by `postId`: for every id that appears on BOTH surfaces,
 *     the trimmed textContent must be identical byte-for-byte.
 *   - At least one shared post-id is required; zero-shared is treated as
 *     a failure (guards against a "no cards rendered" regression that
 *     would otherwise make the invariant vacuously true).
 *
 * Viewports per issue #150 proposed spec: 320 + 768 — the summary text
 * content contract is viewport-independent by construction (it asserts
 * textContent, not layout geometry), but 320 + 768 bracket the narrow
 * edge-bleed band and the wide single-column band so a viewport-dependent
 * rendering path regression would surface in either. Light mode only:
 * textContent is color-scheme-independent; dark-mode coverage would add
 * no failure class beyond what light already captures (per the MVP
 * convention established by Invariants 1 + 5).
 *
 * Reverse coverage: invariants.reverse.spec.ts injects a DOM mutation on
 * `/blog/` that rewrites one `.post-card-summary` textContent to a
 * sentinel string, then asserts the predicate detects the divergence with
 * rich measurements (postId, before/after texts, selector). The
 * mutation-injection pattern diverges from the CSS-injection pattern used
 * by Invariants 1 + 6 because the predicate asserts textContent rather
 * than computed layout — CSS cannot create a textContent divergence.
 * ------------------------------------------------------------------------- */
test('Invariant 9: post-card summary text is identical across index surfaces for shared post-ids', async ({
  browser,
}) => {
  const viewports = [320, 768];
  const runs: RunResult[] = [];

  for (const width of viewports) {
    const { context: homeCtx, page: homePage } = await openPath(browser, '/', {
      width,
    });
    let homeEntries;
    try {
      homeEntries = await homePage.evaluate(collectPostSummariesPredicate, {
        summarySel: SELECTORS.postCardSummary,
        postIdAttr: SELECTORS.postIdAttr,
      });
    } finally {
      await homeCtx.close();
    }

    const { context: blogCtx, page: blogPage } = await openPath(
      browser,
      '/blog/',
      { width },
    );
    let blogEntries;
    try {
      blogEntries = await blogPage.evaluate(collectPostSummariesPredicate, {
        summarySel: SELECTORS.postCardSummary,
        postIdAttr: SELECTORS.postIdAttr,
      });
    } finally {
      await blogCtx.close();
    }

    const correlation = correlatePostSummaries(homeEntries, blogEntries);
    runs.push({
      viewport: String(width),
      mode: 'light',
      pass: correlation.pass,
      measurements: correlation,
    });
  }

  results.push({
    id: 'invariant-9',
    title:
      'post-card summary textContent is identical across home and blog-index for shared post-ids',
    pass: runs.every((r) => r.pass),
    runs,
  });
  assertAllRunsPassed(
    'Invariant 9 violated — `.post-card-summary` textContent diverges across index surfaces for at least one shared `[data-post-id]` (issue #150 class):',
    runs,
  );
});

/* ---------------------------------------------------------------------------
 * Invariant 10 — Footer social icon row wrap distribution.
 *
 * Issue #151 (PDR-007 audit discovery case; F5 Minor). The footer's
 * 9-icon channel list (8 social channels + RSS) has an odd count;
 * natural flex-wrap at specific viewports (≤374 and the mid-tablet
 * band on Linux around 768-845) lands one icon alone on the final
 * row. At 320 the layout reads as 2+3+3+1 with RSS widowed; in the
 * mid-tablet band the layout reads as 8+1 with RSS widowed. Single-
 * icon widow rows read as oversight, reduce the visual weight of
 * whichever icon was orphaned, and most notably downgrade RSS — the
 * brand's primary subscription CTA after the PDR-005 analytics
 * deferral.
 *
 * Design intent (post-#151): when the channel list wraps to multiple
 * rows, the FINAL row contains ≥ 2 icons. The mechanism is a
 * zero-height, `flex-basis: 100%` `.wrap-spacer` `<li>` inserted
 * before the last array entry (X), gated to a targeted media query
 * range so it only activates where natural wrap would widow (≤374
 * and 768-845). The spacer forces X + RSS onto a shared row after an
 * artificial wrap point, guaranteeing the ≥ 2 assertion at widow-
 * prone viewports while leaving other widths untouched. The spacer
 * carries no `.channel-link` class and no visible content so it is
 * naturally excluded from the row grouping.
 *
 * Predicate (from issue #151 proposed spec, adapted to the real
 * class names):
 *   group `.channel-link` elements by getBoundingClientRect().top
 *   within a 1px tolerance; if rows.length > 1, rows[last].length ≥ 2.
 *
 * Viewports per issue #151 proposed spec: the full canonical width
 * set — 320, 375, 414, 480, 500, 600, 640, 700, 767, 768, 1024 —
 * "any width where wrap can occur." The 1440 desktop width is
 * added for symmetry with the other desktop-covering invariants;
 * its single-row layout trivially satisfies the predicate. Light-
 * only: the channel list's wrap geometry is color-scheme-independent
 * by construction (no per-mode width shift), and light-only coverage
 * matches the MVP convention established by Invariants 1 + 5 for
 * layout-only predicates that are not modality-sensitive.
 *
 * Reverse coverage: invariants.reverse.spec.ts removes the
 * `.wrap-spacer` element via DOM mutation at 320, re-exposing the
 * pre-fix 2+3+3+1 widow, and asserts this predicate detects it with
 * rich measurements (linkCount, rowCount, lastRowCount, per-row
 * label breakdown). The DOM-mutation pattern matches the Invariants
 * 8 + 9 + 11 reverse tests (OS-robust per #156's lesson learned) —
 * a CSS `addStyleTag` override hiding the spacer would equally
 * work for this specific fix since the spacer is the only
 * layout-changing mechanism, but DOM mutation harmonizes with the
 * rest of the suite and also proves detection of the underlying
 * widow class independent of the fix mechanism.
 * ------------------------------------------------------------------------- */
test('Invariant 10: footer social row wrap has no single-icon widow', async ({
  browser,
}) => {
  const viewports = [
    320, 375, 414, 480, 500, 600, 640, 700, 767, 768, 1024, 1440,
  ];
  const runs: RunResult[] = [];

  for (const width of viewports) {
    const { context, page } = await openHome(browser, { width });
    try {
      const measurement = await page.evaluate(invariant10Predicate, {
        selector: SELECTORS.channelLink,
        tolerancePx: 1,
        minLastRow: 2,
      });
      runs.push({
        viewport: String(width),
        mode: 'light',
        pass: measurement.pass,
        measurements: measurement,
      });
    } finally {
      await context.close();
    }
  }

  results.push({
    id: 'invariant-10',
    title:
      'footer social row wrap has no single-icon widow on final row',
    pass: runs.every((r) => r.pass),
    runs,
  });
  assertAllRunsPassed(
    'Invariant 10 violated — footer channel list wraps with a single-icon widow on the final row (issue #151 F5 class):',
    runs,
  );
});

/* ---------------------------------------------------------------------------
 * Invariant 11 — .hero-descriptor (hero meta line) no short widow.
 *
 * Issue #152 (PDR-007 audit discovery case). The hero meta line
 * ("What works? When to use? How to do?") wrapped at 320px as
 * "What works? When to use? How to" / "do?" under the natural greedy
 * wrap — a 3-character widow line distinct from the PDR-004
 * accent-orphan class that Invariant 3 guards on .hero-tagline. The
 * widow cleared Invariant 3 because "do" is non-accent, but the
 * visual rhythm was still broken. The fix applies `text-wrap: balance`
 * on .hero-descriptor (index.astro); this invariant gates the outcome.
 *
 * Predicate: character-level line grouping. Walk each text-node
 * character inside .hero-descriptor, read its rect via a length-1
 * Range, group by top-coordinate with 1px tolerance (matches
 * Invariant 3 — absorbs sub-pixel font-metric drift between macOS and
 * Linux Chromium per `audit-tooling-design.md § QA-10.3 Linux-parity
 * approach`), and assert the last visual line carries ≥ N characters
 * (N=6 per issue spec). Character-level rather than child-level
 * because a single text-node child may span multiple lines — see
 * helpers.ts § invariant11Predicate for the Invariant 3 vs Invariant 11
 * unit-of-measurement distinction.
 *
 * Viewports: 320, 360, 375, 414 — scope-matched to Invariant 3 (the
 * mobile band where .hero-descriptor is reachable). Only 320
 * exercises the wrap path at current font sizing; 360/375/414 fit
 * on a single line today (expect `lineCount: 1` in the per-run
 * report — by design, not a silent pass). Running the non-wrapping
 * viewports anyway is forward-compat defense: if content or token
 * values shift so .hero-descriptor wraps at 360+, the invariant
 * gates the new wrap without a viewport-set edit. Light-only;
 * weight and wrap are color-scheme-independent.
 *
 * Reverse coverage: invariants.reverse.spec.ts injects `text-wrap:
 * auto` (reverting the fix to the pre-fix greedy wrap) at 320px and
 * asserts this predicate detects the "do?" widow with rich
 * measurements.
 * ------------------------------------------------------------------------- */
test('Invariant 11: .hero-descriptor last visual line has ≥6 characters', async ({
  browser,
}) => {
  const viewports = [320, 360, 375, 414];
  const runs: RunResult[] = [];

  for (const width of viewports) {
    const { context, page } = await openHome(browser, { width });
    try {
      const measurement = await page.evaluate(invariant11Predicate, {
        selector: SELECTORS.heroDescriptor,
        tolerancePx: 1,
        minChars: 6,
      });
      runs.push({
        viewport: String(width),
        mode: 'light',
        pass: measurement.pass,
        measurements: measurement,
      });
    } finally {
      await context.close();
    }
  }

  results.push({
    id: 'invariant-11',
    title: '.hero-descriptor last visual line has ≥6 characters',
    pass: runs.every((r) => r.pass),
    runs,
  });
  assertAllRunsPassed(
    'Invariant 11 violated — .hero-descriptor last visual line is shorter than 6 characters (issue #152 widow class):',
    runs,
  );
});
