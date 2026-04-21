#!/usr/bin/env node
// QA-10.2 Critical Widths extractor + gate.
//
// Pure-Node audit (no Playwright, no browser). Globs `dist/_astro/*.css`,
// parses via postcss, walks every `@media` at-rule, and extracts each
// `min-width` / `max-width` / `min-device-width` / `max-device-width` /
// `min-resolution` threshold. Length units normalize to px at the 16px
// root (em/rem × 16). Resolution thresholds keep their raw numeric
// value (dppx ≠ dpi; no length axis). Thresholds are deduplicated
// across files and sorted ascending for stable reporting.
//
// Classification:
//   1. covered    — threshold ∈ QA-09 widths (tests/config/widths.ts)
//   2. allowlisted — threshold ∈ tests/audit/threshold-significance.json
//                    with review_by >= today
//   3. unhandled  — fails the gate; the fail message names EACH
//                    unhandled threshold, its source CSS file, and the
//                    containing `@media` rule so the PR author can
//                    classify in one glance (add to QA-09 widths, add
//                    to allowlist with reason, or fix the CSS).
//
// Outputs:
//   - Markdown report to stdout (captured by CI log).
//   - JSON report to tests/audit/__reports__/widths-report.json (gitignored).
//
// Source-of-truth rule (issue #122 refinement, 2026-04-21):
//   D = derived (CSS-authoritative for the audit direction).
//   Q = QA-09 widths (MAY be a superset of D; emergent-layout widths
//       without a CSS threshold are intentional and NOT audited).
//   A = unexpired allowlist entries.
//   Gate passes iff every d ∈ D satisfies d ∈ Q OR d ∈ A.
//
// See: PDR-007 § Decision Phase 1, § Constraints 5 (allowlist);
//      audit-tooling-design.md § 2.2, § 5 Risk 5 (supply chain),
//      § 6 Item 10 (npm script name). HQ repo, private;
//      CONTRIBUTING.md § Cross-repo setup.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import postcss from 'postcss';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_CSS_DIR = join(REPO_ROOT, 'dist/_astro');
const WIDTHS_SOURCE = join(REPO_ROOT, 'tests/config/widths.ts');
const ALLOWLIST_PATH = join(
  REPO_ROOT,
  'tests/audit/threshold-significance.json',
);
const REPORT_DIR = join(REPO_ROOT, 'tests/audit/__reports__');
const REPORT_JSON = join(REPORT_DIR, 'widths-report.json');

const MEDIA_FEATURES = new Set([
  'min-width',
  'max-width',
  'min-device-width',
  'max-device-width',
  'min-resolution',
]);

/**
 * Parse a single `@media` condition (the prelude string) into the
 * list of threshold records it contributes. A prelude may combine
 * multiple features with `and` / `or` / `,` / `not`; we extract each
 * qualifying feature-value pair without trying to evaluate the
 * overall query — the audit only cares about the thresholds named.
 */
export function parseMediaPrelude(prelude) {
  const results = [];
  // Match `(feature:value)` pairs. Tolerates whitespace inside the
  // parens and around the colon. Captures feature and raw value.
  const re = /\(\s*([a-z-]+)\s*:\s*([^)]+?)\s*\)/gi;
  let m;
  while ((m = re.exec(prelude)) !== null) {
    const feature = m[1].toLowerCase();
    if (!MEDIA_FEATURES.has(feature)) continue;
    const rawValue = m[2].trim();
    const normalized = normalizeThresholdValue(feature, rawValue);
    if (normalized === null) continue;
    results.push({
      feature,
      raw_value: rawValue,
      threshold_px: normalized,
    });
  }
  return results;
}

/**
 * Normalize a media-feature value to a single numeric threshold.
 *
 * Length features (min/max-width, min/max-device-width):
 *   px / bare-number → as-is; em / rem → value × 16 (16px root).
 *   Other length units (cm, mm, pt, pc, in, vh, vw, …) are rejected
 *   here — CI-built CSS from Astro consistently emits px, and
 *   surfacing an unexpected unit as a parse failure is preferred to
 *   silent mishandling.
 *
 * Resolution feature (min-resolution):
 *   dppx / dpi / dpcm → preserved as the raw numeric value. The
 *   audit compares as a number; a resolution threshold will never
 *   collide with a width in Q, so the "common number" comparison is
 *   safe in practice. Source and feature are preserved in the report
 *   so the author sees the semantic distinction.
 */
export function normalizeThresholdValue(feature, rawValue) {
  const match = rawValue.match(/^(-?[0-9]*\.?[0-9]+)\s*([a-z%]*)$/i);
  if (!match) return null;
  const n = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(n)) return null;

  if (feature === 'min-resolution') {
    if (unit === 'dppx' || unit === 'dpi' || unit === 'dpcm' || unit === '') {
      return n;
    }
    return null;
  }

  // Length features.
  if (unit === 'px' || unit === '') return n;
  if (unit === 'em' || unit === 'rem') return n * 16;
  return null;
}

