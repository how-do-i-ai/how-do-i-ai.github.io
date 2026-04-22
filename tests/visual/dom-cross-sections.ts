/**
 * QA-10.4 DOM cross-section capture + structured diff.
 *
 * Source of truth: PDR-007 § Decision Phase 2; audit-tooling-design.md § 2.4.
 * Issue: how-do-i-ai/how-do-i-ai.github.io#132.
 *
 * Attaches a JSON sidecar to each QA-09 PNG baseline recording the computed
 * styles of a curated selector set (`tests/audit/selectors.ts`, authored in
 * QA-10.3 #121). A token shift that is too small to exceed the QA-09 pixel
 * tolerance — or that nudges a semantic property without any pixel impact —
 * still trips the sidecar comparison, making drift SEMANTICALLY inspectable
 * rather than visually inspectable.
 *
 * Captured properties (MVP set per issue AC): `color`, `backgroundColor`,
 * `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `padding`, `margin`,
 * `border`, `display`, `position`, `flexDirection`, `gap`. Excluded:
 * `transform` (animation-dependent), `opacity` (hover/focus-dependent),
 * layout geometry (covered by QA-09 pixel-diff).
 *
 * File I/O lives here — NOT in the spec — because the reverse spec
 * (`dom-cross-sections.reverse.spec.ts`) shares the capture + diff + format
 * logic. Without shared-module discipline the reverse test would vouch for
 * a diff mechanism that isn't the one gating CI.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Page } from '@playwright/test';

import { SELECTORS } from '../audit/selectors';

/**
 * MVP captured-property set. Ordered for sidecar stability — the serializer
 * walks this array so the on-disk JSON keys follow a fixed sequence.
 *
 * Known limitation — `border`: Chromium's `getComputedStyle(el).border`
 * shorthand returns `""` when the per-side longhands diverge (e.g. only
 * `border-bottom` is set on the element). ~8.5% of the Phase 2 baselines
 * (roughly: `.site-nav`, `.site-footer` containers) show `"border": ""`
 * for this reason. Drift in those specific elements' border state can go
 * undetected by the shorthand alone. The MVP set deliberately follows
 * the issue #132 AC literal list rather than capturing longhands; if
 * border drift detection becomes a gap in practice, a follow-up issue
 * should expand capture with `borderTopWidth`/`borderTopStyle`/
 * `borderTopColor` (and the other three sides) or `borderWidth`/
 * `borderStyle`/`borderColor`. Keeping the shorthand today preserves
 * the AC literal contract and the sidecar byte-stability it implies.
 */
export const CAPTURED_PROPERTIES = [
  'color',
  'backgroundColor',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'padding',
  'margin',
  'border',
  'display',
  'position',
  'flexDirection',
  'gap',
] as const;

export type CapturedProperty = (typeof CAPTURED_PROPERTIES)[number];

/**
 * Keys from SELECTORS that ARE CSS selectors. `postIdAttr = 'data-post-id'`
 * is an attribute NAME — QA-10.3 invariants compose it into selectors like
 * `[data-post-id="X"]`, but it is not a standalone selector and must not be
 * passed to `querySelectorAll`. Keeping the exclusion explicit (vs. a string
 * pattern guess) means future SELECTORS additions are opt-in to capture.
 */
const EXCLUDED_FROM_CAPTURE: ReadonlySet<keyof typeof SELECTORS> = new Set([
  'postIdAttr',
]);

export const CAPTURE_KEYS = (
  Object.keys(SELECTORS) as Array<keyof typeof SELECTORS>
).filter((key) => !EXCLUDED_FROM_CAPTURE.has(key));

/** Per-element snapshot: one entry per captured property. */
export type ElementCapture = Record<CapturedProperty, string>;

/**
 * Sidecar payload: selector key → ordered array of matched-element captures.
 * Document order is the stable ordering (same as `querySelectorAll`). Empty
 * array = selector did not match on this page (itself a meaningful baseline
 * signal — a selector that STARTS matching produces a diff).
 */
export type Sidecar = Record<string, ElementCapture[]>;

