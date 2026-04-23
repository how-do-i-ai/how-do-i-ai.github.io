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