/**
 * Walk a CSS source (string) via postcss and return every threshold
 * it contributes. `sourceFile` is an arbitrary label stored on each
 * record so failure messages can point the PR author at the offender.
 */
export function extractThresholds(cssContent, sourceFile) {
  const root = postcss.parse(cssContent);
  const out = [];
  root.walkAtRules('media', (atRule) => {
    const items = parseMediaPrelude(atRule.params);
    for (const item of items) {
      out.push({
        ...item,
        source_file: sourceFile,
        media_condition: `@media ${atRule.params}`,
      });
    }
  });
  return out;
}

/**
 * Load the QA-09 canonical widths from tests/config/widths.ts by
 * text-scanning the exported array. A full TypeScript loader would
 * require a compiler dependency; the file's shape is stable (single
 * top-level numeric array) and the regex tolerates whitespace and
 * trailing commas without needing a parser.
 */
export function loadWidths(sourceText) {
  const match = sourceText.match(
    /export\s+const\s+WIDTHS\s*=\s*\[([\s\S]*?)\]/,
  );
  if (!match) {
    throw new Error(
      `tests/config/widths.ts: could not locate 'export const WIDTHS = [...]'`,
    );
  }
  const numbers = [];
  for (const token of match[1].split(',')) {
    const trimmed = token.trim();
    if (trimmed === '') continue;
    if (!/^-?[0-9]*\.?[0-9]+$/.test(trimmed)) {
      // Non-numeric token (e.g., a comment that escaped a simple split);
      // fail loud rather than silently skipping.
      throw new Error(
        `tests/config/widths.ts: unexpected non-numeric token '${trimmed}' in WIDTHS array`,
      );
    }
    numbers.push(Number(trimmed));
  }
  if (numbers.length === 0) {
    throw new Error(`tests/config/widths.ts: WIDTHS array parsed as empty`);
  }
  return numbers;
}

/**
 * Classify each unique threshold against QA-09 widths and the
 * allowlist. `today` is injected so tests can drive expired-entry
 * behaviour deterministically.
 *
 * Returns a flat list of classified threshold records, each carrying
 * its original source_file + media_condition trail. Thresholds that
 * appear in multiple files produce multiple records — the caller
 * aggregates for reporting.
 */
export function classifyThresholds(thresholds, widths, allowlist, today) {
  const widthsSet = new Set(widths);
  const allowByThreshold = new Map();
  for (const entry of allowlist) {
    allowByThreshold.set(entry.threshold_px, entry);
  }

  return thresholds.map((t) => {
    if (widthsSet.has(t.threshold_px)) {
      return { ...t, classification: 'covered' };
    }
    const allow = allowByThreshold.get(t.threshold_px);
    if (allow) {
      if (allow.review_by < today) {
        return {
          ...t,
          classification: 'expired',
          allow_entry: allow,
        };
      }
      return { ...t, classification: 'allowlisted', allow_entry: allow };
    }
    return { ...t, classification: 'unhandled' };
  });
}

function groupByThreshold(records) {
  const map = new Map();
  for (const r of records) {
    const key = r.threshold_px;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([threshold_px, recs]) => ({ threshold_px, records: recs }));
}

function todayISO() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function renderMarkdown(summary, grouped) {
  const lines = [];
  lines.push('# QA-10.2 Critical Widths — audit report');
  lines.push('');
  lines.push(`- Run date: ${summary.run_date}`);
  lines.push(`- CSS files scanned: ${summary.css_files_scanned}`);
  lines.push(`- Unique thresholds derived: ${summary.unique_thresholds}`);
  lines.push(`- Covered: ${summary.counts.covered}`);
  lines.push(`- Allowlisted: ${summary.counts.allowlisted}`);
  lines.push(`- Expired: ${summary.counts.expired}`);
  lines.push(`- Unhandled: ${summary.counts.unhandled}`);
  lines.push('');

  if (grouped.length === 0) {
    lines.push('_No media thresholds found in `dist/_astro/*.css`._');
    return lines.join('\n');
  }

  lines.push('| Threshold | Classification | Feature(s) | Source(s) |');
  lines.push('| --- | --- | --- | --- |');
  for (const g of grouped) {
    const cls = g.records[0].classification;
    const features = [...new Set(g.records.map((r) => r.feature))].join(', ');
    const sources = [
      ...new Set(
        g.records.map((r) => `\`${r.source_file}\` — ${r.media_condition}`),
      ),
    ].join('<br>');
    lines.push(`| ${g.threshold_px} | ${cls} | ${features} | ${sources} |`);
  }
  return lines.join('\n');
}

