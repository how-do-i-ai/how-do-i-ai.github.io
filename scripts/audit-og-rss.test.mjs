// Unit tests for scripts/audit-og-rss.mjs (QA-10.5 OG meta + RSS 2.0
// audit). Drives the normalization, extraction, and audit logic
// through in-memory HTML / XML / frontmatter fixtures so the
// reverse-test AC (modifying an OG title in BaseHead.astro without
// updating frontmatter — or vice versa — produces a diff-style
// failure) has an automated enforcement point.

import { describe, it, expect } from 'vitest';
import {
  decodeHtmlEntities,
  normalizeText,
  stripSiteNameSuffix,
  normalizeUrl,
  slugFromBlogUrl,
  urlFromDistHtmlPath,
  extractHtmlMeta,
  auditOg,
  parseRss,
  auditRss,
  SITE,
  SITE_NAME_SUFFIX,
} from './audit-og-rss.mjs';

// --- decodeHtmlEntities ---------------------------------------------

describe('decodeHtmlEntities', () => {
  it('decodes the named entities Astro emits in meta content', () => {
    expect(decodeHtmlEntities('a &amp; b')).toBe('a & b');
    expect(decodeHtmlEntities('a &lt;b&gt; c')).toBe('a <b> c');
    expect(decodeHtmlEntities('it&apos;s')).toBe("it's");
    expect(decodeHtmlEntities('&quot;x&quot;')).toBe('"x"');
    // &nbsp; decodes to U+00A0 (non-breaking space). Downstream
    // normalizeText collapses it to ASCII space along with any other
    // whitespace (verified below), which is where the audit's comparison
    // semantics live.
    expect(decodeHtmlEntities('non&nbsp;break')).toBe('non break');
  });

  it('decodes &nbsp; such that normalizeText collapses it to an ASCII space', () => {
    expect(normalizeText('non&nbsp;break')).toBe('non break');
  });

  it('decodes decimal numeric entities', () => {
    expect(decodeHtmlEntities('it&#39;s')).toBe("it's");
    expect(decodeHtmlEntities('a&#38;b')).toBe('a&b');
  });

  it('decodes hexadecimal numeric entities', () => {
    expect(decodeHtmlEntities('it&#x27;s')).toBe("it's");
    expect(decodeHtmlEntities('a&#x26;b')).toBe('a&b');
  });

  it('passes unknown named entities through unchanged', () => {
    expect(decodeHtmlEntities('caf&oacute;')).toBe('caf&oacute;');
  });

  it('is a no-op on empty / non-string input', () => {
    expect(decodeHtmlEntities('')).toBe('');
    expect(decodeHtmlEntities(null)).toBeNull();
    expect(decodeHtmlEntities(undefined)).toBeUndefined();
  });
});

// --- normalizeText --------------------------------------------------

describe('normalizeText', () => {
  it('HTML-decodes, NFC-normalizes, collapses whitespace, and trims', () => {
    expect(normalizeText('  a &amp; b  ')).toBe('a & b');
    expect(normalizeText('a\t\n  b')).toBe('a b');
    expect(normalizeText('   ')).toBe('');
  });

  it('treats NFD vs NFC as equal via normalization', () => {
    const nfd = 'café'; // "café" in NFD form
    const nfc = 'café';
    expect(normalizeText(nfd)).toBe(normalizeText(nfc));
  });

  it('returns empty string for null / undefined / non-string input', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText(42)).toBe('');
  });
});

// --- stripSiteNameSuffix --------------------------------------------

describe('stripSiteNameSuffix', () => {
  it('strips the configured site-name suffix when present', () => {
    expect(
      stripSiteNameSuffix(
        'Building Your First AI-Assisted Workflow | How Do I AI',
      ),
    ).toBe('Building Your First AI-Assisted Workflow');
  });

  it('returns the normalized input unchanged when the suffix is absent', () => {
    expect(stripSiteNameSuffix('How Do I AI')).toBe('How Do I AI');
    expect(stripSiteNameSuffix('About How Do I AI?')).toBe(
      'About How Do I AI?',
    );
  });

  it('strips the suffix even when the input has HTML-encoded entities', () => {
    // Astro encodes apostrophes in attribute values: `&apos;` / `&#x27;`.
    expect(stripSiteNameSuffix('Don&apos;t miss the point | How Do I AI')).toBe(
      "Don't miss the point",
    );
  });

  it('accepts a custom suffix', () => {
    expect(stripSiteNameSuffix('Post — Site', ' — Site')).toBe('Post');
  });
});

