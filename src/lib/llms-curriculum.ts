import { CHAPTER_LABELS, CHAPTER_SLUGS } from './taxonomy';

/**
 * Minimal post shape consumed by the curriculum grouper. Accepts any object
 * exposing `id` and `data.{title, tags}`; keeps the helper decoupled from
 * `astro:content` so the pure grouping logic is unit-testable without a
 * build context.
 */
export type CurriculumPost = {
  id: string;
  data: {
    title: string;
    tags: string[];
  };
};

/**
 * Curriculum layout returned by `groupPostsByChapter`. `chapters` is always
 * emitted in `CHAPTER_SLUGS` declaration order — a fixed pedagogical
 * sequence rather than a popularity-derived one — and includes entries with
 * zero posts so callers can choose to render placeholders or skip. Posts
 * without a `chapter:*` tag (or carrying an unknown chapter slug) land in
 * `unclassified` in their input order.
 */
export type CurriculumGrouping<T extends CurriculumPost> = {
  chapters: Array<{
    slug: (typeof CHAPTER_SLUGS)[number];
    label: string;
    posts: T[];
  }>;
  unclassified: T[];
};

/**
 * Group `posts` by their `chapter:*` tag per PDR-009 § 4. A post is placed
 * in at most one chapter bucket (the build-time `superRefine` in
 * `src/content.config.ts` guarantees ≤1 `chapter:` tag per post). Posts
 * without a chapter tag land in `unclassified`.
 *
 * Input order is preserved within each bucket so callers that pass
 * `getPublishedPosts()` output (already sorted newest-first) get
 * newest-first chapter listings automatically.
 */
export function groupPostsByChapter<T extends CurriculumPost>(
  posts: readonly T[],
): CurriculumGrouping<T> {
  const chapters = CHAPTER_SLUGS.map((slug) => ({
    slug,
    label: CHAPTER_LABELS[slug],
    posts: [] as T[],
  }));
  const unclassified: T[] = [];

  const slugIndex = new Map<string, number>(
    CHAPTER_SLUGS.map((slug, idx) => [slug, idx]),
  );

  for (const post of posts) {
    const chapterTag = post.data.tags.find((t) => t.startsWith('chapter:'));
    if (!chapterTag) {
      unclassified.push(post);
      continue;
    }
    const slug = chapterTag.slice('chapter:'.length);
    const idx = slugIndex.get(slug);
    if (idx === undefined) {
      // Unknown chapter slug. The build-time schema rejects these (#165),
      // so reaching this branch implies a schema bypass (e.g., a stale
      // test fixture). Surface the post in `unclassified` rather than
      // silently dropping it — the llms.txt consumer still sees the URL.
      unclassified.push(post);
      continue;
    }
    chapters[idx].posts.push(post);
  }

  return { chapters, unclassified };
}