function renderFailureMessage(grouped) {
  const failing = grouped.filter((g) =>
    g.records.some(
      (r) => r.classification === 'unhandled' || r.classification === 'expired',
    ),
  );
  if (failing.length === 0) return '';

  const lines = [];
  lines.push('');
  lines.push('QA-10.2 FAIL — unhandled media thresholds detected:');
  lines.push('');
  for (const g of failing) {
    for (const r of g.records) {
      if (r.classification !== 'unhandled' && r.classification !== 'expired') {
        continue;
      }
      const suffix =
        r.classification === 'expired'
          ? ` [allowlist entry expired review_by=${r.allow_entry.review_by}]`
          : '';
      lines.push(`  - ${r.threshold_px}px (${r.feature})${suffix}`);
      lines.push(`      source: ${r.source_file}`);
      lines.push(`      rule:   ${r.media_condition}`);
    }
  }
  lines.push('');
  lines.push('Resolve each by one of:');
  lines.push(
    '  (a) add the threshold to tests/config/widths.ts (expands QA-09 widths; regenerate baselines),',
  );
  lines.push(
    '  (b) add an entry to tests/audit/threshold-significance.json (with reason + review_by = today + 90d), or',
  );
  lines.push('  (c) fix the CSS so the threshold no longer appears.');
  lines.push('See tests/audit/THRESHOLD-ALLOWLIST.md for lifecycle rules.');
  return lines.join('\n');
}

/**
 * Discover CSS files under `dist/_astro/`. A glob would pull in a
 * dependency; a plain `readdirSync` with suffix filter matches the
 * `dist/_astro/*.css` pattern from the AC without adding surface area.
 */
function globDistCss() {
  let entries;
  try {
    entries = readdirSync(DIST_CSS_DIR, { withFileTypes: true });
  } catch (err) {
    throw new Error(
      `${DIST_CSS_DIR}: cannot read (${err.code || err.message}). Run 'npm run build' first.`,
    );
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.css'))
    .map((e) => join(DIST_CSS_DIR, e.name))
    .sort();
}

function loadAllowlist() {
  let raw;
  try {
    raw = readFileSync(ALLOWLIST_PATH, 'utf8');
  } catch (err) {
    throw new Error(
      `${ALLOWLIST_PATH}: cannot read (${err.code || err.message})`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${ALLOWLIST_PATH}: invalid JSON (${err.message})`);
  }
  if (!parsed || !Array.isArray(parsed.allowlist)) {
    throw new Error(
      `${ALLOWLIST_PATH}: expected { allowlist: [...] }; allowlist field is missing or not an array`,
    );
  }
  return parsed.allowlist;
}

function writeJsonReport(summary, grouped) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const payload = {
    run_date: summary.run_date,
    css_files_scanned: summary.css_files_scanned,
    unique_thresholds: summary.unique_thresholds,
    counts: summary.counts,
    thresholds: grouped.map((g) => ({
      threshold_px: g.threshold_px,
      classification: g.records[0].classification,
      features: [...new Set(g.records.map((r) => r.feature))].sort(),
      // Dedupe by (source_file, feature, raw_value). Astro bundles
      // multiple component styles into one CSS file, so identical
      // @media rules can appear multiple times in a single file — the
      // audit cares about whether the threshold is covered, not how
      // many times it's written.
      sources: dedupeSources(g.records),
    })),
  };
  writeFileSync(REPORT_JSON, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return REPORT_JSON;
}

function dedupeSources(records) {
  const seen = new Set();
  const out = [];
  for (const r of records) {
    const key = `${r.source_file} ${r.feature} ${r.raw_value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      source_file: r.source_file,
      media_condition: r.media_condition,
      feature: r.feature,
      raw_value: r.raw_value,
    });
  }
  return out;
}

export async function main() {
  const today = todayISO();

  const widths = loadWidths(readFileSync(WIDTHS_SOURCE, 'utf8'));
  const allowlist = loadAllowlist();
  const cssFiles = globDistCss();

  const allThresholds = [];
  for (const file of cssFiles) {
    const content = readFileSync(file, 'utf8');
    const rel = relative(REPO_ROOT, file);
    for (const t of extractThresholds(content, rel)) {
      allThresholds.push(t);
    }
  }

  const classified = classifyThresholds(
    allThresholds,
    widths,
    allowlist,
    today,
  );

  // Collapse to one record per (threshold_px, classification). The
  // classification is a function of the threshold alone, so all records
  // for a given threshold share the same classification — the grouping
  // just preserves the source trail.
  const grouped = groupByThreshold(classified);

  const counts = {
    covered: 0,
    allowlisted: 0,
    expired: 0,
    unhandled: 0,
  };
  for (const g of grouped) {
    counts[g.records[0].classification] += 1;
  }

  const summary = {
    run_date: today,
    css_files_scanned: cssFiles.length,
    unique_thresholds: grouped.length,
    counts,
  };

  // Markdown report to stdout (CI log capture).
  process.stdout.write(renderMarkdown(summary, grouped) + '\n');

  // JSON report to gitignored __reports__/.
  const jsonPath = writeJsonReport(summary, grouped);
  process.stdout.write(`\nJSON report: ${relative(REPO_ROOT, jsonPath)}\n`);

  const failMsg = renderFailureMessage(grouped);
  if (failMsg !== '') {
    process.stderr.write(failMsg + '\n');
    process.exit(1);
  }
}

// CLI invocation — only runs when executed directly, not when imported
// by the unit test.
const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((err) => {
    process.stderr.write(`[extract-widths] ERROR: ${err.message}\n`);
    process.exit(1);
  });
}
