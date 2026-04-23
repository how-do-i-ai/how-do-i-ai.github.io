#!/usr/bin/env node
// QA-10 aggregated audit report (Phase 2).
//
// Pure-Node aggregator. Reads per-component JSON outputs from
// `tests/audit/__reports__/*.json` emitted by the Phase 1 + Phase 2
// QA-10 components, and renders a single consolidated Markdown
// document at `tests/audit/__reports__/audit-report.md`.
//
// The Markdown is uploaded as a CI artifact and posted (upserted) as a
// PR comment so reviewers see one aggregated status per PR instead of
// scanning five separate CI steps.
//
// Component inputs (see README.md § QA-10 components for full map):
//
//   QA-10.1  tests/audit/__reports__/routes-report.json
//   QA-10.2  tests/audit/__reports__/widths-report.json
//   QA-10.3  tests/audit/__reports__/invariants-report.json
//   QA-10.4  (no per-run JSON — checks happen inline in the QA-09
//            Playwright suite; baseline artifacts live at
//            `tests/visual/__baselines__/*.styles.json`)
//   QA-10.5  tests/audit/__reports__/og-rss-report.json
//
// QA-10.4 is rendered with a graceful-degradation note pointing
// reviewers at the Playwright step and the sidecar baselines. If a
// future iteration adds `cross-sections-report.json`, the classifier
// here picks it up automatically — the graceful section only renders
// when that file is absent.
//
// Aggregator semantics:
//   - Exits 0 for every audit outcome (pass / fail / not-run / parse
//     error are all REPORTED, never raised). Exits non-zero only on
//     an aggregator bug or unhandled IO error in the CLI wrapper.
//     CI gating stays on the per-component steps, whose non-zero
//     exits stop the build independently.
//   - Tolerates missing / malformed JSON (reports the failure mode in
//     the corresponding component section; does not throw).
//   - On 100% component pass → one-line positive summary.
//   - On any failure → full per-component detail section expanded.
//
// See: issue #131; PDR-007 § Decision Phase 2; audit-tooling-design.md
// § 6 Item 13. HQ repo, private — see CONTRIBUTING.md § Cross-repo
// setup.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DIR = join(REPO_ROOT, 'tests/audit/__reports__');
const OUTPUT_PATH = join(REPORT_DIR, 'audit-report.md');

// Marker used by the CI workflow's PR-comment upsert. The find-comment
// step locates the prior comment by this string; the create-or-update
// step replaces the body. Keep in sync with `.github/workflows/ci.yml`.
export const COMMENT_MARKER = '<!-- qa-10-audit-report -->';

// Artifact name that CI uses to upload per-component JSONs on failure
// (`.github/workflows/ci.yml` § Upload QA-10 audit reports). Referenced
// in per-component sections so reviewers know where to fetch the raw
// JSON for deep inspection.
export const JSON_ARTIFACT_NAME = 'qa-10-audit-reports';

/**
 * Component descriptors. Order drives the rendered section order in
 * the aggregated Markdown. Each entry names its input JSON (relative
 * to `tests/audit/__reports__/`), a human title, and the classifier
 * that converts parsed JSON → status object.
 *
 * QA-10.4 declares `report_file: 'cross-sections-report.json'`, but
 * that file is NOT emitted by the current implementation — its pass/
 * fail is surfaced inline via the QA-09 Playwright step (sidecar
 * reconciliation in `tests/visual/screenshots.spec.ts`), and its
 * artifacts are `.styles.json` baselines under
 * `tests/visual/__baselines__/`. In the common case
 * `loadReport` returns `null` for QA-10.4, and the classifier for
 * that entry (`classifyCrossSections`) returns an `inline` status
 * that renders a graceful-degradation note pointing at where the
 * checks and baselines live. If a future iteration starts emitting
 * `cross-sections-report.json` at the declared path, the classifier
 * falls through to a standard pass/fail on `violations[]` — no
 * descriptor change required.
 */
