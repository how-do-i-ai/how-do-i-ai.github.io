import { describe, it, expect } from 'vitest';
import {
  RESERVED_NAMESPACES,
  isNamespacedTag,
  partitionTags,
} from './taxonomy';

describe('RESERVED_NAMESPACES', () => {
  it('includes the two PDR-009 namespaces', () => {
    expect(RESERVED_NAMESPACES).toEqual(['chapter', 'wwh']);
  });
});

describe('isNamespacedTag', () => {
  it('returns true for chapter:* tags', () => {
    expect(isNamespacedTag('chapter:first-moves')).toBe(true);
    expect(isNamespacedTag('chapter:judgment')).toBe(true);
    expect(isNamespacedTag('chapter:meta-skill')).toBe(true);
  });

  it('returns true for wwh:* tags', () => {
    expect(isNamespacedTag('wwh:what-works')).toBe(true);
    expect(isNamespacedTag('wwh:when-to-use')).toBe(true);
    expect(isNamespacedTag('wwh:how-to-do')).toBe(true);
    expect(isNamespacedTag('wwh:meta-outside')).toBe(true);
  });

  it('returns false for free-form tags without a colon', () => {
    expect(isNamespacedTag('automation')).toBe(false);
    expect(isNamespacedTag('rag')).toBe(false);
    expect(isNamespacedTag('getting-started')).toBe(false);
  });

  it('returns false for tags whose namespace is not reserved', () => {
    expect(isNamespacedTag('foo:bar')).toBe(false);
    expect(isNamespacedTag('series:ai-at-work')).toBe(false);
    expect(isNamespacedTag('pillar:practice')).toBe(false);
  });

  it('returns false when the namespace prefix is empty', () => {
    expect(isNamespacedTag(':judgment')).toBe(false);
  });

  it('returns false when the slug suffix is empty', () => {
    expect(isNamespacedTag('chapter:')).toBe(false);
    expect(isNamespacedTag('wwh:')).toBe(false);
  });

  it('returns false for the empty string', () => {
    expect(isNamespacedTag('')).toBe(false);
  });

  it('is case-sensitive on the namespace prefix', () => {
    // Slugs are lowercase per taxonomy.ts; "Chapter:Foo" is not reserved.
    // W-G (Zod superRefine, #165) enforces casing for namespaced tags.
    expect(isNamespacedTag('Chapter:judgment')).toBe(false);
    expect(isNamespacedTag('WWH:what-works')).toBe(false);
  });

  it('treats only the FIRST colon as the namespace separator', () => {
    // Slug-side validation (kebab-case + membership) is W-G's job; the
    // prefix-only test here keeps the predicate cheap and stable when
    // future slugs change.
    expect(isNamespacedTag('chapter:foo:bar')).toBe(true);
  });
});

describe('partitionTags', () => {
  it('returns empty groups for an empty tag list', () => {
    expect(partitionTags([])).toEqual({ namespaced: [], freeForm: [] });
  });

  it('routes all tags to freeForm when none are namespaced', () => {
    expect(partitionTags(['automation', 'rag', 'getting-started'])).toEqual({
      namespaced: [],
      freeForm: ['automation', 'rag', 'getting-started'],
    });
  });

  it('routes all tags to namespaced when every tag is namespaced', () => {
    expect(partitionTags(['chapter:first-moves', 'wwh:what-works'])).toEqual({
      namespaced: ['chapter:first-moves', 'wwh:what-works'],
      freeForm: [],
    });
  });

  it('splits a mixed list of namespaced and free-form tags', () => {
    const tags = [
      'automation',
      'chapter:judgment',
      'rag',
      'wwh:how-to-do',
      'workflows',
    ];
    expect(partitionTags(tags)).toEqual({
      namespaced: ['chapter:judgment', 'wwh:how-to-do'],
      freeForm: ['automation', 'rag', 'workflows'],
    });
  });

  it('preserves input order within each group', () => {
    const tags = [
      'wwh:meta-outside',
      'b',
      'chapter:meta-skill',
      'a',
      'chapter:judgment',
    ];
    const { namespaced, freeForm } = partitionTags(tags);
    expect(namespaced).toEqual([
      'wwh:meta-outside',
      'chapter:meta-skill',
      'chapter:judgment',
    ]);
    expect(freeForm).toEqual(['b', 'a']);
  });

  it('treats unreserved-namespace tags as free-form', () => {
    expect(partitionTags(['foo:bar', 'pillar:practice'])).toEqual({
      namespaced: [],
      freeForm: ['foo:bar', 'pillar:practice'],
    });
  });

  describe('REQ-CONTENT-MODEL-03 cap-exclusion scenarios (#168)', () => {
    // These three cases mirror the post-card AC: the freeForm count drives
    // the existing "3 visible + '+N more'" cap on `TagList`; the namespaced
    // count drives the dedicated badge surface (W-H scope, #166). Both
    // numbers must be correct for the cap-exclusion semantic to hold.

    it('AC1 — 3 free-form + 2 namespaced ⇒ 3 free-form (no +N), 2 namespaced', () => {
      const { freeForm, namespaced } = partitionTags([
        'automation',
        'chapter:first-moves',
        'rag',
        'wwh:what-works',
        'workflows',
      ]);
      // freeForm.length === 3 (== TagList MAX_VISIBLE) ⇒ no "+N more"
      expect(freeForm).toHaveLength(3);
      expect(namespaced).toHaveLength(2);
    });

    it('AC2 — 5 free-form + 1 namespaced ⇒ 3 visible + "+2 more", 1 namespaced', () => {
      const { freeForm, namespaced } = partitionTags([
        'a',
        'b',
        'c',
        'chapter:judgment',
        'd',
        'e',
      ]);
      // freeForm.length === 5 ⇒ TagList renders 3 visible + "+2 more"
      expect(freeForm).toHaveLength(5);
      expect(namespaced).toHaveLength(1);
    });

    it('AC3 — only namespaced tags ⇒ 0 free-form (no TagList), 2 namespaced', () => {
      const { freeForm, namespaced } = partitionTags([
        'chapter:meta-skill',
        'wwh:meta-outside',
      ]);
      expect(freeForm).toHaveLength(0);
      expect(namespaced).toHaveLength(2);
    });
  });
});
