import { describe, it, expect } from 'vitest';
import {
  buildOrganizationSchema,
  buildArticleSchema,
  buildBreadcrumbListSchema,
  ORGANIZATION_SAME_AS,
  WWH_LEARNING_RESOURCE_TYPE,
} from './structured-data';
import { CHAPTER_SLUGS, WWH_SLUGS } from './taxonomy';

const SITE_URL = new URL('https://how-do-i.ai/');

describe('buildOrganizationSchema', () => {
  it('returns a valid Organization schema with required fields', () => {
    const schema = buildOrganizationSchema(SITE_URL);
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('Organization');
    expect(schema.name).toBe('How Do I AI');
    expect(schema.url).toBe('https://how-do-i.ai/');
  });

  it('uses a stable @id fragment on the site URL', () => {
    const schema = buildOrganizationSchema(SITE_URL);
    expect(schema['@id']).toBe('https://how-do-i.ai/#organization');
  });

  it('resolves logo to an absolute URL meeting Google minimum size', () => {
    const schema = buildOrganizationSchema(SITE_URL);
    expect(schema.logo.url).toBe(
      'https://how-do-i.ai/brand/apple-touch-icon.png',
    );
    expect(schema.logo.width).toBeGreaterThanOrEqual(112);
    expect(schema.logo.height).toBeGreaterThanOrEqual(112);
  });

  it('includes all 8 HDIAI social channels in sameAs[]', () => {
    const schema = buildOrganizationSchema(SITE_URL);
    expect(schema.sameAs).toHaveLength(8);
    expect(schema.sameAs).toEqual(ORGANIZATION_SAME_AS);
  });

  it('locks the canonical channel URL set (in sync with Footer.astro)', () => {
    expect(ORGANIZATION_SAME_AS).toEqual([
      'https://www.youtube.com/@Ask.How-Do-I-AI',
      'https://www.linkedin.com/company/how-do-i-ai/',
      'https://www.instagram.com/how_do_i_ai/',
      'https://www.tiktok.com/@how_do_i_ai',
      'https://www.threads.com/@how_do_i_ai',
      'https://bsky.app/profile/how-do-i.ai',
      'https://www.facebook.com/How.Do.I.AI.blog',
      'https://x.com/how_do_i_ai',
    ]);
  });
});

