/**
 * Schema.org JSON-LD builders for SEO + AEO (answer-engine optimization).
 *
 * Three schemas are load-bearing for this site:
 *   - Organization: site-wide, injected in BaseHead
 *   - Article:      per blog post, injected in BlogPostLayout
 *   - BreadcrumbList: per blog post, injected in BlogPostLayout
 *
 * HDIAI is an Organization, not a Person. Author and publisher always
 * reference the Organization @id — no personal/founder attribution.
 *
 * Article carries optional PDR-009 § 7 namespaced-tag signals:
 *   - chapter:{slug} → isPartOf CreativeWorkSeries (name + 1-based position)
 *   - wwh:{slug}     → learningResourceType (LRMI-style Text hint)
 * This is PDR-009 S5 (machine-readable-first) riding on S1 (tag namespace).
 */

import {
  CHAPTER_LABELS,
  CHAPTER_SLUGS,
  WWH_SLUGS,
} from './taxonomy';

/**
 * Stable @id fragment for the HDIAI Organization. Referenced from Article
 * publisher/author so the schema graph stays connected across pages.
 */
export const ORGANIZATION_ID_FRAGMENT = '#organization';

/**
 * Social channel URLs for Organization `sameAs[]`.
 *
 * MUST match the channel list in `src/components/Footer.astro`. If a channel
 * is added or removed there, update this list too. The structured-data test
 * locks the expected set.
 */
export const ORGANIZATION_SAME_AS: readonly string[] = [
  'https://www.youtube.com/@Learn.How-Do-I-AI',
  'https://www.linkedin.com/company/how-do-i-ai/',
  'https://www.instagram.com/how_do_i_ai/',
  'https://www.tiktok.com/@how_do_i_ai',
  'https://www.threads.com/@how_do_i_ai',
  'https://bsky.app/profile/how-do-i.ai',
  'https://www.facebook.com/How.Do.I.AI.blog',
  'https://x.com/how_do_i_ai',
] as const;

/**
 * Organization logo: a raster image ≥112x112 per Google's guidance.
 * `apple-touch-icon.png` is 200x200 and already shipped.
 */
const ORGANIZATION_LOGO_PATH = '/brand/apple-touch-icon.png';

export interface OrganizationSchema {
  '@context': 'https://schema.org';
  '@type': 'Organization';
  '@id': string;
  name: string;
  alternateName?: string;
  url: string;
  logo: {
    '@type': 'ImageObject';
    url: string;
    width: number;
    height: number;
  };
  sameAs: readonly string[];
}

export function buildOrganizationSchema(siteUrl: URL): OrganizationSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': new URL(ORGANIZATION_ID_FRAGMENT, siteUrl).href,
    name: 'How Do I AI',
    alternateName: 'HDIAI',
    url: siteUrl.href,
    logo: {
      '@type': 'ImageObject',
      url: new URL(ORGANIZATION_LOGO_PATH, siteUrl).href,
      width: 200,
      height: 200,
    },
    sameAs: ORGANIZATION_SAME_AS,
  };
}

export interface ArticleSchemaInput {
  title: string;
  description: string;
  datePublished: Date;
  dateModified?: Date;
  url: URL;
  siteUrl: URL;
  imageUrl: URL;
  /**
   * Raw `chapter:*` slug (without prefix), e.g. `'judgment'`. Unknown slugs
   * are silently omitted rather than throwing — build-time `superRefine`
   * validation in `content.config.ts` is the editorial gate; the builder
   * stays defensive so a stale consumer cannot crash a rendered page.
   */
  chapterSlug?: string;
  /**
   * Raw `wwh:*` slug (without prefix), e.g. `'how-to-do'`. See `chapterSlug`
   * for unknown-slug rationale.
   */
  wwhSlug?: string;
}

export interface CreativeWorkSeriesRef {
  '@type': 'CreativeWorkSeries';
  name: string;
  /**
   * 1-based position of this chapter in the canonical reading order
   * (`CHAPTER_SLUGS` index + 1). First Moves = 1, … Meta-skill = 7.
   */
  position: number;
}

export interface ArticleSchema {
  '@context': 'https://schema.org';
  '@type': 'Article';
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  author: { '@type': 'Organization'; '@id': string };
  publisher: { '@type': 'Organization'; '@id': string };
  image: string;
  mainEntityOfPage: {
    '@type': 'WebPage';
    '@id': string;
  };
  isPartOf?: CreativeWorkSeriesRef;
  learningResourceType?: string;
}

/**
 * Map each `wwh:*` slug to its `learningResourceType` hint. `meta-outside`
 * carries no useful learning-resource semantics (the post is not itself a
 * learning artifact) and is mapped to `null` so the field is omitted rather
 * than emitted with a meaningless value. The remaining three are LRMI-style
 * Text values; schema.org's `learningResourceType` accepts any Text, so this
 * passes the schema.org validator — the values are interpretable hints for
 * AEO crawlers, not enumerated schema types.
 */
export const WWH_LEARNING_RESOURCE_TYPE: Record<
  (typeof WWH_SLUGS)[number],
  string | null
> = {
  'what-works': 'Assessment',
  'when-to-use': 'DecisionSupport',
  'how-to-do': 'Tutorial',
  'meta-outside': null,
};

export function buildArticleSchema(input: ArticleSchemaInput): ArticleSchema {
  const organizationRef = {
    '@type': 'Organization' as const,
    '@id': new URL(ORGANIZATION_ID_FRAGMENT, input.siteUrl).href,
  };

  const schema: ArticleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    datePublished: input.datePublished.toISOString(),
    author: organizationRef,
    publisher: organizationRef,
    image: input.imageUrl.href,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': input.url.href,
    },
  };

  if (
    input.dateModified &&
    input.dateModified.getTime() !== input.datePublished.getTime()
  ) {
    schema.dateModified = input.dateModified.toISOString();
  }

  if (input.chapterSlug) {
    const idx = (CHAPTER_SLUGS as readonly string[]).indexOf(input.chapterSlug);
    if (idx >= 0) {
      const slug = input.chapterSlug as (typeof CHAPTER_SLUGS)[number];
      schema.isPartOf = {
        '@type': 'CreativeWorkSeries',
        name: CHAPTER_LABELS[slug],
        position: idx + 1,
      };
    }
  }

  if (
    input.wwhSlug &&
    (WWH_SLUGS as readonly string[]).includes(input.wwhSlug)
  ) {
    const slug = input.wwhSlug as (typeof WWH_SLUGS)[number];
    const type = WWH_LEARNING_RESOURCE_TYPE[slug];
    if (type !== null) {
      schema.learningResourceType = type;
    }
  }

  return schema;
}

export interface BreadcrumbItem {
  name: string;
  url: URL;
}

export interface BreadcrumbListSchema {
  '@context': 'https://schema.org';
  '@type': 'BreadcrumbList';
  itemListElement: {
    '@type': 'ListItem';
    position: number;
    name: string;
    item: string;
  }[];
}

export function buildBreadcrumbListSchema(
  items: BreadcrumbItem[],
): BreadcrumbListSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.href,
    })),
  };
}
