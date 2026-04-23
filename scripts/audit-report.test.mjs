// Unit tests for scripts/audit-report.mjs (QA-10 aggregated audit
// report). Exercises every classifier against pass/fail fixtures, the
// overall computation across mixed states, and the rendering contract
// (one-line positive on all-pass, full detail expanded on failure).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  COMMENT_MARKER,
  JSON_ARTIFACT_NAME,
  mdEscape,
  classifyRoutes,
  classifyWidths,
  classifyInvariants,
  classifyCrossSections,
  classifyOgRss,
  evaluateComponent,
  loadReport,
  computeOverall,
  renderReport,
  renderComponentSection,
} from './audit-report.mjs';

describe('mdEscape', () => {
  it('returns empty string for null / undefined', () => {
    expect(mdEscape(null)).toBe('');
    expect(mdEscape(undefined)).toBe('');
  });

  it('stringifies other non-string input without escaping', () => {
    // Non-string inputs are stringified via `String(value ?? '')` and do
    // NOT run through the escape pipeline — the only callers passing
    // non-strings are numeric labels (viewports, thresholds) which never
    // contain markdown-corrupting characters.
    expect(mdEscape(42)).toBe('42');
  });

  it('passes plain strings through', () => {
    expect(mdEscape('hello world')).toBe('hello world');
    expect(mdEscape('/blog/sample-post/')).toBe('/blog/sample-post/');
  });

  it('escapes backticks', () => {
    expect(mdEscape('use `foo` here')).toBe('use \\`foo\\` here');
  });

  it('escapes pipes', () => {
    expect(mdEscape('a|b|c')).toBe('a\\|b\\|c');
  });

  it('entity-encodes angle brackets', () => {
    expect(mdEscape('<meta>')).toBe('&lt;meta&gt;');
  });

  it('escapes backslashes first so escape sequences do not collide', () => {
    expect(mdEscape('path\\to')).toBe('path\\\\to');
  });
});

describe('classifyRoutes', () => {
  it('returns pass when no unregistered or drift routes', () => {
    const status = classifyRoutes({
      results: [
        { route: '/', matches: true },
        { route: '/blog/', matches: true },
      ],
      unregistered_routes: [],
      drift_routes: [],
    });
    expect(status.kind).toBe('pass');
    expect(status.counts).toEqual({
      total: 2,
      matched: 2,
      unregistered: 0,
      drift: 0,
    });
  });

  it('returns fail with violations for unregistered routes', () => {
    const status = classifyRoutes({
      results: [
        { route: '/new', matches: false },
        { route: '/', matches: true },
      ],
      unregistered_routes: ['/new'],
      drift_routes: [],
    });
    expect(status.kind).toBe('fail');
    expect(status.counts.unregistered).toBe(1);
    expect(status.violations).toHaveLength(1);
    expect(status.violations[0].label).toContain('/new');
  });

  it('returns fail with violations for drift routes', () => {
    const status = classifyRoutes({
      results: [{ route: '/a', matches: false }],
      unregistered_routes: [],
      drift_routes: [
        { route: '/a', registered_as: 'home', matches_archetype: 'blog' },
      ],
    });
    expect(status.kind).toBe('fail');
    expect(status.counts.drift).toBe(1);
    expect(status.violations[0].label).toContain('/a');
    expect(status.violations[0].detail).toContain('home');
    expect(status.violations[0].detail).toContain('blog');
  });

  it('tolerates missing arrays', () => {
    const status = classifyRoutes({});
    expect(status.kind).toBe('pass');
    expect(status.counts.total).toBe(0);
  });
});

