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
 */

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
}

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
