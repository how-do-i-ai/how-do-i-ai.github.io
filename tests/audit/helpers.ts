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

export type Invariant11Measurement =
  | { pass: false; error: string }
  | {
      pass: boolean;
      minChars: number;
      lineCount: number;
      lastLineText: string;
      lastLineLength: number;
      lines: Array<{ top: number; text: string }>;
    };

/**
 * Invariant 11 predicate — `.hero-descriptor` last-line has ≥ minChars
 * visible characters.
 *
 * Issue #152 reported a 3-character widow "do?" on line 2 at 320px,
 * produced by the natural greedy wrap. The fix applies `text-wrap:
 * balance` in index.astro; this predicate gates the outcome.
 *
 * Complements Invariant 3 (.hero-tagline accent-orphan). Invariant 3
 * tests whether the last line contains at least one non-accent
 * character — binary membership. Invariant 11 tests the COUNT of
 * characters on the last line — a distinct class the #152 widow
 * cleared Invariant 3 with ("do" is non-accent) but still visually
 * orphaned.
 *
 * Character-level grouping (why not child-node grouping like Invariant 3):
 * Invariant 3 asks "is any non-accent child on the last line?" — the
 * child is the unit of measurement, so child-level rects suffice.
 * Invariant 11 asks "how long is the last line?" — characters are the
 * unit, and a single child's textContent may split across lines, so
 * child-level rects over-count. Walking each character with a length-1
 * Range yields per-character tops; grouping by top (tolerance absorbs
 * sub-pixel drift per `audit-tooling-design.md § QA-10.3 Linux-parity
 * approach`) gives the exact characters visible on each visual line.
 *
 * Collapsed rects (zero-width whitespace at line-break positions) are
 * discarded; the count is of characters that actually render.
 */
export const invariant11Predicate = ({
  selector,
  tolerancePx,
  minChars,
}: {
  selector: string;
  tolerancePx: number;
  minChars: number;
}): Invariant11Measurement => {
  const el = document.querySelector(selector);
  if (!el) return { pass: false, error: `not found: ${selector}` };

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const entries: { char: string; top: number }[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? '';
    for (let i = 0; i < text.length; i++) {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rects = range.getClientRects();
      for (const rect of Array.from(rects)) {
        // Skip collapsed whitespace rects — they carry no visible line
        // membership (typical at soft-wrap break points).
        if (rect.width < 0.1 || rect.height < 0.1) continue;
        entries.push({ char: text[i], top: rect.top });
      }
    }
  }

  if (entries.length === 0) {
    return { pass: false, error: 'no measurable characters' };
  }

  // Group by top-coordinate with 1px tolerance (matches Invariant 3).
  const sorted = [...entries].sort((a, b) => a.top - b.top);
  const lines: { top: number; chars: string[] }[] = [];
  for (const entry of sorted) {
    const existing = lines.find(
      (l) => Math.abs(l.top - entry.top) <= tolerancePx,
    );
    if (existing) existing.chars.push(entry.char);
    else lines.push({ top: entry.top, chars: [entry.char] });
  }

  const lastLine = lines[lines.length - 1];
  const lastLineText = lastLine.chars.join('');

  return {
    pass: lastLineText.length >= minChars,
    minChars,
    lineCount: lines.length,
    lastLineText,
    lastLineLength: lastLineText.length,
    lines: lines.map((l) => ({ top: l.top, text: l.chars.join('') })),
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

export type Invariant8Measurement =
  | { pass: false; error: string }
  | {
      pass: boolean;
      taglineLeft: number;
      aboutLinkLeft: number;
      delta: number;
      tolerancePx: number;
    };

/**
 * Invariant 8 predicate — footer stacked-layout column alignment.
 *
 * Issue #149. The stacked footer layout (≤600px viewport) places the
 * tagline `<p>` and the About link on consecutive rows at the left edge
 * of the footer's content column. The design intent is that the two
 * elements share a left coordinate; a drift of the link box to the right
 * of the tagline (e.g., a future refactor that adds margin-inline-start
 * to the link) would visibly break that shared-column rhythm.
 *
 * Predicate: |taglineRect.left - aboutLinkRect.left| ≤ tolerancePx.
 *
 * Scope note: the base `.footer-link` rule uses `justify-content: center`
 * to center text within the min-width touch target. At ≤639px the
 * stacked-layout override in Footer.astro switches it to `flex-start` so
 * the rendered "About" text aligns with the tagline's first character
 * (the user-visible drift reported in #149). Element bounding rects are
 * unaffected by `justify-content` — both tagline and link share left=24
 * before and after the fix — so this invariant is a FORWARD-COMPAT guard
 * against a future element-shift regression class, not a detection of
 * the rendered-text drift. The rendered-text shift is gated by QA-09
 * pixel baselines (regenerated as part of the #149 PR).
 *
 * tolerancePx absorbs sub-pixel font-metric drift between macOS and
 * Linux Chromium (see tests/visual/README.md § "Baselines must be
 * Linux-generated"). 1px is the AC-specified tolerance in issue #149.
 */
export const invariant8Predicate = ({
  footerSel,
  taglineSel,
  aboutLinkSel,
  tolerancePx,
}: {
  footerSel: string;
  taglineSel: string;
  aboutLinkSel: string;
  tolerancePx: number;
}): Invariant8Measurement => {
  const footer = document.querySelector(footerSel);
  if (!footer) return { pass: false, error: `footer not found: ${footerSel}` };
  const tagline = document.querySelector(taglineSel);
  if (!tagline)
    return {
      pass: false,
      error: `tagline not found under footer: ${taglineSel}`,
    };
  const link = document.querySelector(aboutLinkSel);
  if (!link)
    return {
      pass: false,
      error: `about link not found under footer: ${aboutLinkSel}`,
    };
  const tRect = tagline.getBoundingClientRect();
  const lRect = link.getBoundingClientRect();
  const delta = Math.abs(tRect.left - lRect.left);
  return {
    pass: delta <= tolerancePx,
    taglineLeft: tRect.left,
    aboutLinkLeft: lRect.left,
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
