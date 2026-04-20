/**
 * axe-core WCAG 2.2 AA accessibility suite (QA-08).
 *
 * Zero violations at 320/375/414/768/1024 CSS px widths on Home /
 * Blog Index / Blog Post, in both light and dark modes. Binary gate.
 *
 * Sources:
 *  - docs/website/prd.md § QA-08 (WCAG 2.2 AA, wcag22aa ruleset)
 *  - docs/website/ux-architecture.md § Mobile Accessibility + § Measurement Baseline
 *  - PDR-006 § Measurement Baseline (mobile nav wrap, no hamburger)
 *
 * Tags union (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) is the
 * cumulative WCAG 2.2 AA check — each newer revision adds rules rather than
 * replacing the prior set. axe-core v4.7+ ships the `wcag22aa` rules.
 *
 * Dark-mode setup: the site reads `localStorage.theme` in an inline script
 * in `BaseHead.astro` before first paint. We set it via
 * `context.addInitScript` so there is no flash and no toggle click needed.
 */
import type { Result as AxeResult } from 'axe-core';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

type Mode = 'light' | 'dark';

interface Viewport {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

interface Target {
  readonly label: string;
  readonly path: string;
}

const VIEWPORTS: readonly Viewport[] = [
  // 320 uses iPhone SE 1st-gen aspect per QA-09 convention.
  { label: '320', width: 320, height: 568 },
  { label: '375', width: 375, height: 667 },
  { label: '414', width: 414, height: 896 },
  { label: '768', width: 768, height: 1024 },
  { label: '1024', width: 1024, height: 768 },
];

const TARGETS: readonly Target[] = [
  { label: 'home', path: '/' },
  { label: 'blog-index', path: '/blog/' },
  // sample-post is the only published post at v1; if additional posts land,
  // pick one explicitly — a11y scope is "at least one" per QA-08.
  { label: 'blog-post', path: '/blog/sample-post/' },
];

const MODES: readonly Mode[] = ['light', 'dark'];

const WCAG_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
] as const;

for (const viewport of VIEWPORTS) {
  for (const target of TARGETS) {
    for (const mode of MODES) {
      const title = `${target.label} @ ${viewport.label}px (${mode}) — no WCAG 2.2 AA violations`;

      test(title, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          colorScheme: mode,
          reducedMotion: 'reduce',
        });

        // Pin the theme deterministically: matches BaseHead.astro's inline
        // script, which runs pre-paint and reads `localStorage.theme`.
        // Belt-and-suspenders with `colorScheme` above — prevents drift from
        // OS-level prefers-color-scheme leaking through.
        await context.addInitScript((m) => {
          window.localStorage.setItem('theme', m);
        }, mode);

        const page = await context.newPage();

        try {
          await page.goto(target.path, { waitUntil: 'networkidle' });

          // Sanity-check that theme actually applied. If this fails the
          // axe result below would be scanning the wrong rendering, which
          // would be misleading.
          if (mode === 'dark') {
            await expect(page.locator('html')).toHaveClass(/\bdark\b/);
          } else {
            await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
          }

          const results = await new AxeBuilder({ page })
            .withTags([...WCAG_TAGS])
            .analyze();

          const message = formatViolations(results.violations, {
            viewport: viewport.label,
            path: target.path,
            mode,
          });

          expect(results.violations, message).toEqual([]);
        } finally {
          await context.close();
        }
      });
    }
  }
}

function formatViolations(
  violations: AxeResult[],
  ctx: { viewport: string; path: string; mode: Mode },
): string {
  if (violations.length === 0) {
    return '';
  }

  const header = `axe-core found ${violations.length} violation(s) on ${ctx.path} @ ${ctx.viewport}px (${ctx.mode}):`;

  const lines = violations.map((v, i) => {
    const nodeCount = v.nodes.length;
    const nodePreview = v.nodes
      .slice(0, 3)
      .map((n) => n.target.join(' '))
      .join('\n       ');
    return [
      `  ${i + 1}. [${v.id}] ${v.help} — impact=${v.impact ?? 'n/a'}, nodes=${nodeCount}`,
      `     ${v.helpUrl}`,
      `     targets:\n       ${nodePreview}`,
    ].join('\n');
  });

  return [header, ...lines].join('\n');
}
