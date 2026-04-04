const WORDS_PER_MINUTE = 220;

/**
 * Estimate reading time in minutes from raw text content.
 * Uses ~220 WPM, rounds to nearest integer, minimum 1 minute.
 */
export function estimateReadingTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.round(words / WORDS_PER_MINUTE);
  return Math.max(1, minutes);
}