// --- normalizeUrl ----------------------------------------------------

describe('normalizeUrl', () => {
  it('resolves relative URLs against the configured site', () => {
    expect(normalizeUrl('/blog/foo/')).toBe('https://how-do-i.ai/blog/foo/');
    expect(normalizeUrl('/blog/foo')).toBe('https://how-do-i.ai/blog/foo/');
  });

  it('normalizes absolute URLs to trailing-slash form', () => {
    expect(normalizeUrl('https://how-do-i.ai/blog/foo')).toBe(
      'https://how-do-i.ai/blog/foo/',
    );
    expect(normalizeUrl('https://how-do-i.ai/blog/foo/')).toBe(
      'https://how-do-i.ai/blog/foo/',
    );
  });

  it('preserves file-extension paths without forcing a trailing slash', () => {
    expect(normalizeUrl('/404.html')).toBe('https://how-do-i.ai/404.html');
  });

  it('returns null for unparseable input', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(undefined)).toBeNull();
    // A plain 'not a url' string resolves to the site origin under URL()
    // semantics, so it is NOT null — this behaviour matches the way the
    // audit treats recovered relative paths.
  });
});

// --- slugFromBlogUrl + urlFromDistHtmlPath --------------------------

describe('slugFromBlogUrl', () => {
  it('extracts the slug from /blog/<slug>/ URLs', () => {
    expect(slugFromBlogUrl('/blog/sample-post/')).toBe('sample-post');
    expect(slugFromBlogUrl('/blog/foo/')).toBe('foo');
    expect(slugFromBlogUrl('https://how-do-i.ai/blog/sample-post/')).toBe(
      'sample-post',
    );
  });

  it('also matches trailing-slashless variants', () => {
    expect(slugFromBlogUrl('/blog/sample-post')).toBe('sample-post');
  });

  it('returns null for non-blog-post URLs', () => {
    expect(slugFromBlogUrl('/')).toBeNull();
    expect(slugFromBlogUrl('/about/')).toBeNull();
    expect(slugFromBlogUrl('/blog/')).toBeNull();
    expect(slugFromBlogUrl('/blog/foo/bar/')).toBeNull();
    expect(slugFromBlogUrl('')).toBeNull();
  });
});

describe('urlFromDistHtmlPath', () => {
  it('maps dist directory index.html paths to directory URLs', () => {
    expect(urlFromDistHtmlPath('/repo/dist/index.html', '/repo/dist')).toBe(
      '/',
    );
    expect(
      urlFromDistHtmlPath('/repo/dist/blog/index.html', '/repo/dist'),
    ).toBe('/blog/');
    expect(
      urlFromDistHtmlPath(
        '/repo/dist/blog/sample-post/index.html',
        '/repo/dist',
      ),
    ).toBe('/blog/sample-post/');
  });

  it('preserves explicit .html paths (e.g., 404.html)', () => {
    expect(urlFromDistHtmlPath('/repo/dist/404.html', '/repo/dist')).toBe(
      '/404.html',
    );
  });
});

// --- extractHtmlMeta ------------------------------------------------

const BLOG_HTML_OK = `
  <html>
    <head>
      <meta name="description" content="The description">
      <link rel="canonical" href="https://how-do-i.ai/blog/sample/">
      <meta property="og:title" content="Sample Title | How Do I AI">
      <meta property="og:description" content="The description">
      <meta property="og:type" content="website">
      <meta property="og:url" content="https://how-do-i.ai/blog/sample/">
      <meta property="og:image" content="https://how-do-i.ai/brand/og-default.png">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="Sample Title | How Do I AI">
      <meta name="twitter:description" content="The description">
      <meta name="twitter:image" content="https://how-do-i.ai/brand/og-default.png">
      <title>Sample Title | How Do I AI</title>
    </head>
    <body></body>
  </html>
`;