/**
 * Capture computed styles for every CAPTURE_KEY on the current page.
 *
 * Runs inside `page.evaluate()` — the callback is serialized and executed in
 * the browser, so it must be self-contained (no imports, no closures over
 * outer-scope variables). Arguments passed via the second `page.evaluate`
 * parameter.
 */
export async function captureComputedStyles(page: Page): Promise<Sidecar> {
  const selectorMap: Record<string, string> = {};
  for (const key of CAPTURE_KEYS) {
    selectorMap[key] = SELECTORS[key];
  }
  const properties: readonly string[] = CAPTURED_PROPERTIES;

  const raw = await page.evaluate(
    ({ selectors, props }) => {
      const result: Record<string, Array<Record<string, string>>> = {};
      for (const [key, selector] of Object.entries(selectors)) {
        const els = Array.from(document.querySelectorAll(selector));
        result[key] = els.map((el) => {
          const cs = getComputedStyle(el);
          const entry: Record<string, string> = {};
          for (const p of props) {
            // CSSStyleDeclaration is indexable by property name; cast to
            // Record in browser context because the TS dom lib types
            // restrict the index signature to well-known declarations.
            const value = (cs as unknown as Record<string, string>)[p];
            entry[p] = typeof value === 'string' ? value : '';
          }
          return entry;
        });
      }
      return result;
    },
    { selectors: selectorMap, props: properties },
  );
  // Browser-side typing is string/string because the serialized callback
  // cannot reference the CAPTURED_PROPERTIES union. The loop above already
  // populates every captured property, so the cast is safe.
  return raw as Sidecar;
}

/** A single property-level difference between expected and actual sidecars. */
export type DiffEntry = {
  selector: string;
  index: number;
  property: string;
  expected: string;
  actual: string;
};

const MISSING = '<not present>';

/**
 * Structural diff: walks both sidecars, emitting one DiffEntry per differing
 * property on any matched element. Order is stable — selector keys follow
 * the union of both sidecar key sets (baseline first, actual-only
 * selectors appended), then element index ascending, then property order
 * from CAPTURED_PROPERTIES.
 */
export function diffSidecars(expected: Sidecar, actual: Sidecar): DiffEntry[] {
  const diffs: DiffEntry[] = [];
  const keys = [
    ...Object.keys(expected),
    ...Object.keys(actual).filter((k) => !(k in expected)),
  ];

  for (const key of keys) {
    const exp = expected[key] ?? [];
    const act = actual[key] ?? [];
    const maxLen = Math.max(exp.length, act.length);

    for (let i = 0; i < maxLen; i++) {
      const e = exp[i];
      const a = act[i];

      if (!e && a) {
        for (const p of CAPTURED_PROPERTIES) {
          if (p in a) {
            diffs.push({
              selector: key,
              index: i,
              property: p,
              expected: MISSING,
              actual: a[p],
            });
          }
        }
        continue;
      }
      if (e && !a) {
        for (const p of CAPTURED_PROPERTIES) {
          if (p in e) {
            diffs.push({
              selector: key,
              index: i,
              property: p,
              expected: e[p],
              actual: MISSING,
            });
          }
        }
        continue;
      }
      if (!e || !a) continue;

      for (const p of CAPTURED_PROPERTIES) {
        const ev = e[p] ?? MISSING;
        const av = a[p] ?? MISSING;
        if (ev !== av) {
          diffs.push({
            selector: key,
            index: i,
            property: p,
            expected: ev,
            actual: av,
          });
        }
      }
    }
  }
  return diffs;
}

/**
 * Human-readable diff block — one line per DiffEntry, naming the selector,
 * element index (for multi-match selectors), property, and from → to values.
 * Used by both the capture spec (failure message) and the reverse spec
 * (assertion target).
 */
export function formatDiff(diffs: DiffEntry[]): string {
  if (diffs.length === 0) return '';
  return diffs
    .map(
      (d) =>
        `  ${d.selector}[${d.index}].${d.property}: ${d.expected} → ${d.actual}`,
    )
    .join('\n');
}

