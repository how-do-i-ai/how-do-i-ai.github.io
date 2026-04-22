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

export type PostSummaryEntry = {
  postId: string;
  text: string;
  selector: string;
};

/**
 * Invariant 9 per-page predicate — collects every `.post-card-summary`
 * textContent keyed by its owning `[data-post-id]` root.
 *
 * Browser-side (runs in page.evaluate). Returns an array rather than a
 * Map because page.evaluate serializes the return value via structured
 * clone and Map instances survive but are clumsier in the test-side
 * correlation than an array is. The array is grouped into a Map
 * spec-side by `correlatePostSummaries`.
 *
 * Duplicate post-ids on the same page (e.g., a post that appears in
 * both the home LATEST section and the home .recent-grid) are kept as
 * separate entries so the downstream correlation can detect
 * within-surface divergence as well as cross-surface divergence. The
 * selector field names the specific DOM node so a failure message can
 * cite the exact location.
 */
export const collectPostSummariesPredicate = ({
  summarySel,
  postIdAttr,
}: {
  summarySel: string;
  postIdAttr: string;
}): PostSummaryEntry[] => {
  const entries: PostSummaryEntry[] = [];
  const containers = Array.from(document.querySelectorAll(`[${postIdAttr}]`));
  for (const container of containers) {
    const id = container.getAttribute(postIdAttr);
    if (!id) continue;
    const summaries = Array.from(container.querySelectorAll(summarySel));
    for (const summary of summaries) {
      entries.push({
        postId: id,
        text: (summary.textContent ?? '').trim(),
        selector: `[${postIdAttr}="${id}"] ${summarySel}`,
      });
    }
  }
  return entries;
};

export type PostSummaryCorrelation = {
  pass: boolean;
  error?: string;
  homeCount: number;
  blogCount: number;
  sharedCount: number;
  divergenceCount: number;
  divergences: Array<{
    postId: string;
    home: string;
    blog: string;
    homeLen: number;
    blogLen: number;
  }>;
};

/**
 * Invariant 9 spec-side correlation — pure function.
 *
 * Takes the home + blog-index summary arrays produced by
 * `collectPostSummariesPredicate` and asserts:
 *   1. At least one post-id appears on BOTH surfaces (otherwise the
 *      invariant is vacuously true and would mask a "no cards rendered"
 *      regression — treat zero-shared as a failure with a clear error).
 *   2. For every post-id that appears on BOTH surfaces, the trimmed
 *      textContent matches byte-for-byte across surfaces.
 *
 * Within-surface duplicates (same post rendered twice on the same page)
 * are flattened via the first-seen text per post-id on each surface. A
 * within-surface divergence class is out of scope for Invariant 9 —
 * it would be a distinct invariant with different failure semantics.
 *
 * Pure function (no DOM access) so the forward and reverse specs can
 * both call it with their own collected arrays. Shape is structured-
 * clone-safe for Playwright's page.evaluate contract.
 */
export function correlatePostSummaries(
  home: PostSummaryEntry[],
  blog: PostSummaryEntry[],
): PostSummaryCorrelation {
  const firstById = (entries: PostSummaryEntry[]): Map<string, string> => {
    const out = new Map<string, string>();
    for (const e of entries) {
      if (!out.has(e.postId)) out.set(e.postId, e.text);
    }
    return out;
  };
  const homeById = firstById(home);
  const blogById = firstById(blog);
  const sharedIds = Array.from(homeById.keys()).filter((id) =>
    blogById.has(id),
  );
  if (sharedIds.length === 0) {
    return {
      pass: false,
      error:
        'no post-id appears on both home and blog-index — either rendering failed or no published posts exist; cannot assert cross-surface identity',
      homeCount: home.length,
      blogCount: blog.length,
      sharedCount: 0,
      divergenceCount: 0,
      divergences: [],
    };
  }
  const divergences = sharedIds
    .map((id) => {
      const h = homeById.get(id) ?? '';
      const b = blogById.get(id) ?? '';
      return {
        postId: id,
        home: h,
        blog: b,
        homeLen: h.length,
        blogLen: b.length,
      };
    })
    .filter((d) => d.home !== d.blog);
  return {
    pass: divergences.length === 0,
    homeCount: home.length,
    blogCount: blog.length,
    sharedCount: sharedIds.length,
    divergenceCount: divergences.length,
    divergences,
  };
}
