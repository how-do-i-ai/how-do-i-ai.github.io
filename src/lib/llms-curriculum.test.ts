import { describe, it, expect } from 'vitest';

import { CHAPTER_SLUGS } from './taxonomy';
import { groupPostsByChapter, type CurriculumPost } from './llms-curriculum';

function post(
  id: string,
  tags: string[] = [],
  title = `post-${id}`,
): CurriculumPost {
  return { id, data: { title, tags } };
}

describe('groupPostsByChapter', () => {
  it('returns a chapter slot for every CHAPTER_SLUGS entry, in declaration order', () => {
    const { chapters } = groupPostsByChapter([]);
    expect(chapters.map((c) => c.slug)).toEqual([...CHAPTER_SLUGS]);
  });

  it('routes posts to the chapter matching their chapter: tag', () => {
    const { chapters, unclassified } = groupPostsByChapter([
      post('a', ['chapter:first-moves']),
      post('b', ['chapter:judgment']),
      post('c', ['chapter:first-moves', 'topic']),
    ]);
    const bySlug = Object.fromEntries(
      chapters.map((c) => [c.slug, c.posts.map((p) => p.id)]),
    );
    expect(bySlug['first-moves']).toEqual(['a', 'c']);
    expect(bySlug['judgment']).toEqual(['b']);
    expect(unclassified).toEqual([]);
  });

  it('preserves input order within a chapter bucket', () => {
    const { chapters } = groupPostsByChapter([
      post('newest', ['chapter:workflow']),
      post('middle', ['chapter:workflow']),
      post('oldest', ['chapter:workflow']),
    ]);
    const workflow = chapters.find((c) => c.slug === 'workflow')!;
    expect(workflow.posts.map((p) => p.id)).toEqual([
      'newest',
      'middle',
      'oldest',
    ]);
  });

  it('sends posts without a chapter: tag to unclassified', () => {
    const { chapters, unclassified } = groupPostsByChapter([
      post('a', ['topic', 'wwh:how-to-do']),
      post('b', []),
    ]);
    expect(unclassified.map((p) => p.id)).toEqual(['a', 'b']);
    expect(chapters.every((c) => c.posts.length === 0)).toBe(true);
  });

  it('sends posts with an unknown chapter slug to unclassified (defensive; schema normally rejects these)', () => {
    const { chapters, unclassified } = groupPostsByChapter([
      post('bogus', ['chapter:not-a-real-chapter']),
    ]);
    expect(unclassified.map((p) => p.id)).toEqual(['bogus']);
    expect(chapters.every((c) => c.posts.length === 0)).toBe(true);
  });

  it('attaches the human-readable label from CHAPTER_LABELS to each chapter', () => {
    const { chapters } = groupPostsByChapter([]);
    const firstMoves = chapters.find((c) => c.slug === 'first-moves')!;
    expect(firstMoves.label).toBe('First Moves');
  });
});
