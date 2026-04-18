import { describe, it, expect } from 'vitest';
import {
  buildOrganizationSchema,
  buildArticleSchema,
  buildBreadcrumbListSchema,
  ORGANIZATION_SAME_AS,
} from './structured-data';

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
      'https://www.youtube.com/@Learn.How-Do-I-AI',
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
