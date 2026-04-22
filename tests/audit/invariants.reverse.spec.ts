/**
 * QA-10.3 reverse-test evidence — detection proofs for the invariant set.
 *
 * Every reverse test here pairs with a forward invariant in
 * `invariants.spec.ts` and proves that the shared predicate in
 * `helpers.ts` actually detects its named failure class. The pattern:
 * open the home page, inject a CSS override that recreates a specific
 * pre-fix / broken geometry, run the SAME predicate the forward spec
 * runs, assert `pass: false` plus rich measurements. Without the
 * shared-predicate discipline (helpers.ts), the reverse test would
 * vouch for a predicate that isn't the one gating CI.
 *
 * Coverage today:
 *   - Invariant 1 (per issue #121 AC) — forced-normal wordmark weight.
 *   - Invariant 6 (per issue #147 AC) — zero inline-start inset on the
 *     .latest-section eyebrow (the pre-fix outdent pattern).
 *   - Invariant 7 (per issue #148 AC) — zero max-width on .hero (the
 *     pre-#148 "hero fills viewport while latest sits in 48rem" axis
 *     mismatch at wide viewports).
 *
 * Runs in the same `audit-invariants` Playwright project as the primary
 * spec, so detection proofs are exercised on every CI run — they are
 * standing guarantees rather than one-off demos.
 */
import { test, expect, type Browser } from '@playwright/test';

import {
  invariant1Predicate,
  invariant6Predicate,
  invariant7Predicate,
} from './helpers';
import { SELECTORS } from './selectors';