describe('extractHtmlMeta', () => {
  it('extracts all canonical fields from a well-formed blog-post HTML', () => {
    const meta = extractHtmlMeta(BLOG_HTML_OK);
    expect(meta.ogTitle).toBe('Sample Title | How Do I AI');
    expect(meta.htmlTitle).toBe('Sample Title | How Do I AI');
    expect(meta.ogDescription).toBe('The description');
    expect(meta.metaDescription).toBe('The description');
    expect(meta.ogType).toBe('website');
    expect(meta.ogUrl).toBe('https://how-do-i.ai/blog/sample/');
    expect(meta.ogImage).toBe('https://how-do-i.ai/brand/og-default.png');
    expect(meta.twitterCard).toBe('summary_large_image');
    expect(meta.canonical).toBe('https://how-do-i.ai/blog/sample/');
  });

  it('reports all required-tag presence as true when every tag is emitted', () => {
    const meta = extractHtmlMeta(BLOG_HTML_OK);
    for (const key of Object.keys(meta.presence)) {
      expect(meta.presence[key]).toBe(true);
    }
  });

  it('reports missing tags as presence=false', () => {
    const html = '<html><head><title>Only title</title></head></html>';
    const meta = extractHtmlMeta(html);
    expect(meta.presence['og:title']).toBe(false);
    expect(meta.presence['<title>']).toBe(true);
    expect(meta.ogTitle).toBeNull();
    expect(meta.htmlTitle).toBe('Only title');
  });
});

// --- auditOg --------------------------------------------------------

function mkPost(overrides = {}) {
  return {
    slug: 'sample',
    title: 'Sample Title',
    description: 'The description',
    date: new Date('2025-01-15'),
    source_file: 'src/content/blog/sample.md',
    ...overrides,
  };
}

function mkHtmlPage(overrides = {}) {
  return {
    relPath: overrides.relPath ?? 'dist/blog/sample/index.html',
    url: overrides.url ?? '/blog/sample/',
    html: overrides.html ?? BLOG_HTML_OK,
  };
}