export const COMPONENTS = [
  {
    id: 'QA-10.1',
    title: 'Route clustering',
    report_file: 'routes-report.json',
    classifier: classifyRoutes,
  },
  {
    id: 'QA-10.2',
    title: 'Critical widths',
    report_file: 'widths-report.json',
    classifier: classifyWidths,
  },
  {
    id: 'QA-10.3',
    title: 'Invariant specs',
    report_file: 'invariants-report.json',
    classifier: classifyInvariants,
  },
  {
    id: 'QA-10.4',
    title: 'DOM cross-sections',
    report_file: 'cross-sections-report.json',
    classifier: classifyCrossSections,
  },
  {
    id: 'QA-10.5',
    title: 'OG meta + RSS 2.0',
    report_file: 'og-rss-report.json',
    classifier: classifyOgRss,
  },
];

// --- Status shape ----------------------------------------------------

/**
 * @typedef {object} Status
 * @property {'pass'|'fail'|'not_run'|'parse_error'|'inline'} kind
 * @property {Record<string, number>} [counts]     Displayed as badge row.
 * @property {Array<{label: string, detail: string}>} [violations]
 * @property {string} [note]                        Freetext explanation.
 * @property {string} [summary]                     One-line status summary.
 */

const STATUS_ICON = {
  pass: '✅',
  fail: '❌',
  not_run: '⚠️',
  parse_error: '❌',
  inline: 'ℹ️',
};

const STATUS_LABEL = {
  pass: 'PASS',
  fail: 'FAIL',
  not_run: 'NOT RUN',
  parse_error: 'PARSE ERROR',
  inline: 'INLINE',
};

// --- Markdown helpers ------------------------------------------------

/**
 * Escape user-controlled values before interpolating them into
 * Markdown violation labels / details. QA-10.5 (OG + RSS) violations
 * carry raw page titles, descriptions, and URLs that originate in
 * `src/content/blog/*.md` frontmatter or the rendered HTML head —
 * both are authored, but a backtick or literal `<tag>` inside a title
 * would open an unpaired code span or trip GitHub's HTML sanitizer
 * when embedded in the aggregated report. Keeping the escape
 * conservative (backticks, pipes, angle brackets) preserves
 * readability while neutralizing the three characters that actually
 * corrupt rendering in a bulleted list context.
 *
 * Pipes are included because future renderers may embed violation
 * detail inside a table cell; keeping the helper safe for both list
 * and table contexts avoids a caller-by-caller decision.
 */
export function mdEscape(value) {
  if (typeof value !== 'string') return String(value ?? '');
  return value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\|/g, '\\|')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// --- Classifiers -----------------------------------------------------

/**
 * QA-10.1 route-clustering classifier. FAIL when any route is either
 * unregistered (no archetype binding) OR drifting (registered as one
 * archetype but its hash matches another). Counts surfaced:
 *   - total:       rows in `results[]` (one per route tested)
 *   - unregistered: routes with no archetype binding
 *   - drift:       routes whose hash matches a different archetype
 *   - matched:     routes whose hash equals their registered archetype
 */
export function classifyRoutes(json) {
  const results = Array.isArray(json?.results) ? json.results : [];
  const unregistered = Array.isArray(json?.unregistered_routes)
    ? json.unregistered_routes
    : [];
  const drift = Array.isArray(json?.drift_routes) ? json.drift_routes : [];
  const matched = results.filter((r) => r?.matches === true).length;

  const counts = {
    total: results.length,
    matched,
    unregistered: unregistered.length,
    drift: drift.length,
  };

  if (unregistered.length === 0 && drift.length === 0) {
    return {
      kind: 'pass',
      counts,
      summary: `${matched} of ${results.length} routes matched their registered archetype`,
    };
  }

  const violations = [];
  for (const route of unregistered) {
    violations.push({
      label: `Unregistered route: ${mdEscape(route)}`,
      detail:
        'No archetype binding in `tests/audit/__baselines__/route-clusters.json`.',
    });
  }
  for (const drifted of drift) {
    const route = drifted?.route ?? '(unknown)';
    const registeredAs = drifted?.registered_as ?? '(unknown)';
    const matchesArchetype = drifted?.matches_archetype ?? '(unknown)';
    violations.push({
      label: `Category drift: ${mdEscape(route)}`,
      detail: `Registered as "${mdEscape(registeredAs)}" but hash matches "${mdEscape(matchesArchetype)}".`,
    });
  }

  return {
    kind: 'fail',
    counts,
    violations,
    summary: `${unregistered.length} unregistered, ${drift.length} drift`,
  };
}