describe('classifyWidths', () => {
  it('returns pass when no unhandled or expired thresholds', () => {
    const status = classifyWidths({
      counts: { covered: 8, allowlisted: 2, expired: 0, unhandled: 0 },
      thresholds: [],
    });
    expect(status.kind).toBe('pass');
    expect(status.counts.covered).toBe(8);
  });

  it('returns fail when unhandled thresholds exist', () => {
    const status = classifyWidths({
      counts: { covered: 4, allowlisted: 0, expired: 0, unhandled: 1 },
      thresholds: [
        {
          threshold_px: 851,
          classification: 'unhandled',
          features: ['min-width'],
          sources: [{ source_file: 'dist/_astro/x.css' }],
        },
      ],
    });
    expect(status.kind).toBe('fail');
    expect(status.violations).toHaveLength(1);
    expect(status.violations[0].label).toContain('851');
    expect(status.violations[0].detail).toContain('dist/_astro/x.css');
  });

  it('returns fail when expired allowlist entries exist', () => {
    const status = classifyWidths({
      counts: { covered: 4, allowlisted: 0, expired: 1, unhandled: 0 },
      thresholds: [
        {
          threshold_px: 639,
          classification: 'expired',
          features: ['max-width'],
          sources: [{ source_file: 'dist/_astro/y.css' }],
        },
      ],
    });
    expect(status.kind).toBe('fail');
    expect(status.violations[0].label).toContain('expired');
  });

  it('tolerates missing counts object', () => {
    const status = classifyWidths({ thresholds: [] });
    expect(status.kind).toBe('pass');
  });
});

describe('classifyInvariants', () => {
  it('returns pass when all invariants hold', () => {
    const status = classifyInvariants({
      invariants: [
        { id: 'inv-1', title: 'T1', pass: true, runs: [] },
        { id: 'inv-2', title: 'T2', pass: true, runs: [] },
      ],
    });
    expect(status.kind).toBe('pass');
    expect(status.counts.passing).toBe(2);
    expect(status.counts.failing).toBe(0);
  });

  it('returns fail with per-run detail on failure', () => {
    const status = classifyInvariants({
      invariants: [
        {
          id: 'inv-4',
          title: 'nav overlap',
          pass: false,
          runs: [
            { viewport: '480', mode: 'light', pass: false },
            { viewport: '768', mode: 'light', pass: true },
          ],
        },
      ],
    });
    expect(status.kind).toBe('fail');
    expect(status.violations).toHaveLength(1);
    expect(status.violations[0].label).toContain('inv-4');
    expect(status.violations[0].detail).toContain('480px');
  });

  it('tolerates missing runs field', () => {
    const status = classifyInvariants({
      invariants: [{ id: 'inv-x', title: 'T', pass: false }],
    });
    expect(status.kind).toBe('fail');
    expect(status.violations[0].detail).toContain('no per-run detail');
  });
});

describe('classifyCrossSections', () => {
  it('returns inline status when no JSON file exists', () => {
    const status = classifyCrossSections(null);
    expect(status.kind).toBe('inline');
    expect(status.note).toContain('QA-09');
    expect(status.note).toContain('tests/visual/__baselines__');
  });

  it('returns pass when future JSON exists with zero violations', () => {
    const status = classifyCrossSections({ checked: 72, violations: [] });
    expect(status.kind).toBe('pass');
    expect(status.counts.checked).toBe(72);
  });

  it('returns fail when future JSON carries violations', () => {
    const status = classifyCrossSections({
      checked: 72,
      violations: [{ label: '.site-nav drift', detail: 'color shifted' }],
    });
    expect(status.kind).toBe('fail');
    expect(status.violations[0].label).toContain('.site-nav');
  });
});

