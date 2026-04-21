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
