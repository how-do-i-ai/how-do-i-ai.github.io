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

import { invariant1Predicate } from './helpers';
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
  await page.goto('/', { waitUntil: 'networkidle' });

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
