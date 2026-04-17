import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock `astro:content` before importing the module under test, so the
// virtual Astro module resolves to an in-test fake.
const getCollectionMock = vi.fn();

vi.mock('astro:content', () => ({
  getCollection: getCollectionMock,
}));

// Import after the mock is registered.
const {
  getPublishedPosts,
  getRelatedPosts,
  getPostsByPillar,
  getPostsBySeries,
  getPostsByTag,
} = await import('./posts');

type TestPost = {
  id: string;
  data: {
    title: string;
    description: string;
    date: Date;
    pillar: string;
    series?: string;
    tags: string[];
    draft: boolean;
  };
};

function post(overrides: Partial<TestPost> & { id: string }): TestPost {
  return {
    id: overrides.id,
    data: {
      title: 't',
      description: 'd',
      date: new Date(2025, 0, 1),
      pillar: 'ai-in-practice',
      tags: [],
      draft: false,
      ...overrides.data,
    },
  };
}

beforeEach(() => {
  getCollectionMock.mockReset();
});

describe('getPublishedPosts', () => {
  it('filters out drafts via the predicate', async () => {
    getCollectionMock.mockImplementation(
      async (_name: string, predicate?: (p: TestPost) => boolean) => {
        const all = [
          post({ id: 'a', data: { date: new Date(2025, 0, 1), draft: false } }),
          post({ id: 'b', data: { date: new Date(2025, 0, 2), draft: true } }),
        ];
        return predicate ? all.filter(predicate) : all;
      },
    );
    const result = await getPublishedPosts();
    expect(result.map((p) => p.id)).toEqual(['a']);
  });

  it('sorts newest first', async () => {
    getCollectionMock.mockImplementation(async () => [
      post({ id: 'old', data: { date: new Date(2020, 0, 1) } }),
      post({ id: 'new', data: { date: new Date(2026, 0, 1) } }),
      post({ id: 'mid', data: { date: new Date(2023, 0, 1) } }),
    ]);
    const result = await getPublishedPosts();
    expect(result.map((p) => p.id)).toEqual(['new', 'mid', 'old']);
  });
});

describe('getPostsByPillar / getPostsBySeries / getPostsByTag', () => {
  beforeEach(() => {
    getCollectionMock.mockImplementation(async () => [
      post({
        id: 'p1',
        data: { pillar: 'ai-in-practice', series: 'ai-at-work', tags: ['llms'] },
      }),
      post({
        id: 'p2',
        data: { pillar: 'tools-and-workflows', series: 'ai-for-gigs', tags: ['ide'] },
      }),
      post({
        id: 'p3',
        data: { pillar: 'ai-in-practice', tags: ['llms', 'rag'] },
      }),
    ]);
  });

  it('filters by pillar', async () => {
    const result = await getPostsByPillar('ai-in-practice');
    expect(result.map((p) => p.id).sort()).toEqual(['p1', 'p3']);
  });

  it('filters by series', async () => {
    const result = await getPostsBySeries('ai-at-work');
    expect(result.map((p) => p.id)).toEqual(['p1']);
  });

  it('filters by tag', async () => {
    const result = await getPostsByTag('llms');
    expect(result.map((p) => p.id).sort()).toEqual(['p1', 'p3']);
  });
});

describe('getRelatedPosts', () => {
  it('scores same-series higher than same-pillar', async () => {
    getCollectionMock.mockImplementation(async () => [
      post({
        id: 'current',
        data: { pillar: 'ai-in-practice', series: 'ai-at-work', tags: ['a'] },
      }),
      post({
        id: 'same-pillar-only',
        data: { pillar: 'ai-in-practice', tags: [] },
      }),
      post({
        id: 'same-series-only',
        data: { pillar: 'tools-and-workflows', series: 'ai-at-work', tags: [] },
      }),
    ]);
    const current = post({
      id: 'current',
      data: { pillar: 'ai-in-practice', series: 'ai-at-work', tags: ['a'] },
    });
    const result = await getRelatedPosts(current, 3);
    expect(result.map((p) => p.id)).toEqual([
      'same-series-only', // series = 4 > pillar = 2
      'same-pillar-only',
    ]);
  });

  it('counts shared tags as incremental relevance', async () => {
    getCollectionMock.mockImplementation(async () => [
      post({
        id: 'current',
        data: { pillar: 'ai-in-practice', tags: ['a', 'b'] },
      }),
      post({
        id: 'tags-only',
        data: { pillar: 'behind-the-scenes', tags: ['a', 'b'] },
      }),
      post({
        id: 'pillar-no-tags',
        data: { pillar: 'ai-in-practice', tags: [] },
      }),
    ]);
    const current = post({
      id: 'current',
      data: { pillar: 'ai-in-practice', tags: ['a', 'b'] },
    });
    const result = await getRelatedPosts(current, 3);
    // pillar-no-tags: score 2 (pillar). tags-only: score 2 (two shared tags).
    // Both qualify; tied scores fall back to original order.
    expect(result.map((p) => p.id).sort()).toEqual([
      'pillar-no-tags',
      'tags-only',
    ]);
  });

  it('excludes the post itself', async () => {
    getCollectionMock.mockImplementation(async () => [
      post({ id: 'current', data: { pillar: 'ai-in-practice', tags: ['a'] } }),
    ]);
    const current = post({
      id: 'current',
      data: { pillar: 'ai-in-practice', tags: ['a'] },
    });
    const result = await getRelatedPosts(current, 3);
    expect(result).toEqual([]);
  });

  it('returns at most `limit` results', async () => {
    getCollectionMock.mockImplementation(async () =>
      [1, 2, 3, 4, 5].map((i) =>
        post({ id: `p${i}`, data: { pillar: 'ai-in-practice' } }),
      ),
    );
    const current = post({ id: 'current', data: { pillar: 'ai-in-practice' } });
    const result = await getRelatedPosts(current, 2);
    expect(result).toHaveLength(2);
  });

  it('filters out zero-score posts (no pillar/series/tag overlap)', async () => {
    getCollectionMock.mockImplementation(async () => [
      post({
        id: 'unrelated',
        data: { pillar: 'behind-the-scenes', tags: ['other'] },
      }),
    ]);
    const current = post({
      id: 'current',
      data: { pillar: 'ai-in-practice', tags: ['rag'] },
    });
    const result = await getRelatedPosts(current, 3);
    expect(result).toEqual([]);
  });
});
