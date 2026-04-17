import { getCollection } from 'astro:content';
import type { PillarSlug, SeriesSlug } from './taxonomy';

type Pillar = PillarSlug;
type Series = SeriesSlug;

function sortByDateDesc<T extends { data: { date: Date } }>(posts: T[]): T[] {
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Get all non-draft posts sorted by date descending. */
export async function getPublishedPosts() {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return sortByDateDesc(posts);
}

/** Filter published posts by pillar. */
export async function getPostsByPillar(pillar: Pillar) {
  const posts = await getPublishedPosts();
  return posts.filter((post) => post.data.pillar === pillar);
}

/** Filter published posts by series. */
export async function getPostsBySeries(series: Series) {
  const posts = await getPublishedPosts();
  return posts.filter((post) => post.data.series === series);
}

/** Filter published posts by tag. */
export async function getPostsByTag(tag: string) {
  const posts = await getPublishedPosts();
  return posts.filter((post) => post.data.tags.includes(tag));
}

/**
 * Get related posts, prioritising same-series > same-pillar > shared tags.
 * Excludes the given post. Returns at most `limit` results; if fewer than
 * `limit` qualify, returns only those (no unrelated padding).
 */
export async function getRelatedPosts(
  post: {
    id: string;
    data: { pillar: Pillar; series?: Series; tags: string[] };
  },
  limit = 3,
) {
  const posts = await getPublishedPosts();

  const scored = posts
    .filter((p) => p.id !== post.id)
    .map((p) => {
      let score = 0;
      // Same series is the strongest signal.
      if (post.data.series && p.data.series === post.data.series) score += 4;
      // Same pillar is the next signal.
      if (p.data.pillar === post.data.pillar) score += 2;
      // Shared tags add incremental relevance.
      const sharedTags = p.data.tags.filter((t) =>
        post.data.tags.includes(t),
      ).length;
      score += sharedTags;
      return { post: p, score };
    })
    .filter(({ score }) => score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ post }) => post);
}
