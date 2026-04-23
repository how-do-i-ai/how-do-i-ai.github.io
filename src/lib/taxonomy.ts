/**
 * Single source of truth for content taxonomy.
 *
 * Covers two layers:
 * - Pillars and series (blog front-matter `pillar`/`series` fields).
 * - Namespaced tag conventions `chapter:*` and `wwh:*` adopted by PDR-009
 *   (HDIAI HQ `docs/decisions/PDR-009-schema-evolution-principle.md`).
 *   Values mirror HQ `content/strategy.md` § Reserved Tag Namespaces.
 *
 * All consumers — Zod schema, badge components, nav, client-side filter,
 * post type aliases, JSON-LD emission, llms.txt — must import from this
 * module rather than defining their own copy. Adding or renaming a
 * pillar/series/chapter/wwh happens here, once.
 */

export const PILLARS = {
  thinking: 'AI-First Thinking',
  practice: 'AI in Practice',
  tools: 'Tools & Workflows',
  meta: 'Behind the Scenes',
} as const;

export const SERIES = {
  'ai-at-home': 'AI at Home',
  'ai-at-work': 'AI at Work',
  'ai-for-gigs': 'AI for Gigs',
  'ai-mindset': 'AI Mindset',
} as const;

export type PillarSlug = keyof typeof PILLARS;
export type SeriesSlug = keyof typeof SERIES;

export const PILLAR_SLUGS = Object.keys(PILLARS) as [
  PillarSlug,
  ...PillarSlug[],
];
export const SERIES_SLUGS = Object.keys(SERIES) as [
  SeriesSlug,
  ...SeriesSlug[],
];

export const CHAPTER_SLUGS = [
  'first-moves',
  'mental-models',
  'interaction',
  'judgment',
  'workflow',
  'where-you-are',
  'meta-skill',
] as const;

export const WWH_SLUGS = [
  'what-works',
  'when-to-use',
  'how-to-do',
  'meta-outside',
] as const;

export const CHAPTER_LABELS: Record<(typeof CHAPTER_SLUGS)[number], string> = {
  'first-moves': 'First Moves',
  'mental-models': 'Mental Models',
  interaction: 'Interaction',
  judgment: 'Judgment',
  workflow: 'Workflow',
  'where-you-are': 'Where You Are',
  'meta-skill': 'Meta-skill',
};

export const WWH_LABELS: Record<(typeof WWH_SLUGS)[number], string> = {
  'what-works': 'What works?',
  'when-to-use': 'When to use?',
  'how-to-do': 'How to do?',
  'meta-outside': 'Meta',
};

/**
 * Reserved tag namespaces per PDR-009 § Reserved Tag Namespaces. A tag of
 * the form `{ns}:{slug}` where `{ns}` matches one of these is a namespaced
 * tag (rendered as a dedicated labeled badge). Anything else is a free-form
 * tag (rendered in the +N-capped tag list on post cards).
 */
export const RESERVED_NAMESPACES = ['chapter', 'wwh'] as const;

/**
 * True if `tag` is `{ns}:{slug}` where `{ns}` is one of `RESERVED_NAMESPACES`
 * and both `{ns}` and `{slug}` are non-empty. Empty namespace (`:foo`),
 * empty slug (`chapter:`), missing colon (`foo`), and unreserved namespaces
 * (`foo:bar`) all return `false` — those are free-form tags.
 *
 * Slug character validation (kebab-case, membership in `CHAPTER_SLUGS` /
 * `WWH_SLUGS`) is the Zod schema's job (W-G / #165), not this predicate's.
 * For rendering, "namespaced" means the prefix matters, not the slug value.
 */
export function isNamespacedTag(tag: string): boolean {
  const idx = tag.indexOf(':');
  if (idx <= 0) return false;
  if (idx === tag.length - 1) return false;
  const ns = tag.slice(0, idx);
  return (RESERVED_NAMESPACES as readonly string[]).includes(ns);
}