describe('auditOg', () => {
  it('produces zero violations for a well-formed blog post matching frontmatter', () => {
    const posts = new Map([['sample', mkPost()]]);
    const result = auditOg([mkHtmlPage()], posts);
    expect(result.violations).toEqual([]);
    expect(result.perPage[0].is_blog_post).toBe(true);
    expect(result.perPage[0].slug).toBe('sample');
  });

  it('surfaces missing required tags on any page (structural check)', () => {
    const posts = new Map();
    const html = `
      <html><head><title>Minimal</title></head></html>
    `;
    const result = auditOg(
      [mkHtmlPage({ relPath: 'dist/x.html', url: '/x.html', html })],
      posts,
    );
    const missing = result.violations.filter((v) => v.kind === 'missing_tag');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.find((v) => v.field === 'og:title')).toBeDefined();
    expect(missing.find((v) => v.field === 'canonical')).toBeDefined();
  });

  it('flags a twitter:card value other than summary_large_image', () => {
    const html = BLOG_HTML_OK.replace(
      'content="summary_large_image"',
      'content="summary"',
    );
    const posts = new Map([['sample', mkPost()]]);
    const result = auditOg([mkHtmlPage({ html })], posts);
    const v = result.violations.find((x) => x.kind === 'twitter_card_value');
    expect(v).toBeDefined();
    expect(v.expected).toBe('summary_large_image');
    expect(v.actual).toBe('summary');
  });

  it('surfaces OG title drift against frontmatter with a diff-style report', () => {
    // Reverse-test AC: OG title changed in rendered HTML without a
    // matching frontmatter update.
    const html = BLOG_HTML_OK.replace(
      'content="Sample Title | How Do I AI"',
      'content="DIFFERENT Title | How Do I AI"',
    );
    const posts = new Map([['sample', mkPost()]]);
    const result = auditOg([mkHtmlPage({ html })], posts);
    const v = result.violations.find((x) => x.kind === 'og_title_mismatch');
    expect(v).toBeDefined();
    expect(v.field).toBe('og:title');
    expect(v.expected).toContain('Sample Title');
    expect(v.actual).toContain('DIFFERENT Title');
    expect(v.page).toBe('dist/blog/sample/index.html');
    expect(v.url).toBe('/blog/sample/');
  });

  it('surfaces frontmatter title drift against rendered OG title (reverse direction)', () => {
    // Reverse-test AC, reversed: frontmatter edited without re-rendering.
    const posts = new Map([
      ['sample', mkPost({ title: 'New Frontmatter Title' })],
    ]);
    const result = auditOg([mkHtmlPage()], posts);
    const v = result.violations.find((x) => x.kind === 'og_title_mismatch');
    expect(v).toBeDefined();
    expect(v.expected).toContain('New Frontmatter Title');
    expect(v.actual).toContain('Sample Title');
  });

  it('surfaces OG description drift against frontmatter', () => {
    const html = BLOG_HTML_OK.replaceAll(
      '"The description"',
      '"A DIFFERENT description"',
    );
    const posts = new Map([['sample', mkPost()]]);
    const result = auditOg([mkHtmlPage({ html })], posts);
    const v = result.violations.find(
      (x) => x.kind === 'og_description_mismatch',
    );
    expect(v).toBeDefined();
    expect(v.expected).toContain('The description');
    expect(v.actual).toContain('A DIFFERENT description');
  });

  it('surfaces og:title vs <title> drift when they share a page but differ', () => {
    // Simulates a template bug where the two fields desynchronize.
    const html = BLOG_HTML_OK.replace(
      '<title>Sample Title | How Do I AI</title>',
      '<title>Out-of-sync | How Do I AI</title>',
    );
    const posts = new Map([['sample', mkPost()]]);
    const result = auditOg([mkHtmlPage({ html })], posts);
    const v = result.violations.find((x) => x.kind === 'og_html_title_drift');
    expect(v).toBeDefined();
    expect(v.expected).toContain('Out-of-sync');
    expect(v.actual).toContain('Sample Title');
  });

  it('flags blog URLs that do not resolve to a source post (orphan blog page)', () => {
    const posts = new Map();
    const result = auditOg([mkHtmlPage()], posts);
    const v = result.violations.find((x) => x.kind === 'orphan_blog_page');
    expect(v).toBeDefined();
  });

  it('skips cross-reference for non-blog pages', () => {
    const posts = new Map();
    const result = auditOg(
      [
        mkHtmlPage({
          relPath: 'dist/about/index.html',
          url: '/about/',
          // About page has its own descriptions, no frontmatter source.
          html: BLOG_HTML_OK,
        }),
      ],
      posts,
    );
    // No cross-reference should fire; only twitter_card etc structural
    // checks apply. Given BLOG_HTML_OK has all structural tags, the
    // non-blog page should have 0 violations.
    expect(result.violations).toEqual([]);
  });

  it('flags og:url / canonical URL mismatch against the expected slug URL', () => {
    const html = BLOG_HTML_OK.replaceAll(
      '"https://how-do-i.ai/blog/sample/"',
      '"https://how-do-i.ai/blog/wrong/"',
    );
    const posts = new Map([['sample', mkPost()]]);
    const result = auditOg([mkHtmlPage({ html })], posts);
    const ogUrlViolation = result.violations.find(
      (x) => x.kind === 'og_url_mismatch',
    );
    const canonicalViolation = result.violations.find(
      (x) => x.kind === 'canonical_url_mismatch',
    );
    expect(ogUrlViolation).toBeDefined();
    expect(canonicalViolation).toBeDefined();
  });

  it('flags a syntactically-invalid og:image URL', () => {
    // URL() cannot parse bare `:` schemes or an isolated `//` — use a
    // malformed input the WHATWG parser rejects.
    const html = BLOG_HTML_OK.replace(
      'content="https://how-do-i.ai/brand/og-default.png"',
      'content="http://[::invalid"',
    );
    const posts = new Map([['sample', mkPost()]]);
    const result = auditOg([mkHtmlPage({ html })], posts);
    const v = result.violations.find(
      (x) => x.kind === 'invalid_url' && x.field === 'og:image',
    );
    expect(v).toBeDefined();
    expect(v.actual).toBe('http://[::invalid');
  });
});

// --- parseRss + auditRss --------------------------------------------