/**
 * QA-10.2 critical-widths classifier. FAIL when any threshold is
 * `unhandled` (not in QA-09 widths AND not in the allowlist) OR
 * `expired` (in the allowlist but past its review_by date). Counts
 * pass through from the underlying `counts` object verbatim.
 */
export function classifyWidths(json) {
  const counts = json?.counts ?? {};
  const thresholds = Array.isArray(json?.thresholds) ? json.thresholds : [];
  const unhandled = counts.unhandled ?? 0;
  const expired = counts.expired ?? 0;

  const summary = `${counts.covered ?? 0} covered, ${counts.allowlisted ?? 0} allowlisted, ${expired} expired, ${unhandled} unhandled`;

  if (unhandled === 0 && expired === 0) {
    return {
      kind: 'pass',
      counts: {
        covered: counts.covered ?? 0,
        allowlisted: counts.allowlisted ?? 0,
        expired,
        unhandled,
      },
      summary,
    };
  }

  const violations = [];
  for (const t of thresholds) {
    if (t?.classification !== 'unhandled' && t?.classification !== 'expired') {
      continue;
    }
    const features = Array.isArray(t.features)
      ? t.features.map(mdEscape).join(', ')
      : '';
    const sources = Array.isArray(t.sources)
      ? t.sources
          .map((s) => s.source_file)
          .filter(Boolean)
          .map(mdEscape)
          .join(', ')
      : '';
    violations.push({
      label: `${t.threshold_px}px (${t.classification}${features ? ` — ${features}` : ''})`,
      detail: sources ? `Source(s): ${sources}` : 'No source recorded.',
    });
  }

  return {
    kind: 'fail',
    counts: {
      covered: counts.covered ?? 0,
      allowlisted: counts.allowlisted ?? 0,
      expired,
      unhandled,
    },
    violations,
    summary,
  };
}

/**
 * QA-10.3 invariants classifier. FAIL when any invariant `pass: false`.
 * Each invariant carries multiple `runs[]` (viewport × mode combos);
 * failure detail enumerates the failing runs for the PR author.
 */
export function classifyInvariants(json) {
  const invariants = Array.isArray(json?.invariants) ? json.invariants : [];
  const passing = invariants.filter((inv) => inv?.pass === true).length;
  const failing = invariants.length - passing;

  const counts = {
    total: invariants.length,
    passing,
    failing,
  };

  if (failing === 0) {
    return {
      kind: 'pass',
      counts,
      summary: `${passing} of ${invariants.length} invariants held`,
    };
  }

  const violations = [];
  for (const inv of invariants) {
    if (inv?.pass !== false) continue;
    const failedRuns = Array.isArray(inv.runs)
      ? inv.runs.filter((r) => r?.pass === false)
      : [];
    const runLabel = failedRuns
      .map((r) =>
        `${mdEscape(String(r.viewport))}px ${mdEscape(r.mode ?? '')}`.trim(),
      )
      .join(', ');
    violations.push({
      label:
        `${mdEscape(inv.id ?? '(unknown)')}: ${mdEscape(inv.title ?? '')}`.trim(),
      detail: runLabel
        ? `Failed at: ${runLabel}`
        : 'Failed (no per-run detail available).',
    });
  }

  return {
    kind: 'fail',
    counts,
    violations,
    summary: `${failing} of ${invariants.length} invariants violated`,
  };
}

/**
 * QA-10.4 cross-sections classifier. When no per-run JSON exists,
 * returns an `inline` status that renders a graceful-degradation note
 * pointing reviewers at the Playwright step and sidecar baselines.
 *
 * If a future iteration emits `cross-sections-report.json` under
 * `tests/audit/__reports__/`, this classifier treats the presence of
 * `violations[]` as the fail signal and falls through to the standard
 * pass/fail shape. Until then, the `inline` branch is the only one
 * that runs in practice.
 */
