/**
 * Single source of truth for content taxonomy (pillars and series).
 *
 * All consumers — Zod schema, badge components, nav, client-side filter,
 * post type aliases — must import from this module rather than defining
 * their own copy. Adding or renaming a pillar/series happens here, once.
 */

export const PILLARS = {
  'ai-first-thinking': 'AI-First Thinking',
  'ai-in-practice': 'AI in Practice',
  'tools-and-workflows': 'Tools & Workflows',
  'behind-the-scenes': 'Behind the Scenes',
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