const RSS_OK = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>How Do I AI</title>
    <description>AI first – for everything you do.</description>
    <link>https://how-do-i.ai/</link>
    <item>
      <title>Sample Title</title>
      <link>https://how-do-i.ai/blog/sample/</link>
      <guid isPermaLink="true">https://how-do-i.ai/blog/sample/</guid>
      <description>The description</description>
      <pubDate>Wed, 15 Jan 2025 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

describe('parseRss', () => {
  it('returns channel + items for a well-formed feed with a single item', () => {
    const parsed = parseRss(RSS_OK);
    expect(parsed.channel.title).toBe('How Do I AI');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].title).toBe('Sample Title');
  });

  it('returns null when the root <rss><channel> is missing', () => {
    expect(parseRss('<?xml version="1.0"?><root/>')).toBeNull();
  });

  it('normalizes multi-item emission to an array', () => {
    const xml = RSS_OK.replace(
      '</item>\n  </channel>',
      `</item>
      <item>
        <title>Second</title>
        <link>https://how-do-i.ai/blog/second/</link>
        <description>Second desc</description>
        <pubDate>Thu, 16 Jan 2025 00:00:00 GMT</pubDate>
      </item>
    </channel>`,
    );
    const parsed = parseRss(xml);
    expect(parsed.items).toHaveLength(2);
  });
});

describe('auditRss', () => {
  it('produces zero violations for a well-formed feed matching frontmatter', () => {
    const posts = new Map([['sample', mkPost()]]);
    const result = auditRss(RSS_OK, posts);
    expect(result.violations).toEqual([]);
    expect(result.stats.items).toBe(1);
  });

  it('flags missing channel fields', () => {
    const xml = RSS_OK.replace(
      '<description>AI first – for everything you do.</description>',
      '',
    );
    const posts = new Map([['sample', mkPost()]]);
    const result = auditRss(xml, posts);
    const v = result.violations.find(
      (x) => x.kind === 'rss_missing_field' && x.field.includes('channel'),
    );
    expect(v).toBeDefined();
  });

  it('flags missing item fields', () => {
    const xml = RSS_OK.replace(
      '<description>The description</description>',
      '',
    );
    const posts = new Map([['sample', mkPost()]]);
    const result = auditRss(xml, posts);
    const v = result.violations.find(
      (x) => x.kind === 'rss_missing_field' && x.field.includes('item[0]'),
    );
    expect(v).toBeDefined();
  });

  it('surfaces RSS title mismatch against frontmatter', () => {
    // Reverse-test AC direction for RSS: rss.xml.ts emits a different
    // title from what the frontmatter declares.
    const xml = RSS_OK.replace(
      '<title>Sample Title</title>\n      <link>',
      '<title>Out of sync</title>\n      <link>',
    );
    const posts = new Map([['sample', mkPost()]]);
    const result = auditRss(xml, posts);
    const v = result.violations.find((x) => x.kind === 'rss_title_mismatch');
    expect(v).toBeDefined();
    expect(v.expected).toContain('Sample Title');
    expect(v.actual).toContain('Out of sync');
  });

  it('surfaces RSS description mismatch against frontmatter', () => {
    const posts = new Map([
      ['sample', mkPost({ description: 'New frontmatter description' })],
    ]);
    const result = auditRss(RSS_OK, posts);
    const v = result.violations.find(
      (x) => x.kind === 'rss_description_mismatch',
    );
    expect(v).toBeDefined();
    expect(v.expected).toContain('New frontmatter description');
    expect(v.actual).toContain('The description');
  });

  it('surfaces pubDate mismatch via epoch-ms equality', () => {
    const posts = new Map([
      ['sample', mkPost({ date: new Date('2025-03-20') })],
    ]);
    const result = auditRss(RSS_OK, posts);
    const v = result.violations.find((x) => x.kind === 'rss_pubdate_mismatch');
    expect(v).toBeDefined();
    // Both sides surface as RFC-822 UTC strings (the RSS emission
    // format) + their epoch-ms, so the author can see the time-zone
    // bug or off-by-one-day issue at a glance.
    expect(v.expected).toContain('Thu, 20 Mar 2025');
    expect(v.actual).toContain('Wed, 15 Jan 2025');
  });

  it('flags a post that has no corresponding RSS item (missing coverage)', () => {
    const posts = new Map([
      ['sample', mkPost()],
      [
        'other',
        mkPost({
          slug: 'other',
          title: 'Other',
          source_file: 'src/content/blog/other.md',
        }),
      ],
    ]);
    const result = auditRss(RSS_OK, posts);
    const v = result.violations.find(
      (x) => x.kind === 'rss_missing_post' && x.field.includes('other'),
    );
    expect(v).toBeDefined();
  });

  it('flags a non-blog link in an RSS item as unrecognized', () => {
    const xml = RSS_OK.replace(
      '<link>https://how-do-i.ai/blog/sample/</link>',
      '<link>https://how-do-i.ai/somewhere-else/</link>',
    );
    const posts = new Map([['sample', mkPost()]]);
    const result = auditRss(xml, posts);
    const v = result.violations.find((x) => x.kind === 'rss_unrecognized_link');
    expect(v).toBeDefined();
  });

  it('flags two RSS items linking to the same slug as a duplicate', () => {
    const xml = RSS_OK.replace(
      '</item>\n  </channel>',
      `</item>
      <item>
        <title>Sample Title</title>
        <link>https://how-do-i.ai/blog/sample/</link>
        <description>The description</description>
        <pubDate>Wed, 15 Jan 2025 00:00:00 GMT</pubDate>
      </item>
    </channel>`,
    );
    const posts = new Map([['sample', mkPost()]]);
    const result = auditRss(xml, posts);
    const v = result.violations.find((x) => x.kind === 'rss_duplicate_slug');
    expect(v).toBeDefined();
    expect(v.actual).toBe('sample');
  });

  it('flags a malformed pubDate string via the rss_invalid_pubdate kind', () => {
    const xml = RSS_OK.replace(
      '<pubDate>Wed, 15 Jan 2025 00:00:00 GMT</pubDate>',
      '<pubDate>not-a-date</pubDate>',
    );
    const posts = new Map([['sample', mkPost()]]);
    const result = auditRss(xml, posts);
    const v = result.violations.find((x) => x.kind === 'rss_invalid_pubdate');
    expect(v).toBeDefined();
    expect(v.actual).toBe('not-a-date');
  });
});