export function classifyCrossSections(json) {
  if (json === null) {
    return {
      kind: 'inline',
      note:
        'QA-10.4 runs inline inside the QA-09 Playwright screenshots suite ' +
        '(pass/fail reflected in the QA-07 / QA-08 / QA-09 CI step). ' +
        'Sidecar baselines live at `tests/visual/__baselines__/*.styles.json` — ' +
        'a drift there is surfaced by that step, not in this aggregated report.',
    };
  }

  const violations = Array.isArray(json?.violations) ? json.violations : [];
  const counts = {
    checked: json?.checked ?? 0,
    violations: violations.length,
  };

  if (violations.length === 0) {
    return {
      kind: 'pass',
      counts,
      summary: `${counts.checked} sidecars matched baseline`,
    };
  }

  return {
    kind: 'fail',
    counts,
    violations: violations.map((v) => ({
      label: v?.label ?? '(unlabeled)',
      detail: v?.detail ?? '',
    })),
    summary: `${violations.length} sidecar drift(s)`,
  };
}

/**
 * QA-10.5 OG + RSS classifier. FAIL when either the OG side OR the RSS
 * side carries violations. Counts surface page / item totals plus
 * per-side violation counts; violation list interleaves both sides so
 * the reviewer sees everything in one place.
 */
export function classifyOgRss(json) {
  const ogViolations = Array.isArray(json?.og?.violations)
    ? json.og.violations
    : [];
  const rssViolations = Array.isArray(json?.rss?.violations)
    ? json.rss.violations
    : [];

  const counts = {
    html_pages_scanned: json?.html_pages_scanned ?? 0,
    blog_post_pages: json?.blog_post_pages ?? 0,
    rss_items: json?.rss_items ?? 0,
    og_violations: ogViolations.length,
    rss_violations: rssViolations.length,
  };

  if (ogViolations.length === 0 && rssViolations.length === 0) {
    return {
      kind: 'pass',
      counts,
      summary: `${counts.html_pages_scanned} pages, ${counts.rss_items} RSS items — no drift`,
    };
  }

  const violations = [];
  for (const v of ogViolations) {
    const location = v?.page
      ? `${mdEscape(v.page)} (${mdEscape(v.url ?? '')})`.trim()
      : mdEscape(v?.source ?? '(unknown)');
    violations.push({
      label:
        `[OG ${mdEscape(v?.kind ?? '')}] ${mdEscape(v?.field ?? '')}`.trim(),
      detail: `At: ${location} — expected: ${mdEscape(v?.expected ?? '')} · actual: ${mdEscape(v?.actual ?? '')}`,
    });
  }
  for (const v of rssViolations) {
    const location = mdEscape(v?.source ?? '(unknown)');
    violations.push({
      label:
        `[RSS ${mdEscape(v?.kind ?? '')}] ${mdEscape(v?.field ?? '')}`.trim(),
      detail: `At: ${location} — expected: ${mdEscape(v?.expected ?? '')} · actual: ${mdEscape(v?.actual ?? '')}`,
    });
  }

  return {
    kind: 'fail',
    counts,
    violations,
    summary: `${ogViolations.length} OG + ${rssViolations.length} RSS violation(s)`,
  };
}

// --- Report loading --------------------------------------------------

/**
 * Attempt to read + parse a component's JSON report. Returns:
 *   - parsed object if the file exists and parses;
 *   - `null` if the file does NOT exist (treated as "not run" by
 *     classifiers that want to distinguish this case);
 *   - `{ __parse_error: message }` if the file exists but is malformed.
 *
 * Never throws — the aggregator is a reporter, not a gate.
 */
export function loadReport(reportDir, filename) {
  if (filename === null) return null;
  const path = join(reportDir, filename);
  if (!existsSync(path)) return null;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    return { __parse_error: `Cannot read ${path}: ${err.code || err.message}` };
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { __parse_error: `Invalid JSON in ${path}: ${err.message}` };
  }
}

/**
 * Drive a single component through read → classify. Returns `{id,
 * title, report_file, status}` for downstream rendering. Parse errors
 * short-circuit to a `parse_error` status without invoking the
 * component's classifier.
 */
