const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Format a date as an absolute string ("Mar 15, 2026").
 *
 * Relative labels ("Today", "N days ago") are intentionally not used:
 * in a static-site-generation context the comparison to `new Date()`
 * happens at build time, so labels become stale as soon as the site
 * is deployed and viewed on a later day.
 */
export function formatDate(date: Date): string {
  const month = MONTH_NAMES[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}