// --- Reverse-test AC (issue #133) -----------------------------------

// The reverse-test AC from issue #133: modifying an OG title in
// BaseHead.astro without updating frontmatter (or vice versa) produces
// a specific diff-style failure.
describe('reverse-test (issue #133 AC)', () => {
  it('surfaces OG-vs-frontmatter title drift with a diff-style violation', () => {
    const htmlWithDriftedOgTitle = BLOG_HTML_OK.replace(
      'content="Sample Title | How Do I AI"',
      'content="Typo-prone Title | How Do I AI"',
    );
    const posts = new Map([['sample', mkPost()]]);
    const result = auditOg(
      [mkHtmlPage({ html: htmlWithDriftedOgTitle })],
      posts,
    );

    const violation = result.violations.find(
      (v) => v.kind === 'og_title_mismatch',
    );
    expect(violation).toBeDefined();
    expect(violation.field).toBe('og:title');
    expect(violation.page).toBe('dist/blog/sample/index.html');
    expect(violation.url).toBe('/blog/sample/');
    // Both sides are in the diff so the author sees where to fix.
    expect(violation.expected).toContain('Sample Title');
    expect(violation.actual).toContain('Typo-prone Title');
  });

  it('surfaces frontmatter-side drift with the same diff structure', () => {
    const posts = new Map([
      [
        'sample',
        mkPost({ title: 'Sample Title but with a different body wording' }),
      ],
    ]);
    const result = auditOg([mkHtmlPage()], posts);

    const violation = result.violations.find(
      (v) => v.kind === 'og_title_mismatch',
    );
    expect(violation).toBeDefined();
    expect(violation.expected).toContain('different body wording');
    expect(violation.actual).toContain('Sample Title');
  });
});

// --- Module exports sanity check ------------------------------------

describe('module exports', () => {
  it('exposes SITE and SITE_NAME_SUFFIX as importable constants', () => {
    expect(SITE).toBe('https://how-do-i.ai');
    expect(SITE_NAME_SUFFIX).toBe(' | How Do I AI');
  });
});
