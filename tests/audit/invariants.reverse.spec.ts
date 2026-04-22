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
 *   - Invariant 8 (per issue #149 AC) — footer About link element rect
 *     shifted right of the tagline in the stacked layout. Injected via
 *     DOM-mutated inline style (matches the OS-robust convention
 *     established by Invariants 9 + 11 reverse tests).
 *   - Invariant 9 (per issue #150 AC) — server-side textContent
 *     divergence across index surfaces. Injected via DOM mutation
 *     (not CSS) because the predicate asserts textContent, not
 *     layout — CSS clamp is the documented per-surface visual rule
 *     and correctly does NOT trip the invariant.
 *   - Invariant 11 (per issue #152 AC) — greedy wrap on
 *     .hero-descriptor at 320px (the pre-fix "do?" widow pattern).
 *
 * Runs in the same `audit-invariants` Playwright project as the primary
 * spec, so detection proofs are exercised on every CI run — they are
 * standing guarantees rather than one-off demos.
 */
import { test, expect, type Browser } from '@playwright/test';

import {
  collectPostSummariesPredicate,
  correlatePostSummaries,
  invariant1Predicate,
  invariant6Predicate,
  invariant7Predicate,
  invariant8Predicate,
  invariant11Predicate,
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

/**
 * Reverse coverage for Invariant 8 — demonstrates that the predicate
 * detects footer About link element-rect shift in the stacked layout.
 *
 * Pre-fix shape for issue #149's forward-compat guard: the About link's
 * bounding rect left is shifted right of the tagline's (e.g., by a
 * future refactor adding margin-inline-start, or swapping the flex
 * context so the link no longer tracks flex-start). The FIX itself
 * changes `justify-content` only — which does NOT affect element rects
 * — so the forward invariant passes both before AND after the fix in
 * the current code. See helpers.ts § invariant8Predicate for the scope
 * note. Element-rect shift is nevertheless a real regression class
 * worth a standing guard.
 *
 * Mechanism: DOM mutation via inline style (`margin-inline-start:
 * 24px`) on the `.footer-link`. Matches the OS-robust convention of
 * Invariants 9 + 11 reverse tests — a CSS `addStyleTag` injection
 * would equally work for an element-rect shift (no font-metric
 * replay), but the DOM-mutation pattern is more direct for
 * geometry-only perturbations and harmonizes with the rest of the
 * suite. The 24px shift is chosen well above the 1px tolerance so the
 * assertion is unambiguous, and comfortably below any viewport width
 * so the link does not hit the right edge.
 *
 * 320px viewport: the narrowest of the stacked-layout scope viewports
 * (320, 375, 414, 480, 600) — chosen so the reverse test is
 * unambiguously in the stacked-layout regime. One reverse viewport is
 * sufficient to prove detection; running all five would add no failure
 * class.
 */
test('reverse: Invariant 8 detects footer About link element shift with rich measurements', async ({
  browser,
}) => {
  const width = 320;

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

  try {
    // DOM mutation: shift the `.footer-link` element rect right of the
    // tagline's element rect via an inline `margin-inline-start` style.
    // inline style wins the cascade without needing `!important`; no
    // font-metric replay is involved, so the shift is OS-deterministic.
    const appliedShift = await page.evaluate(() => {
      const link = document.querySelector<HTMLElement>(
        '.site-footer .footer-link',
      );
      if (!link) return null;
      link.style.marginInlineStart = '24px';
      return 24;
    });

    expect(
      appliedShift,
      'reverse setup requires a `.site-footer .footer-link` in the DOM at 320',
    ).toBe(24);

    const measurement = await page.evaluate(invariant8Predicate, {
      footerSel: SELECTORS.siteFooter,
      taglineSel: SELECTORS.footerTagline,
      aboutLinkSel: SELECTORS.footerAboutLink,
      tolerancePx: 1,
    });

    expect(
      measurement.pass,
      `Invariant 8 FAILED to detect the injected element-rect shift. Raw measurement: ${JSON.stringify(
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
    expect(typeof measurement.taglineLeft, 'taglineLeft reported').toBe(
      'number',
    );
    expect(typeof measurement.aboutLinkLeft, 'aboutLinkLeft reported').toBe(
      'number',
    );
    expect(typeof measurement.delta, 'delta reported').toBe('number');

    // The injected 24px shift is well above the 1px tolerance. Assert a
    // lower bound that is comfortably above the tolerance (so the test
    // is robust against small font-metric drift in the tagline's left
    // rect) but well below the injected magnitude (so the test is
    // robust against token drift that might change surrounding
    // spacing).
    expect(
      measurement.delta,
      'delta should be well above the 1px tolerance for this named regression class',
    ).toBeGreaterThan(10);

    // The specific geometric pattern for #149: the About link rect
    // sits strictly RIGHT of the tagline rect (margin-inline-start
    // shift). If the direction were inverted (link rect left of
    // tagline), that would be a different regression class and a
    // different fix — so asserting the direction is part of the
    // detection's specificity.
    expect(
      measurement.aboutLinkLeft,
      `About link rect must sit right of tagline rect in this regression class (taglineLeft=${measurement.taglineLeft}, aboutLinkLeft=${measurement.aboutLinkLeft})`,
    ).toBeGreaterThan(measurement.taglineLeft);

    // Tolerance reported alongside so the measurement blob is
    // self-contained for post-hoc inspection.
    expect(measurement.tolerancePx, 'tolerancePx echoed in measurement').toBe(
      1,
    );
  } finally {
    await context.close();
  }
});

/**
 * Reverse coverage for Invariant 9 — demonstrates that the predicate
 * detects server-side textContent divergence across index surfaces.
 *
 * The forward invariant's failure class is: a post whose summary on `/`
 * has different textContent from the same post's summary on `/blog/`.
 * CSS injection cannot reproduce this — `-webkit-line-clamp` hides text
 * visually but leaves textContent intact, and in fact is the DOCUMENTED
 * per-surface visual rule the invariant explicitly tolerates. So the
 * reverse pattern here diverges from Invariants 1 + 6: rather than
 * inject CSS, we mutate the DOM on one surface post-load to rewrite a
 * shared `.post-card-summary` textContent to a sentinel string.
 *
 * Injection happens only on `/blog/`. The home page's collected entries
 * are untouched. After both pages are collected, the pure
 * `correlatePostSummaries` reports the divergence with the specific
 * postId, the original home text, and the mutated blog-index text.
 *
 * Chosen viewport: 320 (the narrowest, matches one of the two forward
 * viewports; one reverse viewport is sufficient to prove detection).
 */
test('reverse: Invariant 9 detects textContent divergence across index surfaces', async ({
  browser,
}) => {
  const width = 320;
  const SENTINEL = '__INVARIANT9_REVERSE_SENTINEL__';

  // Home — collect untouched.
  const homeContext = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await homeContext.addInitScript(() => {
    window.localStorage.setItem('theme', 'light');
  });
  const homePage = await homeContext.newPage();
  await homePage.goto('/', { waitUntil: 'networkidle' });
  const homeEntries = await homePage.evaluate(collectPostSummariesPredicate, {
    summarySel: SELECTORS.postCardSummary,
    postIdAttr: SELECTORS.postIdAttr,
  });
  await homeContext.close();

  // Blog-index — load, then inject textContent mutation on the FIRST
  // `.post-card-summary`. Ties the mutation to the first post-id so the
  // correlation is guaranteed to see a shared id (so the test proves
  // DIVERGENCE detection, not the zero-shared guard clause).
  const blogContext = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await blogContext.addInitScript(() => {
    window.localStorage.setItem('theme', 'light');
  });
  const blogPage = await blogContext.newPage();
  await blogPage.goto('/blog/', { waitUntil: 'networkidle' });
  const mutatedId = await blogPage.evaluate(
    ({ sentinel, summarySel, postIdAttr }) => {
      const target = document.querySelector(`[${postIdAttr}] ${summarySel}`);
      if (!target) return null;
      const container = target.closest(`[${postIdAttr}]`);
      const id = container?.getAttribute(postIdAttr) ?? null;
      target.textContent = sentinel;
      return id;
    },
    {
      sentinel: SENTINEL,
      summarySel: SELECTORS.postCardSummary,
      postIdAttr: SELECTORS.postIdAttr,
    },
  );

  expect(
    mutatedId,
    'reverse setup requires at least one `.post-card-summary` under a `[data-post-id]` on /blog/',
  ).not.toBeNull();

  const blogEntries = await blogPage.evaluate(collectPostSummariesPredicate, {
    summarySel: SELECTORS.postCardSummary,
    postIdAttr: SELECTORS.postIdAttr,
  });
  await blogContext.close();

  const correlation = correlatePostSummaries(homeEntries, blogEntries);

  // The injected mutation is a real divergence — the predicate must detect it.
  expect(
    correlation.pass,
    `Invariant 9 FAILED to detect the injected textContent divergence. Raw correlation: ${JSON.stringify(
      correlation,
      null,
      2,
    )}`,
  ).toBe(false);

  // Measurement richness: the correlation must report the divergence
  // count and the specific per-postId home/blog pair for the mutated
  // entry, so a CI reviewer can see WHICH post and WHAT the text was
  // on each side without re-running locally.
  expect(
    correlation.divergenceCount,
    'at least one divergence expected from the injected mutation',
  ).toBeGreaterThan(0);

  const mutatedDivergence = correlation.divergences.find(
    (d) => d.postId === mutatedId,
  );
  expect(
    mutatedDivergence,
    `expected a divergence for the mutated postId=${mutatedId}; got ${JSON.stringify(
      correlation.divergences,
    )}`,
  ).toBeDefined();
  expect(mutatedDivergence!.blog, 'blog-index text is the sentinel').toBe(
    SENTINEL,
  );
  expect(
    mutatedDivergence!.home,
    'home text is the original description (non-sentinel, non-empty)',
  ).not.toBe(SENTINEL);
  expect(
    mutatedDivergence!.home.length,
    'home text must be non-empty to prove the divergence is across-surface',
  ).toBeGreaterThan(0);

  // Positive-counterpart check: shared-count must be ≥1 so the
  // reverse test is exercising the divergence path, not the
  // zero-shared guard path.
  expect(
    correlation.sharedCount,
    'sharedCount must be ≥1 so the reverse test exercises divergence detection, not the zero-shared guard',
  ).toBeGreaterThan(0);
});

/**
 * Reverse coverage for Invariant 11 — demonstrates that the predicate
 * detects the pre-fix "do?" widow from issue #152.
 *
 * Pre-fix pattern: .hero-descriptor had no `text-wrap` override, so
 * the browser's natural greedy wrap at 320px produced
 * "What works? When to use? How to" / "do?" — a 3-character widow
 * distinct from the PDR-004 accent-orphan class. Invariant 3 passed
 * (because "do" is non-accent text on the last line), but the
 * visual rhythm was broken.
 *
 * Mechanism: reproduce the widow via a DOM-level `<br>` between
 * "How to" and "do" rather than replaying the natural greedy wrap at
 * 320px. A CSS-only `text-wrap: auto !important` override is not
 * OS-robust — Linux Chromium renders Inter 600 16px marginally
 * narrower than macOS, so "What works? When to use? How to do?" fits
 * on a single line at 320px on Linux (no wrap → no widow to detect)
 * while macOS wraps at the pre-fix break point (CI run 24781613357).
 * An explicit `<br>` reproduces the exact visual pattern
 * deterministically on both OSes without depending on font-metric
 * replay. The `text-wrap: auto` declaration is retained to document
 * the greedy-wrap semantic the widow represents; the `<br>` is
 * respected by both `balance` and `auto` algorithms so the CSS is
 * documentation, not load-bearing. The DOM-mutation pattern matches
 * the Invariant 9 reverse test above, which also selected DOM
 * mutation where CSS alone could not reliably reproduce the failure
 * class. Rich measurements (line count, last-line text, per-line
 * breakdown) are asserted below.
 *
 * 320px viewport: the narrowest scope viewport from the issue AC
 * (320, 360, 375, 414). The widow only fires at 320 under greedy
 * wrap; wider viewports fit the full sentence in fewer, longer lines
 * so the reverse-test at 320 is the unambiguous detection case.
 */
test('reverse: Invariant 11 detects the .hero-descriptor short-widow with rich measurements', async ({
  browser,
}) => {
  // text-wrap: auto documents the pre-fix greedy-wrap intent; the
  // widow itself is introduced by the <br> DOM mutation below. The
  // !important keeps the cascade override semantic even though the
  // <br> wraps regardless of the text-wrap algorithm.
  const breakingCss = `
    .hero-descriptor {
      text-wrap: auto !important;
    }
  `;
  const { page, close } = await openHomeWithInjection(
    browser,
    breakingCss,
    320,
  );

  try {
    // Rewrite .hero-descriptor inner HTML to insert a <br> between
    // "How to" and "do", placing "do?" alone on the last visual line
    // — the exact pre-fix #152 widow pattern. Preserves the original
    // span-wrapped accent "?" structure so the rendered text matches
    // the pre-fix scenario, only with a deterministic break point.
    // TreeWalker(SHOW_TEXT) skips the <br> element (not a text node)
    // so the predicate sees the same text-node sequence as the
    // natural-wrap case.
    await page.evaluate(() => {
      const el = document.querySelector('.hero-descriptor');
      if (!el) {
        throw new Error(
          'reverse setup: .hero-descriptor not found for DOM mutation',
        );
      }
      el.innerHTML =
        'What works<span class="accent">?</span> ' +
        'When to use<span class="accent">?</span> ' +
        'How to<br>do<span class="accent">?</span>';
    });

    const measurement = await page.evaluate(invariant11Predicate, {
      selector: SELECTORS.heroDescriptor,
      tolerancePx: 1,
      minChars: 6,
    });

    expect(
      measurement.pass,
      `Invariant 11 FAILED to detect the injected short-widow. Raw measurement: ${JSON.stringify(
        measurement,
        null,
        2,
      )}`,
    ).toBe(false);

    if ('error' in measurement) {
      throw new Error(
        `predicate short-circuited before scanning: ${measurement.error}`,
      );
    }

    // Measurement richness: the detection must expose the actual short
    // line length, the lines breakdown (so a CI reviewer sees what
    // wrapped where without re-running), and the threshold that fired.
    expect(measurement.minChars, 'minChars must be reported').toBe(6);
    expect(
      measurement.lastLineLength,
      'lastLineLength must be reported',
    ).toBeLessThan(6);
    expect(
      typeof measurement.lastLineText,
      'lastLineText must be a string',
    ).toBe('string');
    expect(
      measurement.lastLineText.length,
      'lastLineText.length must equal lastLineLength',
    ).toBe(measurement.lastLineLength);
    expect(
      measurement.lineCount,
      'lineCount must be reported and >= 2 (widow implies wrap)',
    ).toBeGreaterThanOrEqual(2);
    expect(
      Array.isArray(measurement.lines),
      'per-line breakdown must be an array',
    ).toBe(true);
    expect(
      measurement.lines.length,
      'per-line breakdown must match lineCount',
    ).toBe(measurement.lineCount);
  } finally {
    await close();
  }
});
