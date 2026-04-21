/**
 * Shared selector constants for the PDR-007 QA-10 audit tooling (Phase 1).
 *
 * Consumed by:
 *   - tests/audit/invariants.spec.ts (QA-10.3) — boolean geometric predicates
 *     on DOM/CSSOM state at a fixed set of viewports.
 *   - tests/audit/invariants.reverse.spec.ts (QA-10.3) — demonstrates that
 *     a deliberately broken fixture produces a measurement-rich failure.
 *   - Future QA-10.4 DOM cross-sections spec — verified per AC to reuse the
 *     same selector constants.
 *
 * Centralizing the literals here means a future Nav/hero refactor only
 * needs to update ONE file; the invariant and cross-section suites stay
 * in lockstep with the source tree.
 *
 * Each constant is verified against the current component source:
 *   - .site-nav, .wordmark, .wordmark-text, .pillar-links, .pillar-link,
 *     .nav-actions — src/components/Nav.astro
 *   - .hero-tagline + .hero-tagline .accent — src/pages/index.astro
 */

export const SELECTORS = {
  siteNav: '.site-nav',
  wordmark: '.wordmark',
  wordmarkText: '.wordmark-text',
  pillarLinks: '.pillar-links',
  pillarLink: '.pillar-link',
  navActions: '.nav-actions',
  heroTagline: '.hero-tagline',
  heroTaglineAccent: '.hero-tagline .accent',
} as const;

export type SelectorKey = keyof typeof SELECTORS;
