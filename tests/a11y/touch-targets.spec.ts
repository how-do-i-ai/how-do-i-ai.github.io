import { test, expect } from '@playwright/test';

/**
 * QA-07 touch-target audit.
 *
 * REQ-A11Y-05 + REQ-MOB-03 + WCAG 2.5.5: every interactive element at
 * <768px viewports must meet the 44×44px hit area. 768 is included as
 * a belt-and-suspenders boundary check per QA-07 METER — real bugs
 * surfaced there during Wave 3 (see `.github/workflows/ci.yml` for
 * historical context on how this gate was wired).
 *
 * Viewport selection lives in `playwright.config.ts` as separate
 * projects (`touch-targets-320` … `touch-targets-768`); this spec
 * reads the viewport from the project rather than iterating in-code.
 */
const MIN_TARGET = 44;

/** Issue #95 AC: load /, /blog/, at least one /blog/[slug]/. */
const PAGES: ReadonlyArray<{ label: string; path: string }> = [
  { label: 'home', path: '/' },
  { label: 'blog-index', path: '/blog/' },
  { label: 'blog-post', path: '/blog/sample-post/' },
];

/** Issue #95 AC: <a>, <button>, <details summary>, <input>. */
const INTERACTIVE_SELECTOR = 'a, button, details > summary, input';

type Violation = {
  tag: string;
  id: string;
  className: string;
  role: string | null;
  text: string;
  href: string | null;
  width: number;
  height: number;
  lineHeight: number;
  effectiveHeight: number;
  display: string;
  location: { x: number; y: number };
};

for (const { label, path } of PAGES) {
  test(`touch targets: ${label} (${path})`, async ({ page }, testInfo) => {
    await page.goto(path, { waitUntil: 'networkidle' });

    const viewport = page.viewportSize();
    expect(viewport, 'viewport must be set').not.toBeNull();

    const violations: Violation[] = await page.evaluate(
      ({ selector, MIN }) => {
        function round(n: number): number {
          return Math.round(n * 100) / 100;
        }

        const results: Violation[] = [];
        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(selector),
        );

        for (const el of elements) {
          const style = window.getComputedStyle(el);

          // Hidden via CSS — not part of the interactive surface.
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            parseFloat(style.opacity) === 0
          ) {
            continue;
          }

          // hidden attribute or type=hidden input.
          if (el.hasAttribute('hidden')) continue;
          if (el instanceof HTMLInputElement && el.type === 'hidden') continue;

          const rect = el.getBoundingClientRect();

          // Zero-dimension elements are typically sr-only / visually-hidden
          // (e.g. skip links). They are a11y-compliant as-is and expand to
          // full size on focus; exclude from the layout-based audit.
          if (rect.width === 0 || rect.height === 0) continue;

          // Off-screen elements positioned outside the viewport are also
          // typically sr-only patterns (left: -9999px). Skip.
          if (
            rect.right <= 0 ||
            rect.bottom <= 0 ||
            rect.left >= window.innerWidth
          ) {
            continue;
          }

          // For inline elements, the hit area extends with line-height
          // (REQ-MOB-03: "either the link itself is ≥44px line-height or
          // surrounding padding/margin produces a ≥44×44px effective hit area").
          const lineHeightRaw = parseFloat(style.lineHeight);
          const lineHeight = Number.isFinite(lineHeightRaw)
            ? lineHeightRaw
            : rect.height;
          const isInline = style.display === 'inline';
          const effectiveHeight = isInline
            ? Math.max(rect.height, lineHeight)
            : rect.height;

          if (rect.width < MIN || effectiveHeight < MIN) {
            const anchor = el instanceof HTMLAnchorElement ? el.href : null;
            results.push({
              tag: el.tagName.toLowerCase(),
              id: el.id,
              className:
                typeof el.className === 'string' ? el.className : '',
              role: el.getAttribute('role'),
              text: (el.textContent ?? '').trim().slice(0, 80),
              href: anchor,
              width: round(rect.width),
              height: round(rect.height),
              lineHeight: round(lineHeight),
              effectiveHeight: round(effectiveHeight),
              display: style.display,
              location: { x: round(rect.left), y: round(rect.top) },
            });
          }
        }

        return results;
      },
      { selector: INTERACTIVE_SELECTOR, MIN: MIN_TARGET },
    );

    // Attach JSON report for easier debugging when a violation is found.
    if (violations.length > 0) {
      await testInfo.attach('touch-target-violations.json', {
        body: JSON.stringify(violations, null, 2),
        contentType: 'application/json',
      });
    }

    expect(
      violations,
      `Found ${violations.length} under-sized interactive element(s) at ` +
        `${viewport?.width}×${viewport?.height} on ${path}. ` +
        `Minimum hit area: ${MIN_TARGET}×${MIN_TARGET}px. ` +
        `Details:\n${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });
}