/**
 * Stable JSON serializer — sorts each element capture's property keys by
 * CAPTURED_PROPERTIES order so the on-disk file is byte-stable across runs.
 * Top-level selector keys are emitted in CAPTURE_KEYS order for the same
 * reason; the browser-side `captureComputedStyles` walks CAPTURE_KEYS in
 * order, but `JSON.stringify` preserves insertion order from an object
 * returned across `page.evaluate`, so the canonicalization here is defense
 * in depth.
 */
export function serializeSidecar(sidecar: Sidecar): string {
  const canonical: Record<string, ElementCapture[]> = {};
  for (const key of CAPTURE_KEYS) {
    if (key in sidecar) {
      const entries = sidecar[key] ?? [];
      canonical[key] = entries.map((entry) => {
        const sorted: Record<string, string> = {};
        for (const p of CAPTURED_PROPERTIES) {
          if (p in entry) sorted[p] = entry[p];
        }
        return sorted as ElementCapture;
      });
    }
  }
  // Include keys present in `sidecar` but not in CAPTURE_KEYS — defensive;
  // CAPTURE_KEYS is the authoritative source, but emitting unknown keys lets
  // the diff helper surface them rather than silently drop them.
  for (const key of Object.keys(sidecar)) {
    if (!(key in canonical)) canonical[key] = sidecar[key];
  }
  return JSON.stringify(canonical, null, 2) + '\n';
}

export function loadSidecar(path: string): Sidecar | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as Sidecar;
}

export function saveSidecar(path: string, sidecar: Sidecar): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeSidecar(sidecar));
}

/**
 * Resolve the sidecar path for a given QA-09 snapshot name. Mirrors the PNG
 * naming convention (`{name}-{width}-{mode}.png`) with a `.styles.json`
 * suffix so the sidecar lives beside its screenshot.
 */
export function sidecarFilename(
  pageName: string,
  width: number,
  mode: string,
): string {
  return `${pageName}-${width}-${mode}.styles.json`;
}

/**
 * The update-snapshot mode values Playwright 1.59.1 exposes via
 * `test.info().config.updateSnapshots`. Re-declared here (rather than
 * imported from @playwright/test's internal types) because the type surface
 * of the config object is not re-exported — using the same string union
 * keeps the capture helper self-contained.
 */
export type UpdateSnapshotsMode = 'all' | 'changed' | 'missing' | 'none';

export type SidecarAssertOutcome =
  | { kind: 'pass' }
  | { kind: 'wrote'; reason: 'missing' | 'updated' }
  | { kind: 'fail-missing'; path: string }
  | { kind: 'fail-diff'; diffs: DiffEntry[]; formatted: string };

/**
 * Compare + persist semantics mirror `toHaveScreenshot`:
 *   - missing baseline + mode !== 'none' → write, test passes.
 *   - missing baseline + mode === 'none' → fail (strict).
 *   - existing baseline, no diffs → pass, do NOT rewrite (preserve mtime /
 *     minimize touched files on `test:visual:update` invocations).
 *   - existing baseline, diffs + mode ∈ {'all','changed'} → overwrite, pass.
 *   - existing baseline, diffs + mode ∈ {'missing','none'} → fail with diff.
 *
 * Returns an outcome object so the caller (spec file) emits the failure
 * message in the test body — that keeps Playwright's stack trace pointing at
 * the `expect` call, not at a library-level throw.
 */
export function reconcileSidecar(
  path: string,
  actual: Sidecar,
  updateSnapshots: UpdateSnapshotsMode,
): SidecarAssertOutcome {
  const existing = loadSidecar(path);

  if (!existing) {
    if (updateSnapshots === 'none') {
      return { kind: 'fail-missing', path };
    }
    saveSidecar(path, actual);
    return { kind: 'wrote', reason: 'missing' };
  }

  const diffs = diffSidecars(existing, actual);
  if (diffs.length === 0) {
    return { kind: 'pass' };
  }

  if (updateSnapshots === 'all' || updateSnapshots === 'changed') {
    saveSidecar(path, actual);
    return { kind: 'wrote', reason: 'updated' };
  }

  return { kind: 'fail-diff', diffs, formatted: formatDiff(diffs) };
}