export function evaluateComponent(component, reportDir) {
  const json = loadReport(reportDir, component.report_file);

  if (json && json.__parse_error) {
    return {
      id: component.id,
      title: component.title,
      report_file: component.report_file,
      status: {
        kind: 'parse_error',
        note: json.__parse_error,
      },
    };
  }

  if (json === null && component.id !== 'QA-10.4') {
    return {
      id: component.id,
      title: component.title,
      report_file: component.report_file,
      status: {
        kind: 'not_run',
        note:
          'Per-run JSON report not found — component did not run to completion, ' +
          'or its CI step was skipped due to an earlier failure.',
      },
    };
  }

  return {
    id: component.id,
    title: component.title,
    report_file: component.report_file,
    status: component.classifier(json),
  };
}

// --- Rendering -------------------------------------------------------

/**
 * Format a counts record as a Markdown badge-like row. Empty record
 * returns `''` so callers can concatenate unconditionally.
 */
function renderCounts(counts) {
  if (!counts || Object.keys(counts).length === 0) return '';
  const parts = [];
  for (const [key, value] of Object.entries(counts)) {
    parts.push(`**${key}**: ${value}`);
  }
  return parts.join(' | ');
}

/**
 * Render a single component section as Markdown. Kept as an exported
 * pure function so unit tests drive the renderer with fixtures instead
 * of the filesystem.
 */
