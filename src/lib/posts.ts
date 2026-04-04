import { getCollection } from 'astro:content';

type Pillar =
  | 'ai-first-thinking'
  | 'ai-in-practice'
  | 'tools-and-workflows'
  | 'behind-the-scenes';

type Series = 'ai-at-home' | 'ai-at-work' | 'ai-for-gigs' | 'ai-mindset';

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

/** Get related posts (same pillar or shared tags), excluding the given post. */
export async function getRelatedPosts(
  post: { id: string; data: { pillar: Pillar; tags: string[] } },
  limit = 3,
) {
  const posts = await getPublishedPosts();

  const scored = posts
    .filter((p) => p.id !== post.id)
    .map((p) => {
      let score = 0;
      if (p.data.pillar === post.data.pillar) score += 2;
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