describe('classifyOgRss', () => {
  it('returns pass when OG and RSS both clean', () => {
    const status = classifyOgRss({
      html_pages_scanned: 5,
      blog_post_pages: 1,
      rss_items: 1,
      og: { violations: [], per_page: [] },
      rss: { violations: [], channel_present: true, item_count: 1 },
    });
    expect(status.kind).toBe('pass');
  });

  it('returns fail when OG side has violations', () => {
    const status = classifyOgRss({
      html_pages_scanned: 5,
      og: {
        violations: [
          {
            kind: 'og_title_mismatch',
            field: 'og:title',
            page: 'dist/blog/foo/index.html',
            url: '/blog/foo/',
            expected: 'X',
            actual: 'Y',
          },
        ],
      },
      rss: { violations: [] },
    });
    expect(status.kind).toBe('fail');
    expect(status.violations[0].label).toContain('OG');
    expect(status.violations[0].detail).toContain('X');
    expect(status.violations[0].detail).toContain('Y');
  });

  it('returns fail when RSS side has violations', () => {
    const status = classifyOgRss({
      og: { violations: [] },
      rss: {
        violations: [
          {
            kind: 'rss_missing_field',
            field: 'item[0] > title',
            source: 'dist/rss.xml',
            expected: 'present',
            actual: 'missing',
          },
        ],
      },
    });
    expect(status.kind).toBe('fail');
    expect(status.violations[0].label).toContain('RSS');
  });

  it('interleaves OG + RSS violations in one list', () => {
    const status = classifyOgRss({
      og: {
        violations: [
          {
            kind: 'og_title_mismatch',
            field: 'og:title',
            page: 'p',
            url: '/u/',
          },
        ],
      },
      rss: {
        violations: [
          {
            kind: 'rss_missing_field',
            field: 'item[0] > link',
            source: 'dist/rss.xml',
          },
        ],
      },
    });
    expect(status.kind).toBe('fail');
    expect(status.violations).toHaveLength(2);
  });
});

describe('loadReport', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'audit-report-test-'));

  it('returns null when the file is missing', () => {
    expect(loadReport(tmp, 'missing.json')).toBeNull();
  });

  it('returns null when filename is null (QA-10.4)', () => {
    expect(loadReport(tmp, null)).toBeNull();
  });

  it('returns parsed JSON when the file exists and is valid', () => {
    const path = join(tmp, 'valid.json');
    writeFileSync(path, JSON.stringify({ a: 1, b: 'hello' }));
    expect(loadReport(tmp, 'valid.json')).toEqual({ a: 1, b: 'hello' });
  });

  it('returns a parse_error marker when JSON is malformed', () => {
    const path = join(tmp, 'bad.json');
    writeFileSync(path, '{not json');
    const result = loadReport(tmp, 'bad.json');
    expect(result).toHaveProperty('__parse_error');
    expect(result.__parse_error).toContain('bad.json');
  });
});

describe('evaluateComponent', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'audit-report-eval-'));

  it('short-circuits to parse_error when JSON is malformed', () => {
    writeFileSync(join(tmp, 'routes-report.json'), '{not json');
    const out = evaluateComponent(
      {
        id: 'QA-10.1',
        title: 'Route clustering',
        report_file: 'routes-report.json',
        classifier: classifyRoutes,
      },
      tmp,
    );
    expect(out.status.kind).toBe('parse_error');
    expect(out.status.note).toContain('Invalid JSON');
  });

  it('returns not_run when JSON is missing (non-QA-10.4)', () => {
    const out = evaluateComponent(
      {
        id: 'QA-10.2',
        title: 'Critical widths',
        report_file: 'widths-report.json',
        classifier: classifyWidths,
      },
      mkdtempSync(join(tmpdir(), 'audit-report-missing-')),
    );
    expect(out.status.kind).toBe('not_run');
  });

  it('returns inline for QA-10.4 when JSON is missing', () => {
    const out = evaluateComponent(
      {
        id: 'QA-10.4',
        title: 'DOM cross-sections',
        report_file: 'cross-sections-report.json',
        classifier: classifyCrossSections,
      },
      mkdtempSync(join(tmpdir(), 'audit-report-inline-')),
    );
    expect(out.status.kind).toBe('inline');
  });

  it('delegates to classifier when JSON is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-report-pass-'));
    writeFileSync(
      join(dir, 'widths-report.json'),
      JSON.stringify({
        counts: { covered: 5, allowlisted: 0, expired: 0, unhandled: 0 },
        thresholds: [],
      }),
    );
    const out = evaluateComponent(
      {
        id: 'QA-10.2',
        title: 'Critical widths',
        report_file: 'widths-report.json',
        classifier: classifyWidths,
      },
      dir,
    );
    expect(out.status.kind).toBe('pass');
  });
});

