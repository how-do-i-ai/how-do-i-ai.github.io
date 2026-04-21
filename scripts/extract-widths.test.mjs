// Unit tests for scripts/extract-widths.mjs (QA-10.2 critical widths
// extractor + gate). Drives classification and parsing logic through
// in-memory CSS fixtures so the reverse-test AC (introducing a new
// `@media (min-width: 851px)` rule is surfaced as unhandled with source
// file named) has an automated enforcement point.

import { describe, it, expect } from 'vitest';
import {
  parseMediaPrelude,
  normalizeThresholdValue,
  extractThresholds,
  loadWidths,
  classifyThresholds,
} from './extract-widths.mjs';

describe('normalizeThresholdValue', () => {
  it('passes bare pixel values through', () => {
    expect(normalizeThresholdValue('min-width', '480px')).toBe(480);
    expect(normalizeThresholdValue('max-width', '639px')).toBe(639);
  });

  it('normalizes em/rem to px at 16px root', () => {
    expect(normalizeThresholdValue('min-width', '30em')).toBe(480);
    expect(normalizeThresholdValue('min-width', '48rem')).toBe(768);
  });

  it('accepts bare numbers for length features', () => {
    expect(normalizeThresholdValue('min-width', '480')).toBe(480);
  });

  it('returns null for unsupported length units', () => {
    expect(normalizeThresholdValue('min-width', '30vh')).toBeNull();
    expect(normalizeThresholdValue('min-width', '300pt')).toBeNull();
  });

  it('preserves raw numeric value for min-resolution', () => {
    expect(normalizeThresholdValue('min-resolution', '2dppx')).toBe(2);
    expect(normalizeThresholdValue('min-resolution', '192dpi')).toBe(192);
    expect(normalizeThresholdValue('min-resolution', '75dpcm')).toBe(75);
  });

  it('rejects invalid numeric input', () => {
    expect(normalizeThresholdValue('min-width', 'abc')).toBeNull();
    expect(normalizeThresholdValue('min-width', '')).toBeNull();
  });
});

describe('parseMediaPrelude', () => {
  it('extracts a single feature', () => {
    expect(parseMediaPrelude('(min-width: 480px)')).toEqual([
      { feature: 'min-width', raw_value: '480px', threshold_px: 480 },
    ]);
  });

  it('extracts multiple features combined with and', () => {
    const out = parseMediaPrelude('(min-width: 480px) and (max-width: 767px)');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ feature: 'min-width', threshold_px: 480 });
    expect(out[1]).toMatchObject({ feature: 'max-width', threshold_px: 767 });
  });

  it('ignores unrelated media features', () => {
    expect(parseMediaPrelude('(orientation: landscape)')).toEqual([]);
    expect(
      parseMediaPrelude('screen and (prefers-color-scheme: dark)'),
    ).toEqual([]);
  });

  it('tolerates whitespace variants', () => {
    expect(parseMediaPrelude('(  min-width : 480px  )')).toEqual([
      { feature: 'min-width', raw_value: '480px', threshold_px: 480 },
    ]);
  });

  it('extracts min-resolution alongside width features', () => {
    const out = parseMediaPrelude(
      '(min-width: 1024px) and (min-resolution: 2dppx)',
    );
    expect(out).toHaveLength(2);
    expect(out.find((t) => t.feature === 'min-resolution')).toMatchObject({
      threshold_px: 2,
    });
  });
});

describe('extractThresholds', () => {
  it('walks @media at-rules in a CSS string', () => {
    const css = `
      .a { color: red; }
      @media (min-width: 480px) { .a { color: blue; } }
      @media (max-width: 639px) { .a { color: green; } }
    `;
    const out = extractThresholds(css, 'fixture.css');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      feature: 'min-width',
      threshold_px: 480,
      source_file: 'fixture.css',
      media_condition: '@media (min-width: 480px)',
    });
    expect(out[1]).toMatchObject({
      feature: 'max-width',
      threshold_px: 639,
      source_file: 'fixture.css',
    });
  });

  it('returns empty array when no @media rules are present', () => {
    const css = '.a { color: red; } .b { color: blue; }';
    expect(extractThresholds(css, 'fixture.css')).toEqual([]);
  });

  it('handles nested at-rules and multiple queries per file', () => {
    const css = `
      @media (min-width: 480px), (min-width: 768px) { .a { color: red; } }
      @media (min-width: 1024px) { .a { color: blue; } }
    `;
    const out = extractThresholds(css, 'fixture.css');
    // Three thresholds: 480, 768 (same @media rule, comma-combined) and 1024.
    expect(out.map((t) => t.threshold_px).sort((a, b) => a - b)).toEqual([
      480, 768, 1024,
    ]);
  });
});

