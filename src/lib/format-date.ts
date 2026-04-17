const MS_PER_DAY = 1000 * 60 * 60 * 24;
const RELATIVE_THRESHOLD_DAYS = 7;

const MONTH_NAMES = [
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

/**
 * Format a date as relative ("3 days ago") if within the last 7 days,
 * or absolute ("Mar 15, 2026") otherwise.
 */
export function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / MS_PER_DAY);

  if (diffDays < 0) {
    return formatAbsolute(date);
  }

  if (diffDays === 0) {
    return 'Today';
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  if (diffDays < RELATIVE_THRESHOLD_DAYS) {
    return `${diffDays} days ago`;
  }

  return formatAbsolute(date);
}

function formatAbsolute(date: Date): string {
  const month = MONTH_NAMES[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}
