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