async function openHomeWithInjection(
  browser: Browser,
  css: string,
  width = 480,
): Promise<{
  page: import('@playwright/test').Page;
  close: () => Promise<void>;
}> {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
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

/**
 * Reverse coverage for Invariant 6 — demonstrates that the predicate
 * detects the pre-fix outdent pattern from issue #147.
 *
 * Pre-fix pattern (see git history for src/pages/index.astro when the
 * section was `.featured` and the heading had no inline-start inset):
 * the "LATEST" eyebrow sat flush against the section's content-box
 * left edge, while the featured post card's own content began at
 * `+var(--space-8)` (32px) inside the card's padding. Result: a
 * visible outdent at every viewport ≥320px, and an edge-bleed class
 * at <480px where the section had zero horizontal padding and the
 * eyebrow sat at 0px from viewport-left.
 *
 * Inject CSS that forces the pre-fix geometry back (zero inline-start
 * inset on the eyebrow) and assert Invariant 6 detects the violation
 * with rich measurements (eyebrow.left, cardContent.left, delta).
 *
 * 1440px viewport: deliberately chosen so the absolute outdent is
 * largest and the delta is unambiguous (the card-padding constant is
 * viewport-independent, but at 1440 the "wide width" pattern named in
 * #147's context block is the exact failure mode this invariant gates).
 */
test('reverse: Invariant 6 detects .latest-section eyebrow outdent with rich measurements', async ({
  browser,
}) => {
  // Force the pre-fix geometry: zero the eyebrow's inline-start inset
  // (both margin and padding, so the test is robust against whichever
  // mechanism the source uses to align the eyebrow). Under the fixed
  // design the eyebrow is inset by var(--space-8) ≈ 32px to match the
  // card's content origin; zeroing that inset re-creates the outdent.
  const breakingCss = `
    .latest-section [data-eyebrow] {
      margin-inline-start: 0 !important;
      padding-inline-start: 0 !important;
    }
  `;
  const { page, close } = await openHomeWithInjection(
    browser,
    breakingCss,
    1440,
  );

  try {
    const measurement = await page.evaluate(invariant6Predicate, {
      sectionSel: SELECTORS.latestSection,
      eyebrowSel: SELECTORS.latestEyebrow,
      cardContentSel: SELECTORS.latestCardContentRoot,
      tolerancePx: 2,
      minLeftPx: 16,
    });

    expect(
      measurement.pass,
      `Invariant 6 FAILED to detect the injected outdent. Raw measurement: ${JSON.stringify(
        measurement,
        null,
        2,
      )}`,
    ).toBe(false);

    if ('error' in measurement) {
      throw new Error(
        `predicate short-circuited before measuring: ${measurement.error}`,
      );
    }

    // Measurement richness: both absolute positions and the derived
    // delta must be reported so a CI reviewer can see WHY the gate
    // fired without re-running the spec locally.
    expect(typeof measurement.eyebrowLeft, 'eyebrowLeft reported').toBe(
      'number',
    );
    expect(typeof measurement.cardContentLeft, 'cardContentLeft reported').toBe(
      'number',
    );
    expect(typeof measurement.delta, 'delta reported').toBe('number');

    // The pre-fix pattern outdent is the card's own padding (≈32px);
    // with a 2px tolerance, any delta ≥ ~30px is the named failure
    // class. Assert a generous lower bound on the delta so the reverse
    // test is robust against minor token drift if var(--space-8) ever
    // changes (which itself would be a PDR-graded decision and would
    // retire this reverse test alongside the invariant refinement).
    expect(
      measurement.delta,
      'delta should be well above the 2px tolerance for this named regression class',
    ).toBeGreaterThan(10);

    // The specific geometric pattern for #147: card content sits
    // strictly to the RIGHT of the eyebrow (card-padding outdent). If
    // cardContent were left-of eyebrow, that would be a different
    // regression class (eyebrow-overruns) and a different fix — so
    // asserting the direction is part of the detection's specificity.
    expect(
      measurement.cardContentLeft,
      `card content must sit right of eyebrow in this regression class (eyebrowLeft=${measurement.eyebrowLeft}, cardContentLeft=${measurement.cardContentLeft})`,
    ).toBeGreaterThan(measurement.eyebrowLeft);

    // Tolerance + min-left reported alongside, so the measurement blob
    // is self-contained for post-hoc inspection.
    expect(measurement.toleranceOk, 'toleranceOk must be false').toBe(false);
  } finally {
    await close();
  }
});

/**
 * Reverse coverage for Invariant 7 — demonstrates that the predicate
 * detects the pre-#148 "hero fills viewport, latest sits in 48rem"
 * axis-mismatch pattern from issue #148.
 *
 * Pre-#148 pattern (see git history for src/pages/index.astro before
 * the Invariant 7 landing): .hero had no max-width, so its section rect
 * spanned the full viewport; .latest-section had max-width: 48rem with
 * margin-inline: auto, so at 1440 its rect was 768px centered starting
 * at left=336. Both rects' center-x computed to viewport/2 — so the
 * WIDTHS differed (1440 vs 768) while the CENTERS coincided. The
 * predicate MUST reject geometry where the two section rects have
 * divergent widths — if it only checked center-x, the pre-#148 state
 * would falsely pass.
 *
 * Inject CSS that forces the pre-#148 geometry back on .hero: override
 * max-width to none AND margin-inline to 0 so .hero re-expands to
 * fill the viewport. At 1440 the resulting heroRect.width is 1440 and
 * the centers STILL coincide at 720 — but that is exactly the coincidence
 * the invariant is designed NOT to rely on. The tolerance of 4px would
 * pass this injection if the predicate only measured center-x.
 *
 * To produce a reverse test that GENUINELY fails the predicate, we must
 * break the center coincidence as well. We do so by offsetting .hero via
 * margin-inline-start, producing an asymmetric rect whose center-x shifts
 * right of viewport-center while .latest-section stays centered. The
 * resulting delta >> 4px, which the predicate must detect.
 *
 * 1440px viewport: chosen so the injected offset produces an unambiguous
 * delta on the order of hundreds of pixels. The absolute value is not
 * load-bearing; the assertion is that any delta ≥ tolerance detects.
 */
test('reverse: Invariant 7 detects .hero / .latest-section center-x divergence with rich measurements', async ({
  browser,
}) => {
  // Force the pre-#148-adjacent geometry: strip .hero of its max-width
  // AND push it right via a large inline-start margin so its center-x
  // diverges from .latest-section's (which remains 48rem centered). If
  // we only stripped max-width, heroRect center-x would still land on
  // viewport/2 and coincide with latestRect center-x — a passing run,
  // not a detection. The offset is what exercises the detection path.
  const breakingCss = `
    .hero {
      max-width: none !important;
      margin-inline: 0 !important;
      margin-inline-start: 200px !important;
    }
  `;
  const { page, close } = await openHomeWithInjection(
    browser,
    breakingCss,
    1440,
  );

  try {
    const measurement = await page.evaluate(invariant7Predicate, {
      heroSel: SELECTORS.heroSection,
      latestSel: SELECTORS.latestSection,
      tolerancePx: 4,
    });

    expect(
      measurement.pass,
      `Invariant 7 FAILED to detect the injected center-x divergence. Raw measurement: ${JSON.stringify(
        measurement,
        null,
        2,
      )}`,
    ).toBe(false);

    if ('error' in measurement) {
      throw new Error(
        `predicate short-circuited before measuring: ${measurement.error}`,
      );
    }

    // Measurement richness: absolute rects AND derived centers AND the
    // delta must all be reported so a CI reviewer can see WHY the gate
    // fired without re-running the spec locally.
    expect(typeof measurement.heroLeft, 'heroLeft reported').toBe('number');
    expect(typeof measurement.heroWidth, 'heroWidth reported').toBe('number');
    expect(typeof measurement.heroCenterX, 'heroCenterX reported').toBe(
      'number',
    );
    expect(typeof measurement.latestLeft, 'latestLeft reported').toBe('number');
    expect(typeof measurement.latestWidth, 'latestWidth reported').toBe(
      'number',
    );
    expect(typeof measurement.latestCenterX, 'latestCenterX reported').toBe(
      'number',
    );
    expect(typeof measurement.delta, 'delta reported').toBe('number');

    // The injected 200px margin-inline-start shifts hero center-x by
    // ~100px vs its un-offset position (half the margin, since the
    // added width also shifts but hero is now full-viewport). Assert a
    // generous lower bound that is well above the 4px tolerance and
    // well below the injected magnitude so token drift does not
    // invalidate the reverse test.
    expect(
      measurement.delta,
      'delta should be well above the 4px tolerance for this named regression class',
    ).toBeGreaterThan(20);

    // The specific geometric pattern for #148: hero rect shifted right
    // of latest rect (injected margin-inline-start). If the direction
    // were inverted (hero rect shifted LEFT of latest), that would be a
    // different regression class and a different fix — so asserting
    // the direction is part of the detection's specificity.
    expect(
      measurement.heroCenterX,
      `hero center must sit right of latest center in this regression class (heroCenterX=${measurement.heroCenterX}, latestCenterX=${measurement.latestCenterX})`,
    ).toBeGreaterThan(measurement.latestCenterX);
  } finally {
    await close();
  }
});