/**
 * Partition `tags` into `namespaced` (matching `RESERVED_NAMESPACES`) and
 * `freeForm` (everything else), preserving input order within each group.
 *
 * Used by post-card components so the existing "3 visible + '+N more'" cap
 * on `TagList` applies to free-form tags only — namespaced tags render as
 * dedicated badges via PDR-009 § 7 / REQ-CONTENT-MODEL-03 (#166) and must
 * not pollute the cap (#168 / REQ-CONTENT-MODEL-03 display rule).
 */
export function partitionTags(tags: readonly string[]): {
  namespaced: string[];
  freeForm: string[];
} {
  const namespaced: string[] = [];
  const freeForm: string[] = [];
  for (const tag of tags) {
    if (isNamespacedTag(tag)) namespaced.push(tag);
    else freeForm.push(tag);
  }
  return { namespaced, freeForm };
}

/**
 * Resolve a `chapter:{slug}` tag to its human-readable label, or return
 * `null` if the tag is not a known chapter. Typos and hand-crafted URL
 * values (e.g., `chapter:judgement`) return null rather than throwing —
 * build-time `superRefine` validation is the gate for editorial correctness;
 * the filter UI receives whatever the URL carries at runtime.
 */
export function resolveChapterLabel(tag: string): string | null {
  const PREFIX = 'chapter:';
  if (!tag.startsWith(PREFIX)) return null;
  const slug = tag.slice(PREFIX.length);
  if (!(CHAPTER_SLUGS as readonly string[]).includes(slug)) return null;
  return CHAPTER_LABELS[slug as (typeof CHAPTER_SLUGS)[number]];
}

/**
 * Resolve a `wwh:{slug}` tag to its human-readable label, or return `null`
 * if the tag is not a known W/W/H content type. See `resolveChapterLabel`
 * for the unknown-slug rationale.
 */
export function resolveWwhLabel(tag: string): string | null {
  const PREFIX = 'wwh:';
  if (!tag.startsWith(PREFIX)) return null;
  const slug = tag.slice(PREFIX.length);
  if (!(WWH_SLUGS as readonly string[]).includes(slug)) return null;
  return WWH_LABELS[slug as (typeof WWH_SLUGS)[number]];
}

/**
 * Format a tag value for display as an active-filter chip on the blog
 * index. Reserved namespaces (`chapter:*`, `wwh:*`) resolve to their
 * human-readable labels per PDR-009 § 4 / REQ-CONTENT-MODEL-02 GWT.
 * Free-form tags render as `#tag` (preserving pre-PDR-009 UI behavior).
 * Unknown namespaced slugs fall through to the raw string rather than
 * throwing so that hand-crafted URLs do not crash the client island.
 * Non-reserved colon tags (`tool:vim`, `lang:ts`) are free-form and
 * render with the `#` prefix — the reserved-namespace check uses
 * `isNamespacedTag` (#175) so the gate matches the partition logic
 * applied on post cards.
 */
export function formatTagChipLabel(tag: string): string {
  return (
    resolveChapterLabel(tag) ??
    resolveWwhLabel(tag) ??
    (isNamespacedTag(tag) ? tag : `#${tag}`)
  );
}

/**
 * Resolve the filter name for the empty-state template (REQ-INDEX-03:
 * "No posts in [filter name] yet."). Returns `null` when zero or multiple
 * filters are active, signalling that the caller should fall back to a
 * generic "No posts match your filters." message.
 *
 * For tag filters, namespaced tags (`chapter:*`, `wwh:*`) resolve to their
 * human-readable labels per REQ-CONTENT-MODEL-02; free-form tags return
 * the raw tag string (no `#` prefix — the empty state reads as prose, not
 * a tag affordance).
 */
export function formatEmptyStateFilterName(filters: {
  pillar: string;
  series: string;
  tag: string;
}): string | null {
  const activeCount =
    (filters.pillar ? 1 : 0) + (filters.series ? 1 : 0) + (filters.tag ? 1 : 0);
  if (activeCount !== 1) return null;

  if (filters.pillar) {
    return PILLARS[filters.pillar as PillarSlug] ?? filters.pillar;
  }
  if (filters.series) {
    return SERIES[filters.series as SeriesSlug] ?? filters.series;
  }
  // filters.tag is the only remaining non-empty field.
  return (
    resolveChapterLabel(filters.tag) ??
    resolveWwhLabel(filters.tag) ??
    filters.tag
  );
}