describe('loadWidths', () => {
  it('parses a canonical widths.ts file', () => {
    const source = `
      /** doc */
      export const WIDTHS = [
        320, 375, 414, 480, 500, 600, 640, 700, 767, 768, 1024, 1440,
      ] as const;
    `;
    expect(loadWidths(source)).toEqual([
      320, 375, 414, 480, 500, 600, 640, 700, 767, 768, 1024, 1440,
    ]);
  });

  it('throws when the export is missing', () => {
    expect(() => loadWidths('const OTHER = [1, 2, 3];')).toThrow(
      /could not locate/,
    );
  });

  it('throws on unexpected non-numeric tokens in the array', () => {
    expect(() =>
      loadWidths('export const WIDTHS = [320, "oops", 480];'),
    ).toThrow(/non-numeric token/);
  });

  it('throws when the array is empty', () => {
    expect(() => loadWidths('export const WIDTHS = [];')).toThrow(
      /parsed as empty/,
    );
  });
});

describe('classifyThresholds', () => {
  const today = '2026-04-21';
  const widths = [480, 640, 768, 1024];

  it('classifies covered thresholds', () => {
    const thresholds = [
      {
        feature: 'min-width',
        raw_value: '480px',
        threshold_px: 480,
        source_file: 'dist/_astro/x.css',
        media_condition: '@media (min-width: 480px)',
      },
    ];
    const out = classifyThresholds(thresholds, widths, [], today);
    expect(out[0].classification).toBe('covered');
  });

  it('classifies allowlisted thresholds with unexpired review_by', () => {
    const thresholds = [
      {
        feature: 'max-width',
        raw_value: '639px',
        threshold_px: 639,
        source_file: 'dist/_astro/x.css',
        media_condition: '@media (max-width: 639px)',
      },
    ];
    const allowlist = [
      {
        threshold_px: 639,
        reason: 'test',
        source_file: 'dist/_astro/x.css',
        added: '2026-04-21',
        review_by: '2026-07-20',
      },
    ];
    const out = classifyThresholds(thresholds, widths, allowlist, today);
    expect(out[0].classification).toBe('allowlisted');
    expect(out[0].allow_entry.reason).toBe('test');
  });

  it('classifies allowlisted entries as expired when review_by is past', () => {
    const thresholds = [
      {
        feature: 'max-width',
        raw_value: '639px',
        threshold_px: 639,
        source_file: 'x.css',
        media_condition: '@media (max-width: 639px)',
      },
    ];
    const allowlist = [
      {
        threshold_px: 639,
        reason: 'test',
        source_file: 'x.css',
        added: '2026-01-01',
        review_by: '2026-04-01',
      },
    ];
    const out = classifyThresholds(thresholds, widths, allowlist, today);
    expect(out[0].classification).toBe('expired');
  });

  it('classifies absent thresholds as unhandled', () => {
    const thresholds = [
      {
        feature: 'min-width',
        raw_value: '851px',
        threshold_px: 851,
        source_file: 'x.css',
        media_condition: '@media (min-width: 851px)',
      },
    ];
    const out = classifyThresholds(thresholds, widths, [], today);
    expect(out[0].classification).toBe('unhandled');
  });
});

// The reverse-test AC from issue #122: introducing a new
// `@media (min-width: 851px)` rule in a test CSS fixture must be
// surfaced as an unhandled threshold with the source file named.
describe('reverse-test (issue #122 AC)', () => {
  it('surfaces a new @media (min-width: 851px) rule as unhandled with source file', () => {
    const css = `
      .a { color: red; }
      @media (min-width: 851px) {
        .a { color: blue; }
      }
    `;
    const thresholds = extractThresholds(css, 'dist/_astro/fixture.css');
    const classified = classifyThresholds(
      thresholds,
      [320, 375, 414, 480, 500, 600, 640, 700, 767, 768, 1024, 1440],
      [],
      '2026-04-21',
    );

    const hit = classified.find((r) => r.threshold_px === 851);
    expect(hit).toBeDefined();
    expect(hit.classification).toBe('unhandled');
    expect(hit.source_file).toBe('dist/_astro/fixture.css');
    expect(hit.media_condition).toBe('@media (min-width: 851px)');
    expect(hit.feature).toBe('min-width');
  });
});