describe('buildArticleSchema', () => {
  const baseInput = {
    title: 'Sample Post',
    description: 'A test article.',
    datePublished: new Date('2025-01-15T00:00:00Z'),
    url: new URL('https://how-do-i.ai/blog/sample-post/'),
    siteUrl: SITE_URL,
    imageUrl: new URL('https://how-do-i.ai/brand/og-default.png'),
  };

  it('returns a valid Article schema with required fields', () => {
    const schema = buildArticleSchema(baseInput);
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('Article');
    expect(schema.headline).toBe('Sample Post');
    expect(schema.description).toBe('A test article.');
    expect(schema.datePublished).toBe('2025-01-15T00:00:00.000Z');
    expect(schema.image).toBe('https://how-do-i.ai/brand/og-default.png');
  });

  it('attributes author to the Organization, NOT a Person', () => {
    const schema = buildArticleSchema(baseInput);
    expect(schema.author['@type']).toBe('Organization');
    expect(schema.author['@id']).toBe('https://how-do-i.ai/#organization');
  });

  it('attributes publisher to the Organization, NOT a Person', () => {
    const schema = buildArticleSchema(baseInput);
    expect(schema.publisher['@type']).toBe('Organization');
    expect(schema.publisher['@id']).toBe('https://how-do-i.ai/#organization');
  });

  it('sets mainEntityOfPage to the absolute post URL', () => {
    const schema = buildArticleSchema(baseInput);
    expect(schema.mainEntityOfPage['@type']).toBe('WebPage');
    expect(schema.mainEntityOfPage['@id']).toBe(
      'https://how-do-i.ai/blog/sample-post/',
    );
  });

  it('omits dateModified when not provided', () => {
    const schema = buildArticleSchema(baseInput);
    expect(schema.dateModified).toBeUndefined();
  });

  it('omits dateModified when equal to datePublished', () => {
    const schema = buildArticleSchema({
      ...baseInput,
      dateModified: new Date('2025-01-15T00:00:00Z'),
    });
    expect(schema.dateModified).toBeUndefined();
  });

  it('includes dateModified when different from datePublished', () => {
    const schema = buildArticleSchema({
      ...baseInput,
      dateModified: new Date('2025-03-01T00:00:00Z'),
    });
    expect(schema.dateModified).toBe('2025-03-01T00:00:00.000Z');
  });

  // ---- PDR-009 § 7 namespaced-tag → JSON-LD signals ------------------------

  describe('chapter:* → isPartOf CreativeWorkSeries', () => {
    it('emits isPartOf with the chapter label and 1-based position', () => {
      const schema = buildArticleSchema({
        ...baseInput,
        chapterSlug: 'judgment',
      });
      expect(schema.isPartOf).toEqual({
        '@type': 'CreativeWorkSeries',
        name: 'Judgment',
        position: 4,
      });
    });

    it('assigns position 1 to the first chapter (first-moves)', () => {
      const schema = buildArticleSchema({
        ...baseInput,
        chapterSlug: 'first-moves',
      });
      expect(schema.isPartOf?.position).toBe(1);
      expect(schema.isPartOf?.name).toBe('First Moves');
    });

    it('assigns position 7 to the last chapter (meta-skill)', () => {
      const schema = buildArticleSchema({
        ...baseInput,
        chapterSlug: 'meta-skill',
      });
      expect(schema.isPartOf?.position).toBe(7);
      expect(schema.isPartOf?.name).toBe('Meta-skill');
    });

    it('covers every CHAPTER_SLUGS entry with a unique position', () => {
      const positions = CHAPTER_SLUGS.map((slug) => {
        const schema = buildArticleSchema({ ...baseInput, chapterSlug: slug });
        expect(schema.isPartOf).toBeDefined();
        return schema.isPartOf!.position;
      });
      expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(new Set(positions).size).toBe(positions.length);
    });

    it('omits isPartOf when chapterSlug is not provided', () => {
      const schema = buildArticleSchema(baseInput);
      expect(schema.isPartOf).toBeUndefined();
    });

    it('omits isPartOf for unknown chapter slugs (defensive)', () => {
      const schema = buildArticleSchema({
        ...baseInput,
        chapterSlug: 'not-a-real-chapter',
      });
      expect(schema.isPartOf).toBeUndefined();
    });
  });

  describe('wwh:* → learningResourceType', () => {
    it('maps wwh:how-to-do to learningResourceType "Tutorial"', () => {
      const schema = buildArticleSchema({
        ...baseInput,
        wwhSlug: 'how-to-do',
      });
      expect(schema.learningResourceType).toBe('Tutorial');
    });

    it('maps wwh:what-works to learningResourceType "Assessment"', () => {
      const schema = buildArticleSchema({
        ...baseInput,
        wwhSlug: 'what-works',
      });
      expect(schema.learningResourceType).toBe('Assessment');
    });

    it('maps wwh:when-to-use to learningResourceType "DecisionSupport"', () => {
      const schema = buildArticleSchema({
        ...baseInput,
        wwhSlug: 'when-to-use',
      });
      expect(schema.learningResourceType).toBe('DecisionSupport');
    });

    it('omits learningResourceType for wwh:meta-outside', () => {
      const schema = buildArticleSchema({
        ...baseInput,
        wwhSlug: 'meta-outside',
      });
      expect(schema.learningResourceType).toBeUndefined();
    });

    it('omits learningResourceType when wwhSlug is not provided', () => {
      const schema = buildArticleSchema(baseInput);
      expect(schema.learningResourceType).toBeUndefined();
    });

    it('omits learningResourceType for unknown wwh slugs (defensive)', () => {
      const schema = buildArticleSchema({
        ...baseInput,
        wwhSlug: 'not-a-real-wwh',
      });
      expect(schema.learningResourceType).toBeUndefined();
    });

    it('covers every WWH_SLUGS entry in the mapping table', () => {
      for (const slug of WWH_SLUGS) {
        expect(WWH_LEARNING_RESOURCE_TYPE).toHaveProperty(slug);
      }
    });
  });

  describe('backward compatibility', () => {
    it('emits unchanged JSON-LD when no namespaced tags are provided', () => {
      // Baseline schema snapshot: no isPartOf, no learningResourceType,
      // matching the pre-PDR-009 shape exactly.
      const schema = buildArticleSchema(baseInput);
      expect(schema).toEqual({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Sample Post',
        description: 'A test article.',
        datePublished: '2025-01-15T00:00:00.000Z',
        author: {
          '@type': 'Organization',
          '@id': 'https://how-do-i.ai/#organization',
        },
        publisher: {
          '@type': 'Organization',
          '@id': 'https://how-do-i.ai/#organization',
        },
        image: 'https://how-do-i.ai/brand/og-default.png',
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': 'https://how-do-i.ai/blog/sample-post/',
        },
      });
      expect('isPartOf' in schema).toBe(false);
      expect('learningResourceType' in schema).toBe(false);
    });
  });

  describe('combined chapter + wwh emission', () => {
    it('emits both isPartOf and learningResourceType on the same Article', () => {
      const schema = buildArticleSchema({
        ...baseInput,
        chapterSlug: 'workflow',
        wwhSlug: 'how-to-do',
      });
      expect(schema.isPartOf).toEqual({
        '@type': 'CreativeWorkSeries',
        name: 'Workflow',
        position: 5,
      });
      expect(schema.learningResourceType).toBe('Tutorial');
    });
  });
});

describe('buildBreadcrumbListSchema', () => {
  it('returns a valid BreadcrumbList schema', () => {
    const schema = buildBreadcrumbListSchema([
      { name: 'Home', url: new URL('https://how-do-i.ai/') },
      { name: 'Blog', url: new URL('https://how-do-i.ai/blog/') },
      { name: 'Sample', url: new URL('https://how-do-i.ai/blog/sample/') },
    ]);
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('BreadcrumbList');
    expect(schema.itemListElement).toHaveLength(3);
  });

  it('assigns 1-based positions to items in order', () => {
    const schema = buildBreadcrumbListSchema([
      { name: 'Home', url: new URL('https://how-do-i.ai/') },
      { name: 'Blog', url: new URL('https://how-do-i.ai/blog/') },
      { name: 'Sample', url: new URL('https://how-do-i.ai/blog/sample/') },
    ]);
    expect(schema.itemListElement[0].position).toBe(1);
    expect(schema.itemListElement[1].position).toBe(2);
    expect(schema.itemListElement[2].position).toBe(3);
  });

  it('renders item URLs as absolute strings', () => {
    const schema = buildBreadcrumbListSchema([
      { name: 'Home', url: new URL('https://how-do-i.ai/') },
      { name: 'Blog', url: new URL('https://how-do-i.ai/blog/') },
    ]);
    expect(schema.itemListElement[0].item).toBe('https://how-do-i.ai/');
    expect(schema.itemListElement[1].item).toBe('https://how-do-i.ai/blog/');
  });
});
