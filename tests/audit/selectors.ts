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
 *   - .hero + .hero-tagline + .hero-tagline .accent — src/pages/index.astro
 *   - .hero-descriptor — src/pages/index.astro (Invariant 11)
 *   - .latest-section + [data-eyebrow] — src/pages/index.astro (Invariant 6)
 *   - [data-card-content-root] — src/components/PostCardFeatured.astro
 *     (Invariant 6; marks the first element inside the card's internal
 *     padding, which equals the card's content-edge origin)
 *   - .post-card-summary + [data-post-id] — src/components/PostCard.astro
 *     and src/components/PostCardFeatured.astro (Invariant 9; marks the
 *     summary element and its owning post so cross-surface text identity
 *     can be asserted without coupling to the surface-specific class
 *     names .post-card-description / .post-card-featured-description)
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
  // added for Invariant 6 — issue #147 (PDR-007 audit discovery case).
  // Scoped under .latest-section so the eyebrow/card-content probes
  // cannot collide with future components that use the same attributes.
  latestSection: '.latest-section',
  latestEyebrow: '[data-eyebrow]',
  latestCardContentRoot: '[data-card-content-root]',
  // added for Invariant 7 — issue #148. The hero section's bounding rect
  // is the reference for cross-block horizontal-alignment consistency.
  heroSection: '.hero',
  // added for Invariant 9 — issue #150 (post-card summary cross-surface
  // text identity). The surface-agnostic .post-card-summary class is
  // additive to the existing surface-specific classes so neither
  // QA-09 baselines nor existing CSS need to change.
  postCardSummary: '.post-card-summary',
  postIdAttr: 'data-post-id',
  // added for Invariant 11 — issue #152 (non-accent short-widow class).
  // The .hero-descriptor is the hero's meta line ("What works? When to
  // use? How to do?") — the issue body refers to it conceptually as the
  // "hero meta line" and uses `.hero-meta` as a placeholder; the actual
  // class in src/pages/index.astro is .hero-descriptor.
  heroDescriptor: '.hero-descriptor',
  // added for Invariant 8 — issue #149. The footer stacked-layout rule
  // (max-width: 639px) places the tagline and the About link on
  // consecutive rows; the invariant asserts their bounding rects share a
  // left coordinate. Scoped under `.site-footer` so the selectors cannot
  // collide with a future nav element reusing the same class names.
  siteFooter: '.site-footer',
  footerTagline: '.site-footer .tagline',
  footerAboutLink: '.site-footer .footer-link',
  // added for Invariant 10 — issue #151. The footer's nine-icon social
  // + RSS row can wrap into multiple rows at narrow/mid viewports; the
  // invariant asserts no single-icon widow on the final row. The
  // selector targets `.channel-link` anchors directly (not the `<li>`
  // wrappers) so the widow-prevention `.wrap-spacer` helper `<li>` —
  // which carries no `.channel-link` class and contributes no visible
  // content — is naturally excluded from the row grouping.
  channelLink: '.site-footer .channel-link',
} as const;

export type SelectorKey = keyof typeof SELECTORS;