export function renderComponentSection(evaluation) {
  const { id, title, report_file, status } = evaluation;
  const icon = STATUS_ICON[status.kind];
  const label = STATUS_LABEL[status.kind];
  const lines = [];

  lines.push(`### ${icon} ${id} — ${title} — ${label}`);
  lines.push('');

  if (status.summary) {
    lines.push(status.summary);
    lines.push('');
  }

  const countsLine = renderCounts(status.counts);
  if (countsLine !== '') {
    lines.push(countsLine);
    lines.push('');
  }

  if (status.note) {
    lines.push(status.note);
    lines.push('');
  }

  if (Array.isArray(status.violations) && status.violations.length > 0) {
    lines.push('**Violations**:');
    lines.push('');
    for (const v of status.violations) {
      lines.push(`- **${v.label}**`);
      if (v.detail) {
        lines.push(`  - ${v.detail}`);
      }
    }
    lines.push('');
  }

  // Cross-link to the raw JSON artifact for deep inspection (AC bullet
  // 6). Omitted for statuses where no JSON file exists to fetch:
  //   - `inline` (QA-10.4): the inline note already names the relevant
  //     artifacts (sidecar baselines + QA-09 CI step).
  //   - `not_run`: the component's CI step was skipped (typically due
  //     to an earlier failure), so no JSON was written — the pointer
  //     would send reviewers to a file that isn't in the artifact.
  // Parse errors keep the link because the JSON file exists (just
  // malformed) and the reviewer may want to fetch it to debug.
  const hasJson =
    status.kind === 'pass' ||
    status.kind === 'fail' ||
    status.kind === 'parse_error';
  if (hasJson && report_file) {
    lines.push(
      `<sub>Raw report: \`${report_file}\` in the \`${JSON_ARTIFACT_NAME}\` CI artifact (uploaded on failure).</sub>`,
    );
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Overall aggregator verdict. `fail` dominates (any component fail →
 * overall fail); `parse_error` also counts as fail (we can't confirm
 * pass). `not_run` is reported but does NOT mark overall fail —
 * skipped-step aggregation is expected on the CI failure-then-skip
 * path. `inline` is treated as informational (cannot aggregate a pass
 * verdict from an empty classifier).
 */
export function computeOverall(evaluations) {
  let failed = 0;
  let parseErrors = 0;
  let notRun = 0;
  let passed = 0;
  let inline = 0;
  for (const e of evaluations) {
    switch (e.status.kind) {
      case 'fail':
        failed += 1;
        break;
      case 'parse_error':
        parseErrors += 1;
        break;
      case 'not_run':
        notRun += 1;
        break;
      case 'pass':
        passed += 1;
        break;
      case 'inline':
        inline += 1;
        break;
    }
  }

  const totalGating = failed + parseErrors + passed;
  // "All passing" requires every gating component to have produced a
  // confirming pass — zero failures, zero parse errors, zero not-run,
  // and at least one component actually ran. Inline-only (QA-10.4) is
  // not a pass signal on its own; not-run implies an upstream skip
  // (typically a prior step's failure on the `failure → skip` CI path)
  // which by definition means we cannot confirm overall pass.
  const allPassing =
    failed === 0 && parseErrors === 0 && notRun === 0 && passed > 0;

  return {
    allPassing,
    failed,
    parseErrors,
    notRun,
    passed,
    inline,
    totalGating,
    total: evaluations.length,
  };
}

/**
 * Render the aggregated report. On 100% component pass (overall),
 * collapses to the single-line positive summary per AC. On any
 * failure (including parse errors), renders full per-component
 * sections with violation detail expanded.
 */
export function renderReport(evaluations, { runIso } = {}) {
  const overall = computeOverall(evaluations);
  const lines = [COMMENT_MARKER, '', '# QA-10 aggregated audit report', ''];
  lines.push(`**Run**: ${runIso ?? new Date().toISOString()}`);
  lines.push('');

  if (overall.allPassing) {
    // One-line positive summary (AC bullet 5). `allPassing` (defined
    // in computeOverall) already requires zero failures, zero parse
    // errors, zero not-run components, and at least one confirmed
    // pass — no further conjuncts needed here. Components are listed
    // compactly so reviewers still see each one was accounted for.
    const per = evaluations
      .map((e) => `${STATUS_ICON[e.status.kind]} ${e.id}`)
      .join(' · ');
    lines.push(`✅ **All QA-10 checks passed.** ${per}`);
    lines.push('');
    return lines.join('\n');
  }

  // Failure / mixed state: full detail expanded.
  const headline = [];
  if (overall.failed > 0) headline.push(`${overall.failed} failed`);
  if (overall.parseErrors > 0) {
    headline.push(`${overall.parseErrors} parse error(s)`);
  }
  if (overall.notRun > 0) headline.push(`${overall.notRun} not run`);
  if (overall.passed > 0) headline.push(`${overall.passed} passed`);
  if (overall.inline > 0) headline.push(`${overall.inline} inline`);
  const headlineStr =
    headline.length > 0 ? headline.join(', ') : 'no components';
  lines.push(
    `❌ **QA-10 status** — ${headlineStr} (of ${overall.total} total).`,
  );
  lines.push('');

  // Quick-look status table so reviewers scan status first, detail
  // second. Duplicates the per-section headers intentionally — the
  // table works in email previews that truncate after the first few
  // kilobytes, and the sections work when the reviewer lands on GitHub.
  lines.push('| Component | Status | Summary |');
  lines.push('| --- | --- | --- |');
  for (const e of evaluations) {
    const icon = STATUS_ICON[e.status.kind];
    const label = STATUS_LABEL[e.status.kind];
    const summary = e.status.summary ?? e.status.note ?? '';
    const truncated =
      summary.length > 120 ? summary.slice(0, 117) + '...' : summary;
    lines.push(`| ${e.id} — ${e.title} | ${icon} ${label} | ${truncated} |`);
  }
  lines.push('');

  lines.push('## Per-component detail');
  lines.push('');
  for (const e of evaluations) {
    lines.push(renderComponentSection(e));
  }

  return lines.join('\n');
}

// --- CLI -------------------------------------------------------------

/**
 * CLI entry point. Reads every component's JSON from the canonical
 * report directory, renders the aggregated Markdown, and writes it to
 * disk. Exits 0 unconditionally — CI gating is the caller's
 * responsibility (this script reports; it does not gate).
 */
export function main() {
  const evaluations = COMPONENTS.map((c) => evaluateComponent(c, REPORT_DIR));
  const markdown = renderReport(evaluations);
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, markdown + '\n', 'utf8');

  // Echo to stdout so the CI log surfaces the same content reviewers
  // see in the PR comment, in case the comment posting step is
  // skipped (non-PR event, missing permission, etc.).
  process.stdout.write(markdown + '\n');
  process.stdout.write(
    `\nAggregated report: ${relative(REPO_ROOT, OUTPUT_PATH)}\n`,
  );
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    main();
  } catch (err) {
    // Defensive — any uncaught error inside the aggregator is a bug,
    // not an audit finding. Surface loudly rather than silently failing
    // (which would leave the CI artifact + PR comment stale).
    process.stderr.write(`[audit-report] ERROR: ${err.stack || err.message}\n`);
    process.exit(1);
  }
}
