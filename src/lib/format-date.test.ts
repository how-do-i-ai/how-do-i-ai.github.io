import { describe, it, expect } from 'vitest';
import { formatDate } from './format-date';

describe('formatDate', () => {
  it('formats January correctly', () => {
    expect(formatDate(new Date(2026, 0, 15))).toBe('Jan 15, 2026');
  });

  it('formats December correctly', () => {
    expect(formatDate(new Date(2024, 11, 31))).toBe('Dec 31, 2024');
  });

  it('handles single-digit days without padding', () => {
    expect(formatDate(new Date(2026, 2, 1))).toBe('Mar 1, 2026');
    expect(formatDate(new Date(2026, 2, 9))).toBe('Mar 9, 2026');
  });

  it('handles all twelve months', () => {
    const expected = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    expected.forEach((abbr, i) => {
      expect(formatDate(new Date(2026, i, 1))).toBe(`${abbr} 1, 2026`);
    });
  });

  it('does not apply locale reordering', () => {
    // Should always be "MMM D, YYYY" regardless of system locale.
    expect(formatDate(new Date(2026, 5, 7))).toBe('Jun 7, 2026');
  });

  it('reflects the local calendar date (not UTC) for Date-only inputs', () => {
    // new Date(YYYY, M, D) uses local TZ; the formatter reads the same
    // local components, so this is stable on every machine.
    const d = new Date(2025, 6, 4); // July 4, 2025 local
    expect(formatDate(d)).toBe('Jul 4, 2025');
  });
});