describe('computeOverall', () => {
  it('marks all passing when every gating component passes', () => {
    const evaluations = [
      { status: { kind: 'pass' } },
      { status: { kind: 'pass' } },
      { status: { kind: 'inline' } },
    ];
    const o = computeOverall(evaluations);
    expect(o.allPassing).toBe(true);
    expect(o.failed).toBe(0);
    expect(o.passed).toBe(2);
    expect(o.inline).toBe(1);
  });

  it('marks not-all-passing when any fail', () => {
    const evaluations = [
      { status: { kind: 'pass' } },
      { status: { kind: 'fail' } },
    ];
    const o = computeOverall(evaluations);
    expect(o.allPassing).toBe(false);
    expect(o.failed).toBe(1);
  });

  it('marks not-all-passing on parse errors', () => {
    const evaluations = [
      { status: { kind: 'pass' } },
      { status: { kind: 'parse_error' } },
    ];
    const o = computeOverall(evaluations);
    expect(o.allPassing).toBe(false);
    expect(o.parseErrors).toBe(1);
  });

  it('inline-only runs are NOT all passing (no confirming pass)', () => {
    const evaluations = [{ status: { kind: 'inline' } }];
    const o = computeOverall(evaluations);
    expect(o.allPassing).toBe(false);
  });

  it('not_run is reported and blocks the one-line positive summary', () => {
    const evaluations = [
      { status: { kind: 'pass' } },
      { status: { kind: 'not_run' } },
    ];
    const o = computeOverall(evaluations);
    // Not-run is NOT a new failure count — the failure that caused the
    // skip is reported on its own failing step — but it blocks
    // allPassing because we cannot confirm the skipped component
    // would have passed. The aggregated comment therefore expands full
    // detail, which surfaces the not-run components visibly.
    expect(o.failed).toBe(0);
    expect(o.parseErrors).toBe(0);
    expect(o.notRun).toBe(1);
    expect(o.allPassing).toBe(false);
  });
});

describe('renderReport', () => {
  const runIso = '2026-04-23T12:00:00.000Z';

  it('emits COMMENT_MARKER as the first line', () => {
    const md = renderReport(
      [{ id: 'QA-10.1', title: 'T', status: { kind: 'pass' } }],
      { runIso },
    );
    expect(md.split('\n')[0]).toBe(COMMENT_MARKER);
  });

  it('collapses to one-line summary on all-pass', () => {
    const evaluations = [
      {
        id: 'QA-10.1',
        title: 'Route clustering',
        status: { kind: 'pass', summary: 's' },
      },
      {
        id: 'QA-10.2',
        title: 'Critical widths',
        status: { kind: 'pass', summary: 's' },
      },
      {
        id: 'QA-10.4',
        title: 'DOM cross-sections',
        status: { kind: 'inline' },
      },
    ];
    const md = renderReport(evaluations, { runIso });
    expect(md).toContain('All QA-10 checks passed');
    // No per-component detail headers on all-pass.
    expect(md).not.toContain('## Per-component detail');
  });

  it('expands full per-component detail on any failure', () => {
    const evaluations = [
      {
        id: 'QA-10.1',
        title: 'Route clustering',
        report_file: 'routes-report.json',
        status: {
          kind: 'fail',
          counts: { total: 3, matched: 2, unregistered: 1, drift: 0 },
          violations: [{ label: '/new', detail: 'No archetype.' }],
          summary: '1 unregistered',
        },
      },
      {
        id: 'QA-10.2',
        title: 'Critical widths',
        report_file: 'widths-report.json',
        status: {
          kind: 'pass',
          counts: { covered: 5, allowlisted: 0, expired: 0, unhandled: 0 },
          summary: 'clean',
        },
      },
    ];
    const md = renderReport(evaluations, { runIso });
    expect(md).toContain('❌');
    expect(md).toContain('| Component | Status | Summary |');
    expect(md).toContain('## Per-component detail');
    expect(md).toContain('QA-10.1');
    expect(md).toContain('/new');
    expect(md).toContain('No archetype');
    expect(md).toContain(JSON_ARTIFACT_NAME);
  });

  it('reports parse errors as failures in the headline', () => {
    const evaluations = [
      {
        id: 'QA-10.1',
        title: 'T',
        report_file: 'routes-report.json',
        status: { kind: 'parse_error', note: 'bad JSON' },
      },
    ];
    const md = renderReport(evaluations, { runIso });
    expect(md).toContain('parse error');
    expect(md).toContain('bad JSON');
  });
});

