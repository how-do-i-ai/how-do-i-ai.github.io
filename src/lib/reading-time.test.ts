import { describe, it, expect } from 'vitest';
import { estimateReadingTime } from './reading-time';

describe('estimateReadingTime', () => {
  it('returns 1 minute for empty string', () => {
    expect(estimateReadingTime('')).toBe(1);
  });

  it('returns 1 minute for whitespace-only content', () => {
    expect(estimateReadingTime('   \n\t  ')).toBe(1);
  });

  it('returns 1 minute for content below 1-minute threshold', () => {
    // 50 words at 220 wpm ≈ 0.22 min → rounds to 0 → clamped to 1
    const text = 'word '.repeat(50).trim();
    expect(estimateReadingTime(text)).toBe(1);
  });

  it('rounds 330 words to 2 minutes (330 / 220 = 1.5 → 2)', () => {
    const text = 'word '.repeat(330).trim();
    expect(estimateReadingTime(text)).toBe(2);
  });

  it('rounds 220 words to 1 minute', () => {
    const text = 'word '.repeat(220).trim();
    expect(estimateReadingTime(text)).toBe(1);
  });

  it('rounds 1100 words to 5 minutes', () => {
    const text = 'word '.repeat(1100).trim();
    expect(estimateReadingTime(text)).toBe(5);
  });

  it('collapses multiple whitespace into single word boundary', () => {
    // Three words separated by mixed whitespace, not 10
    expect(estimateReadingTime('one\n\ntwo\t  three')).toBe(1);
  });
});
