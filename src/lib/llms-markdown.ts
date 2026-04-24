/**
 * Format a CommonMark link with escape-safe link text and URL-encoded target.
 *
 * The `llms.txt` emitter hand-rolls Markdown (no library safety net) and
 * consumes `post.data.title` / `post.id` — an unconstrained `z.string()` per
 * `content.config.ts` and a filesystem-derived slug respectively. A title
 * like `Reviewing [Claude]` or an id with a stray space would otherwise
 * produce malformed output for the automated LLM crawlers that consume
 * `llms.txt`.
 *
 * - Link text: escape `\` (Markdown escape char) and `]` (closes link text)
 *   by prefixing each with `\`. Single-pass replace avoids double-escape
 *   ordering bugs.
 * - URL: `encodeURI` encodes spaces and other reserved chars while
 *   preserving `/` path separators (post ids can contain `/` for nested
 *   folders per Astro's glob loader).
 */
export function formatMarkdownLink(text: string, url: string): string {
  const safeText = text.replace(/[\\\]]/g, '\\$&');
  const safeUrl = encodeURI(url);
  return `[${safeText}](${safeUrl})`;
}
