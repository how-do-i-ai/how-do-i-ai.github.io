/**
 * QA-10.3 reverse-test evidence — Invariant 1 detection proof.
 *
 * Issue #121 AC: "at least one invariant, when a fixture is deliberately
 * broken (e.g., temporary CSS change makes wordmark `font-weight: 400`),
 * fails with a measurement-rich message identifying the violation."
 *
 * This spec injects a CSS rule that makes .wordmark-text's font-weight fall
 * below a `.pillar-link` (and below any other nav text-bearing node) and
 * then runs the Invariant 1 predicate against the broken DOM. The test
 * PASSES when the predicate CORRECTLY DETECTS the violation and surfaces
 * concrete measurements (weights, selectors, text previews).
 *
 * Runs in the same `audit-invariants` Playwright project as the primary
 * spec, so it is exercised on every CI run — the existence of live
 * detection is a standing guarantee rather than a one-off demo.
 */
import { test, expect, type Browser } from '@playwright/test';

import { invariant1Predicate } from './helpers';
import { SELECTORS } from './selectors';

async function openHomeWithInjection(
  browser: Browser,
  css: string,
): Promise<{
  page: import('@playwright/test').Page;
  close: () => Promise<void>;
}> {
  const context = await browser.newContext({
    viewport: { width: 480, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    window.localStorage.setItem('theme', 'light');
  });
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'networkidle' });
  // Inject AFTER load so the override wins the cascade.
  await page.addStyleTag({ content: css });
  return {
    page,
    close: async () => {
      await context.close();
    },
  };
}

test('reverse: Invariant 1 detects a forced-normal wordmark with rich measurements', async ({
  browser,
}) => {
  // Inversion: force .wordmark-text to normal weight AND a pillar-link to
  // bold. Under the intact design both are Medium/Semibold or lower vs.
  // Bold 700 mark — inverting produces a concrete, targeted violation.
  const breakingCss = `
    .wordmark-text { font-weight: 400 !important; }
    .pillar-link { font-weight: 800 !important; }
  `;
  const { page, close } = await openHomeWithInjection(browser, breakingCss);

  try {
    const measurement = await page.evaluate(invariant1Predicate, {
      navSel: SELECTORS.siteNav,
      markSel: SELECTORS.wordmarkText,
    });

    // The injected CSS is a real violation — the predicate must detect it.
    expect(
      measurement.pass,
      `Invariant 1 FAILED to detect the injected violation. Raw measurement: ${JSON.stringify(
        measurement,
        null,
        2,
      )}`,
    ).toBe(false);

    // Narrow to the success-shape (pass:false + error) vs the measurement
    // shape. Error branch means the predicate didn't even reach the scan —
    // that's an infrastructure failure, not detection evidence.
    if ('error' in measurement) {
      throw new Error(
        `predicate short-circuited before scanning: ${measurement.error}`,
      );
    }

    // Measurement richness: the detection must expose the concrete
    // wordmark weight, the count of compared nodes, and the specific
    // violating entries with selector / weight / text-preview.
    expect(measurement.markWeight, 'markWeight must be reported').toBe(400);
    expect(
      typeof measurement.comparedCount,
      'comparedCount must be a number',
    ).toBe('number');
    expect(
      Array.isArray(measurement.violations),
      'violations must be an array',
    ).toBe(true);
    expect(
      measurement.violations.length,
      'at least one violating element is expected',
    ).toBeGreaterThan(0);

    // The pillar-link is the element whose weight was forced up. Its
    // presence in the violation list — with its pumped-up weight — is
    // the concrete, actionable signal we want from a live failure.
    const pillarHit = measurement.violations.find((v) =>
      v.selector.startsWith('a.pillar-link'),
    );
    expect(
      pillarHit,
      `expected .pillar-link to appear in violations; got ${JSON.stringify(
        measurement.violations,
      )}`,
    ).toBeDefined();
    expect(pillarHit!.weight, 'pillar-link weight reported').toBe(800);
    expect(
      pillarHit!.text.length,
      'pillar-link text preview reported',
    ).toBeGreaterThan(0);
  } finally {
    await close();
  }
});
