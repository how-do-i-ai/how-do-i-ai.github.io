/**
 * Shared browser-side helpers for QA-10.3 invariant specs.
 *
 * The Invariant 1 predicate lives HERE so the forward spec
 * (invariants.spec.ts) and the reverse spec (invariants.reverse.spec.ts) run
 * the exact same code. If they drifted, the reverse spec would vouch for a
 * predicate that isn't the one actually gating CI — the reverse test's
 * evidentiary value depends on this identity.
 *
 * The functions exported here are passed to `page.evaluate`, which
 * serializes them via `toString()` and executes in the browser. They must
 * therefore be SELF-CONTAINED — no closures, no imports, only references
 * resolvable in the browser global scope (document, getComputedStyle, etc.).
 */

export type Invariant1Measurement =
  | { pass: false; error: string }
  | {
      pass: boolean;
      markWeight: number;
      comparedCount: number;
      violations: Array<{ selector: string; weight: number; text: string }>;
    };

export const invariant1Predicate = ({
  navSel,
  markSel,
}: {
  navSel: string;
  markSel: string;
}): Invariant1Measurement => {
  function describeElement(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const raw = typeof el.className === 'string' ? el.className.trim() : '';
    const cls = raw ? '.' + raw.split(/\s+/).join('.') : '';
    return `${tag}${cls}`;
  }
  const nav = document.querySelector(navSel);
  if (!nav) return { pass: false, error: `nav not found: ${navSel}` };
  const mark = nav.querySelector(markSel);
  if (!mark) return { pass: false, error: `wordmark not found: ${markSel}` };
  const markWeight = Number(getComputedStyle(mark).fontWeight);
  const others = Array.from(nav.querySelectorAll('*')).filter(
    (el) => !!el.textContent?.trim() && !mark.contains(el),
  );
  const violations = others
    .map((el) => ({
      selector: describeElement(el),
      weight: Number(getComputedStyle(el).fontWeight),
      text: (el.textContent ?? '').trim().slice(0, 48),
    }))
    .filter((row) => row.weight > markWeight);
  return {
    pass: violations.length === 0,
    markWeight,
    comparedCount: others.length,
    violations,
  };
};

export type Invariant6Measurement =
  | { pass: false; error: string }
  | {
      pass: boolean;
      eyebrowLeft: number;
      cardContentLeft: number;
      delta: number;
      tolerancePx: number;
      toleranceOk: boolean;
      minLeftPx: number;
      minLeftOk: boolean;
    };

/**
 * Invariant 6 predicate — `.latest-section` eyebrow alignment.
 *
 * Two boolean conditions, AND-combined:
 *   1. |eyebrow.left - cardContentRoot.left| ≤ tolerancePx — the eyebrow
 *      label tracks the card's content origin, not the card's outer edge.
 *   2. eyebrow.left ≥ minLeftPx — the eyebrow never encroaches the
 *      viewport-left gutter. Guards the mobile edge-bleed class.
 *
 * Both bounding rects are read via `getBoundingClientRect()`, which
 * returns CSS-pixel coordinates relative to the viewport. The
 * measurement is a two-number geometric read + two boolean tests; no
 * distance-to-pixel conversion, no OS-dependent rasterization.
 *
 * tolerancePx absorbs sub-pixel font-metric drift between macOS and
 * Linux Chromium (see tests/visual/README.md § "Baselines must be
 * Linux-generated"). 2px is the AC-specified tolerance in issue #147.
 */
export const invariant6Predicate = ({
  sectionSel,
  eyebrowSel,
  cardContentSel,
  tolerancePx,
  minLeftPx,
}: {
  sectionSel: string;
  eyebrowSel: string;
  cardContentSel: string;
  tolerancePx: number;
  minLeftPx: number;
}): Invariant6Measurement => {
  const section = document.querySelector(sectionSel);
  if (!section)
    return { pass: false, error: `latest-section not found: ${sectionSel}` };
  const eyebrow = section.querySelector(eyebrowSel);
  if (!eyebrow)
    return {
      pass: false,
      error: `eyebrow not found under section: ${eyebrowSel}`,
    };
  const cardContent = section.querySelector(cardContentSel);
  if (!cardContent)
    return {
      pass: false,
      error: `card content root not found under section: ${cardContentSel}`,
    };
  const eRect = eyebrow.getBoundingClientRect();
  const cRect = cardContent.getBoundingClientRect();
  const delta = Math.abs(eRect.left - cRect.left);
  const toleranceOk = delta <= tolerancePx;
  const minLeftOk = eRect.left >= minLeftPx;
  return {
    pass: toleranceOk && minLeftOk,
    eyebrowLeft: eRect.left,
    cardContentLeft: cRect.left,
    delta,
    tolerancePx,
    toleranceOk,
    minLeftPx,
    minLeftOk,
  };
};

export type Invariant7Measurement =
  | { pass: false; error: string }
  | {
      pass: boolean;
      heroLeft: number;
      heroWidth: number;
      heroCenterX: number;
      latestLeft: number;
      latestWidth: number;
      latestCenterX: number;
      delta: number;
      tolerancePx: number;
    };

/**
 * Invariant 7 predicate — home-page content-block alignment consistency.
 *
 * The `.hero` section and the `.latest-section` section share one
 * horizontal alignment axis: at every desktop viewport the two section
 * bounding rects have matching center-x (within tolerancePx). Guards
 * against the "three blocks, three axes" class reported in issue #148
 * where the hero filled the viewport and the latest section sat in a
 * 48rem centered container, producing visually-divergent container
 * widths even though both were mathematically centered.
 *
 * Predicate:
 *   |heroRect.left + heroRect.width/2 - latestRect.left - latestRect.width/2|
 *     ≤ tolerancePx
 *
 * Both bounding rects are read via `getBoundingClientRect()` — CSS-pixel
 * viewport coordinates. The measurement is a four-number geometric read
 * + one boolean; no distance-to-pixel conversion, no OS-dependent
 * rasterization. tolerancePx absorbs sub-pixel drift (4px is the
 * AC-specified tolerance in issue #148).
 */
export const invariant7Predicate = ({
  heroSel,
  latestSel,
  tolerancePx,
}: {
  heroSel: string;
  latestSel: string;
  tolerancePx: number;
}): Invariant7Measurement => {
  const hero = document.querySelector(heroSel);
  if (!hero) return { pass: false, error: `hero not found: ${heroSel}` };
  const latest = document.querySelector(latestSel);
  if (!latest)
    return { pass: false, error: `latest-section not found: ${latestSel}` };
  const hRect = hero.getBoundingClientRect();
  const lRect = latest.getBoundingClientRect();
  const heroCenterX = hRect.left + hRect.width / 2;
  const latestCenterX = lRect.left + lRect.width / 2;
  const delta = Math.abs(heroCenterX - latestCenterX);
  return {
    pass: delta <= tolerancePx,
    heroLeft: hRect.left,
    heroWidth: hRect.width,
    heroCenterX,
    latestLeft: lRect.left,
    latestWidth: lRect.width,
    latestCenterX,
    delta,
    tolerancePx,
  };
};
