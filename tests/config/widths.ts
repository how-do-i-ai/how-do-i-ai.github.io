/**
 * Canonical viewport widths (CSS px) for the QA-09 visual-regression gate
 * and the QA-10.2 / QA-10.6 audit gates that share the same width surface.
 *
 * Source of truth. Consumed by:
 *   - tests/visual/screenshots.spec.ts (QA-09 pixel-diff baselines)
 *   - scripts/extract-widths.mjs      (QA-10.2 critical-widths audit)
 *   - tests/visual/rendering-modes.spec.ts (QA-10.6, when Phase 3 lands)
 *
 * Widths span the PDR-006 mobile-through-desktop coverage, including the
 * 480-767 collapse band (the range where Pattern A's single-row nav is
 * emergent rather than enforced). PDR-006 constraint 6 made this band
 * required coverage after the PR #99 B1 regression revealed untested
 * assumptions about 480px single-row behavior.
 *
 * QA-10.2 semantics: QA-09 MAY be a superset of thresholds the CSS
 * actually uses. Widths here that are absent from `dist/_astro/*.css`
 * media queries (e.g., 500/600/700, added for emergent-layout coverage)
 * are NOT audited against the CSS-derived set — they exist for visual-
 * regression signal. See PDR-007 § Decision Phase 1 and the 2026-04-21
 * refinement on #122 for the authoritative one-directional rule.
 */
export const WIDTHS = [
  320, 375, 414, 480, 500, 600, 640, 700, 767, 768, 1024, 1440,
] as const;

export type Width = (typeof WIDTHS)[number];