describe('renderComponentSection', () => {
  it('renders the raw-report pointer on non-inline statuses', () => {
    const md = renderComponentSection({
      id: 'QA-10.1',
      title: 'Route clustering',
      report_file: 'routes-report.json',
      status: {
        kind: 'pass',
        counts: { total: 1, matched: 1 },
        summary: 'ok',
      },
    });
    expect(md).toContain('routes-report.json');
    expect(md).toContain(JSON_ARTIFACT_NAME);
  });

  it('omits the raw-report pointer on inline statuses', () => {
    const md = renderComponentSection({
      id: 'QA-10.4',
      title: 'DOM cross-sections',
      report_file: 'cross-sections-report.json',
      status: {
        kind: 'inline',
        note: 'runs inline in QA-09',
      },
    });
    expect(md).toContain('runs inline in QA-09');
    expect(md).not.toContain(JSON_ARTIFACT_NAME);
  });

  it('omits the raw-report pointer on not_run statuses (no JSON was written)', () => {
    const md = renderComponentSection({
      id: 'QA-10.3',
      title: 'Invariant specs',
      report_file: 'invariants-report.json',
      status: {
        kind: 'not_run',
        note: 'component skipped due to prior failure',
      },
    });
    expect(md).toContain('component skipped');
    // The pointer promises a file in the artifact, but not_run means
    // no JSON was produced — sending reviewers there would mislead.
    expect(md).not.toContain(JSON_ARTIFACT_NAME);
  });

  it('keeps the raw-report pointer on parse_error statuses (JSON exists, just malformed)', () => {
    const md = renderComponentSection({
      id: 'QA-10.1',
      title: 'Route clustering',
      report_file: 'routes-report.json',
      status: {
        kind: 'parse_error',
        note: 'Invalid JSON at offset 5',
      },
    });
    // The JSON file exists on disk but was malformed; the reviewer
    // needs to download it to debug the parse failure.
    expect(md).toContain(JSON_ARTIFACT_NAME);
    expect(md).toContain('routes-report.json');
  });

  it('escapes backticks in violation content so embedded code spans do not corrupt rendering', () => {
    const status = classifyOgRss({
      og: {
        violations: [
          {
            kind: 'og_title_mismatch',
            field: 'og:title',
            page: 'p',
            url: '/u/',
            expected: 'Title with `backtick`',
            actual: 'Actual',
          },
        ],
      },
      rss: { violations: [] },
    });
    const md = renderComponentSection({
      id: 'QA-10.5',
      title: 'OG',
      report_file: 'og-rss-report.json',
      status,
    });
    // The backtick must be escaped (not left raw) to avoid opening
    // an unpaired code span that swallows subsequent text.
    expect(md).toContain('\\`backtick\\`');
    expect(md).not.toContain('Title with `backtick`');
  });

  it('renders violation label + detail indented under it', () => {
    const md = renderComponentSection({
      id: 'QA-10.3',
      title: 'Invariants',
      report_file: 'invariants-report.json',
      status: {
        kind: 'fail',
        counts: { total: 2, passing: 1, failing: 1 },
        violations: [
          {
            label: 'invariant-4: nav overlap',
            detail: 'Failed at: 480px light',
          },
        ],
        summary: '1 of 2 violated',
      },
    });
    expect(md).toContain('**Violations**:');
    expect(md).toContain('- **invariant-4: nav overlap**');
    expect(md).toContain('  - Failed at: 480px light');
  });
});
