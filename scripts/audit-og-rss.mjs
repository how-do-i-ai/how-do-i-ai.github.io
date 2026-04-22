#!/usr/bin/env node
// QA-10.5 OG meta + RSS 2.0 audit (Phase 2).
//
// Pure-Node audit (no Playwright, no browser). Cross-references two
// classes of build output — (a) every `dist/**/*.html` page's Open
// Graph / Twitter / `<title>` / `<meta name="description">` block and
// (b) `dist/rss.xml` — against the post frontmatter in
// `src/content/blog/*.md` which is the editorial source-of-truth.
//
// Detects drift of the form "OG title on /blog/foo/ says X; frontmatter
// says Y" that `astro build` cannot catch — the build passes as long
// as the XML is well-formed and the OG tags are present, regardless of
// whether the VALUES still match the post source.
//
// Audit paths:
//   1. OG path — glob `dist/**/*.html`; for each page:
//      (a) structural presence check for required meta tags (runs on
//          every page — BaseHead.astro emits them universally),
//      (b) OG-vs-HTML consistency check (og:title and <title> share the
//          same BaseHead prop; drift is always a bug),
//      (c) for `/blog/<slug>/` pages only, cross-reference the
//          rendered OG title / description / canonical URL against the
//          post's frontmatter title / description / slug-URL.
//   2. RSS path — parse `dist/rss.xml`; for each channel and each item:
//      (a) RSS 2.0 required-field presence check (channel: title/link/
//          description; item: title/description/pubDate/link),
//      (b) per-item cross-reference of title / description / pubDate
//          / link against the post's frontmatter. Slug is derived from
//          the `<link>` URL to pair the item with its source post.
//
// Normalization rules (both sides of any string comparison):
//   1. HTML-decode entities (`&amp;` → `&`, `&quot;` → `"`, numeric
//      entities). Astro entity-encodes `< > & " '` in attribute values;
//      frontmatter source does not. Normalization side-levels the
//      encoding.
//   2. Unicode-normalize to NFC (absorbs composed vs decomposed
//      accents).
//   3. Collapse internal whitespace runs to a single ASCII space.
//   4. Trim.
// Comparison is case-sensitive after normalization — Title-Case vs
// sentence-case is preserved intentionally.
//
// Site-name suffix handling:
//   Blog-post pages pass `${post.data.title} | How Do I AI` as the
//   BaseHead `title` prop (see `src/pages/blog/[...id].astro`), so
//   rendered `<title>` and `og:title` both carry the ` | How Do I AI`
//   suffix on blog-post pages. RSS item `<title>` uses the raw
//   `post.data.title` with no suffix (see `src/pages/rss.xml.ts`). The
//   OG-vs-frontmatter comparator strips the suffix if present before
//   matching; the RSS comparator does not.
//
// pubDate comparison:
//   Frontmatter `date` is parsed by gray-matter as a `Date`; RSS
//   `<pubDate>` is emitted by @astrojs/rss via `toUTCString()`. Both
//   parse to the same epoch-millisecond value for midnight-UTC dates.
//   Comparator uses `getTime()` equality — zero tolerance, any drift
//   signals a timezone bug worth surfacing loudly.
//
// URL comparison:
//   Both sides are resolved against the configured `site`
//   (`https://how-do-i.ai`) and enforced to end in a trailing slash
//   (REQ-INFRA-05 `directory` format). OG `og:url`, `<link
//   rel="canonical">`, and RSS `<link>` on blog posts must all resolve
//   to `${site}/blog/${slug}/`.
//
// Outputs:
//   - Markdown report to stdout (captured by the CI log).
//   - JSON report to `tests/audit/__reports__/og-rss-report.json`
//     (gitignored).
//   - Exit 0 if all checks pass, 1 on any violation. Failure message
//     names the page/item and the field with a side-by-side diff so
//     the PR author can fix the mismatch at its source.
//
// See: issue #133; PDR-007 § Decision Phase 2; audit-tooling-design.md
// § 2.5, § 5 Risk 5 (dev-dep supply chain); REQ-FEED-01/02/03 (current
// gate: build success only). HQ repo, private — see CONTRIBUTING.md
// § Cross-repo setup.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, basename, extname } from 'node:path';
import { parse as parseHtml } from 'node-html-parser';
import { XMLParser } from 'fast-xml-parser';
import matter from 'gray-matter';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = join(REPO_ROOT, 'dist');
const RSS_PATH = join(DIST_DIR, 'rss.xml');
const BLOG_SOURCE_DIR = join(REPO_ROOT, 'src/content/blog');
const REPORT_DIR = join(REPO_ROOT, 'tests/audit/__reports__');
const REPORT_JSON = join(REPORT_DIR, 'og-rss-report.json');

// Mirrors `astro.config.mjs` `site`. The audit resolves any relative
// `link` / `og:url` / canonical URL against this origin so
// `/blog/foo/` and `https://how-do-i.ai/blog/foo/` compare equal.
export const SITE = 'https://how-do-i.ai';

// Mirrors the blog-post title template in `src/pages/blog/[...id].astro`:
//   title={`${post.data.title} | How Do I AI`}
// If rendered `<title>` / `og:title` ends with this suffix, the
// OG-vs-frontmatter comparator strips it before equality testing.
// Changing the template on either side requires updating this constant
// in the same PR.
export const SITE_NAME_SUFFIX = ' | How Do I AI';

// Required tags on every page — BaseHead.astro emits them universally.
// Each entry is `[label, selector]`. Kept in author order so the
// failure report reads top-to-bottom like the rendered HTML.
const REQUIRED_HTML_TAGS = [
  ['og:title', 'meta[property="og:title"]'],
  ['og:description', 'meta[property="og:description"]'],
  ['og:type', 'meta[property="og:type"]'],
  ['og:url', 'meta[property="og:url"]'],
  ['og:image', 'meta[property="og:image"]'],
  ['twitter:card', 'meta[name="twitter:card"]'],
  ['canonical', 'link[rel="canonical"]'],
  ['<title>', 'title'],
  ['<meta name="description">', 'meta[name="description"]'],
];

const TWITTER_CARD_EXPECTED = 'summary_large_image';

// --- Normalization ---------------------------------------------------

const HTML_ENTITY_NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Decode the subset of HTML entities Astro emits in meta-attribute
 * content: named entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`,
 * `&nbsp;`) and numeric entities (decimal `&#39;`, hexadecimal `&#x27;`).
 * Unknown entities pass through unchanged so a real `&oacute;` in
 * content surfaces as a literal.
 */
export function decodeHtmlEntities(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code)) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const lower = body.toLowerCase();
    return Object.prototype.hasOwnProperty.call(HTML_ENTITY_NAMED, lower)
      ? HTML_ENTITY_NAMED[lower]
      : match;
  });
}

/**
 * Normalize a text field (OG/Twitter/RSS title or description, HTML
 * <title>) for equality comparison against frontmatter source. Steps:
 *   1. HTML-decode entities (side-levels Astro's attribute encoding).
 *   2. Unicode-normalize to NFC.
 *   3. Collapse internal whitespace runs to a single ASCII space.
 *   4. Trim.
 * Null/undefined/non-string input returns ''.
 */
export function normalizeText(s) {
  if (typeof s !== 'string') return '';
  const decoded = decodeHtmlEntities(s);
  const nfc = decoded.normalize('NFC');
  const collapsed = nfc.replace(/\s+/g, ' ');
  return collapsed.trim();
}

/**
 * Strip the configured site-name suffix if present. Used by the
 * OG-vs-frontmatter title comparator to pair
 *   `${post.data.title} | How Do I AI` (rendered)
 * with
 *   `${post.data.title}` (frontmatter).
 * Normalized comparison on both sides ensures a suffix with stray
 * whitespace / entity encoding still matches.
 */
export function stripSiteNameSuffix(title, suffix = SITE_NAME_SUFFIX) {
  const normalized = normalizeText(title);
  const normalizedSuffix = normalizeText(suffix);
  if (normalized.endsWith(normalizedSuffix)) {
    return normalized
      .slice(0, normalized.length - normalizedSuffix.length)
      .trim();
  }
  return normalized;
}

/**
 * Normalize a URL to absolute-with-trailing-slash form against the
 * configured site origin. Paths (`/blog/foo/`) resolve to absolute
 * (`https://how-do-i.ai/blog/foo/`); absolute URLs are re-parsed to
 * normalize casing on the host. Trailing slash enforced per
 * REQ-INFRA-05 `directory` build format. Returns `null` if the URL
 * cannot be parsed — the caller surfaces that as a validation error,
 * not a matching error.
 */
export function normalizeUrl(urlStr, site = SITE) {
  if (typeof urlStr !== 'string' || urlStr === '') return null;
  let u;
  try {
    u = new URL(urlStr, site);
  } catch {
    return null;
  }
  const trimmed = u.pathname.replace(/\/+$/, '');
  // `.html` or a file-extension path should not be forced into a
  // directory-style trailing slash — but Astro's `directory` build
  // format emits all blog / about / index routes as directories, not
  // `.html` files. The trailing slash enforcement matches that format.
  // For the few internal callers that pass an explicit .html path
  // (404.html), the path already has an extension and this branch
  // preserves it.
  const withSlash = /\.[a-z0-9]+$/i.test(trimmed) ? trimmed : trimmed + '/';
  return `${u.protocol}//${u.host}${withSlash}${u.search}${u.hash}`;
}

// --- Source-of-truth loaders ----------------------------------------

/**
 * Load every blog post under `src/content/blog/*.md` and return a Map
 * keyed by slug for downstream lookup/iteration. The slug is the
 * filename basename without extension — matches Astro content-
 * collection `post.id` / `post.slug`. Draft posts are filtered out;
 * they don't ship to `dist/`, so the audit would otherwise flag them
 * as missing artifacts.
 *
 * Date coercion: gray-matter parses YAML date literals (`2025-01-15`)
 * as `Date` instances and quoted strings (`'2025-01-15'`) as strings.
 * Both shapes reach this loader; we coerce via `new Date(raw)` so the
 * downstream RSS pubDate check is applied regardless of how the YAML
 * was authored. `invalid_date` surfaces as a parsed `NaN`-epoch Date,
 * which `auditRss` then flags explicitly rather than silently skipping.
 */
export function loadPosts(blogDir = BLOG_SOURCE_DIR) {
  const bySlug = new Map();
  let entries;
  try {
    entries = readdirSync(blogDir, { withFileTypes: true });
  } catch (err) {
    throw new Error(
      `${blogDir}: cannot read (${err.code || err.message}). Is the worktree set up?`,
    );
  }
  for (const e of entries) {
    if (!e.isFile() || extname(e.name) !== '.md') continue;
    const slug = basename(e.name, '.md');
    const fullPath = join(blogDir, e.name);
    let parsed;
    try {
      parsed = matter(readFileSync(fullPath, 'utf8'));
    } catch (err) {
      throw new Error(`${fullPath}: frontmatter parse failed (${err.message})`);
    }
    if (parsed.data.draft === true) continue;
    const rawDate = parsed.data.date;
    let date = null;
    if (rawDate instanceof Date) {
      date = rawDate;
    } else if (rawDate !== undefined && rawDate !== null) {
      // Coerce strings / numbers. An unparseable value yields an
      // Invalid Date (getTime() === NaN); `auditRss` surfaces that as
      // `rss_invalid_pubdate` on the frontmatter side rather than
      // silently skipping the cross-reference.
      date = new Date(rawDate);
    }
    bySlug.set(slug, {
      slug,
      title: parsed.data.title,
      description: parsed.data.description,
      date,
      source_file: relative(REPO_ROOT, fullPath),
    });
  }
  return bySlug;
}

/**
 * Walk `dist/` and collect every `.html` file. Returns absolute
 * filesystem paths under `dist/`; callers can convert them to
 * repo-relative paths via `relative(REPO_ROOT, path)` when formatting
 * failure messages (the main entry point does this for every page).
 */
export function globDistHtml(distDir = DIST_DIR) {
  const out = [];
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      throw new Error(
        `${dir}: cannot read (${err.code || err.message}). Run 'npm run build' first.`,
      );
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
      } else if (e.isFile() && p.endsWith('.html')) {
        out.push(p);
      }
    }
  }
  walk(distDir);
  return out.sort();
}

// --- URL → slug pairing ---------------------------------------------

/**
 * Pair a rendered HTML page path or RSS item link with its source
 * post. `/blog/<slug>/` (directory format) is the only blog-post URL
 * shape the site emits today; everything else returns `null` and the
 * caller skips the per-post cross-reference.
 */
export function slugFromBlogUrl(urlOrPath) {
  if (typeof urlOrPath !== 'string' || urlOrPath === '') return null;
  let pathname;
  try {
    pathname = new URL(urlOrPath, SITE).pathname;
  } catch {
    return null;
  }
  const m = pathname.match(/^\/blog\/([^/]+)\/?$/);
  return m ? m[1] : null;
}

/**
 * Pair a built HTML file path with its rendered URL. Astro's
 * `directory` build format emits `/blog/foo/` as
 * `dist/blog/foo/index.html`; `/404.html` stays as `dist/404.html`.
 * This function is symmetric with `@astrojs/sitemap`'s path emission.
 */
export function urlFromDistHtmlPath(htmlPath, distDir = DIST_DIR) {
  const rel = relative(distDir, htmlPath).split('\\').join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) {
    return '/' + rel.slice(0, -'index.html'.length);
  }
  return '/' + rel;
}

// --- OG audit --------------------------------------------------------

/**
 * Extract the meta-tag surface from a built HTML page. Returns both
 * the raw values (for diff reporting) and the presence verdict (for
 * the structural check). Missing tags have value `null`.
 */
export function extractHtmlMeta(htmlContent) {
  const root = parseHtml(htmlContent);
  const pick = (sel) => {
    const node = root.querySelector(sel);
    if (!node) return null;
    if (node.rawTagName.toLowerCase() === 'title') {
      return node.text;
    }
    if (node.rawTagName.toLowerCase() === 'link') {
      return node.getAttribute('href') ?? null;
    }
    return node.getAttribute('content') ?? null;
  };
  const presence = {};
  for (const [label, selector] of REQUIRED_HTML_TAGS) {
    presence[label] = root.querySelector(selector) !== null;
  }
  // twitter:title / twitter:description / twitter:image intentionally
  // omitted: BaseHead emits them as mirrors of their og:* counterparts
  // from the same props, so a parity audit would duplicate the og:*
  // drift checks without adding signal. Revisit if they ever diverge
  // at emission time.
  return {
    ogTitle: pick('meta[property="og:title"]'),
    ogDescription: pick('meta[property="og:description"]'),
    ogType: pick('meta[property="og:type"]'),
    ogUrl: pick('meta[property="og:url"]'),
    ogImage: pick('meta[property="og:image"]'),
    twitterCard: pick('meta[name="twitter:card"]'),
    htmlTitle: pick('title'),
    metaDescription: pick('meta[name="description"]'),
    canonical: pick('link[rel="canonical"]'),
    presence,
  };
}

/**
 * Audit OG/Twitter/title/description tags on every built HTML page.
 * Produces a flat violations list plus per-page stats. Violations
 * carry a side-by-side `expected` / `actual` diff so the failure
 * message can point the author at both sides without further
 * lookups.
 */
export function auditOg(htmlPages, posts) {
  const violations = [];
  const perPage = [];
  for (const { relPath, url, html } of htmlPages) {
    const meta = extractHtmlMeta(html);
    const pageViolations = [];

    // Structural check: every required tag must be present.
    for (const [label] of REQUIRED_HTML_TAGS) {
      if (!meta.presence[label]) {
        pageViolations.push({
          kind: 'missing_tag',
          page: relPath,
          url,
          field: label,
          expected: 'present',
          actual: 'missing',
        });
      }
    }

    // twitter:card MUST be `summary_large_image` per BaseHead.astro.
    if (
      meta.twitterCard !== null &&
      normalizeText(meta.twitterCard) !== TWITTER_CARD_EXPECTED
    ) {
      pageViolations.push({
        kind: 'twitter_card_value',
        page: relPath,
        url,
        field: 'twitter:card',
        expected: TWITTER_CARD_EXPECTED,
        actual: meta.twitterCard,
      });
    }

    // OG image MVP: presence-only + syntactic URL validity.
    if (meta.ogImage !== null && normalizeUrl(meta.ogImage) === null) {
      pageViolations.push({
        kind: 'invalid_url',
        page: relPath,
        url,
        field: 'og:image',
        expected: 'syntactically-valid URL',
        actual: meta.ogImage,
      });
    }

    // og:title / html <title> consistency — BaseHead passes the same
    // prop to both, so drift is always a bug.
    if (meta.ogTitle !== null && meta.htmlTitle !== null) {
      if (normalizeText(meta.ogTitle) !== normalizeText(meta.htmlTitle)) {
        pageViolations.push({
          kind: 'og_html_title_drift',
          page: relPath,
          url,
          field: 'og:title vs <title>',
          expected: `<title>: ${meta.htmlTitle}`,
          actual: `og:title: ${meta.ogTitle}`,
        });
      }
    }

    // og:description / meta name=description consistency.
    if (meta.ogDescription !== null && meta.metaDescription !== null) {
      if (
        normalizeText(meta.ogDescription) !==
        normalizeText(meta.metaDescription)
      ) {
        pageViolations.push({
          kind: 'og_html_description_drift',
          page: relPath,
          url,
          field: 'og:description vs meta description',
          expected: `meta description: ${meta.metaDescription}`,
          actual: `og:description: ${meta.ogDescription}`,
        });
      }
    }

    // Per-blog-post cross-reference against frontmatter.
    const slug = slugFromBlogUrl(url);
    if (slug !== null) {
      const post = posts.get(slug);
      if (!post) {
        pageViolations.push({
          kind: 'orphan_blog_page',
          page: relPath,
          url,
          field: 'slug',
          expected: `a post in ${relative(REPO_ROOT, BLOG_SOURCE_DIR)}/ with basename ${slug}`,
          actual: 'no matching frontmatter post',
        });
      } else {
        // OG title vs frontmatter title (strip site-name suffix).
        if (meta.ogTitle !== null) {
          const stripped = stripSiteNameSuffix(meta.ogTitle);
          const expected = normalizeText(post.title);
          if (stripped !== expected) {
            pageViolations.push({
              kind: 'og_title_mismatch',
              page: relPath,
              url,
              field: 'og:title',
              expected: `frontmatter title: ${post.title}`,
              actual: `og:title (suffix stripped): ${stripped}`,
            });
          }
        }

        // OG description vs frontmatter description.
        if (meta.ogDescription !== null) {
          const actual = normalizeText(meta.ogDescription);
          const expected = normalizeText(post.description);
          if (actual !== expected) {
            pageViolations.push({
              kind: 'og_description_mismatch',
              page: relPath,
              url,
              field: 'og:description',
              expected: `frontmatter description: ${post.description}`,
              actual: `og:description: ${meta.ogDescription}`,
            });
          }
        }

        // og:url / canonical vs expected slug URL.
        const expectedUrl = normalizeUrl(`/blog/${slug}/`);
        for (const { tag, raw, mismatchKind } of [
          { tag: 'og:url', raw: meta.ogUrl, mismatchKind: 'og_url_mismatch' },
          {
            tag: 'canonical',
            raw: meta.canonical,
            mismatchKind: 'canonical_url_mismatch',
          },
        ]) {
          if (raw === null) continue;
          const actual = normalizeUrl(raw);
          if (actual === null) {
            pageViolations.push({
              kind: 'invalid_url',
              page: relPath,
              url,
              field: tag,
              expected: 'syntactically-valid URL',
              actual: raw,
            });
          } else if (actual !== expectedUrl) {
            pageViolations.push({
              kind: mismatchKind,
              page: relPath,
              url,
              field: tag,
              expected: expectedUrl,
              actual,
            });
          }
        }
      }
    }

    perPage.push({
      page: relPath,
      url,
      is_blog_post: slug !== null,
      slug,
      violation_count: pageViolations.length,
    });
    violations.push(...pageViolations);
  }
  return { violations, perPage };
}

// --- RSS audit -------------------------------------------------------

// Channel-level required fields per RSS 2.0.
const RSS_CHANNEL_REQUIRED = ['title', 'link', 'description'];
// Item-level required fields per RSS 2.0.
const RSS_ITEM_REQUIRED = ['title', 'description', 'pubDate', 'link'];

/**
 * Parse `dist/rss.xml` via fast-xml-parser, normalize item emission
 * (single-item case returns an object; multi-item returns an array),
 * and return a structurally uniform shape for the audit.
 */
export function parseRss(xmlContent) {
  // Default XMLParser behaviour is what we want: single-child nodes
  // flatten to objects, multi-child siblings become arrays. The audit
  // does not read RSS attributes (e.g. `isPermaLink` on `<guid>`), so
  // no option overrides are needed.
  const parser = new XMLParser();
  const parsed = parser.parse(xmlContent);
  if (!parsed.rss || !parsed.rss.channel) {
    return null;
  }
  const channel = parsed.rss.channel;
  const rawItems = channel.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  return {
    channel,
    items,
  };
}

/**
 * Audit `dist/rss.xml`. Validates channel-level + item-level required
 * fields, then cross-references each item against the matching post's
 * frontmatter by slug derived from `<link>`.
 */
export function auditRss(xmlContent, posts) {
  const violations = [];
  const parsed = parseRss(xmlContent);
  if (parsed === null) {
    violations.push({
      kind: 'rss_structure',
      source: 'dist/rss.xml',
      field: 'rss > channel',
      expected: 'present',
      actual: 'missing',
    });
    return { violations, stats: { channel_present: false, items: 0 } };
  }
  const { channel, items } = parsed;

  for (const field of RSS_CHANNEL_REQUIRED) {
    const value = channel[field];
    if (value === undefined || value === null || value === '') {
      violations.push({
        kind: 'rss_missing_field',
        source: 'dist/rss.xml',
        field: `channel > ${field}`,
        expected: 'present',
        actual: 'missing',
      });
    }
  }

  const seenSlugs = new Set();
  for (const [i, item] of items.entries()) {
    const itemLabel = `item[${i}]`;

    // 1. Required-field presence check per RSS 2.0. Collect the set of
    //    fields missing on this item so the downstream cross-reference
    //    checks can skip them — reporting BOTH `rss_missing_field` and
    //    a `*_mismatch` for the same field would be noise.
    const missingFields = new Set();
    for (const field of RSS_ITEM_REQUIRED) {
      const value = item[field];
      if (value === undefined || value === null || value === '') {
        missingFields.add(field);
        violations.push({
          kind: 'rss_missing_field',
          source: 'dist/rss.xml',
          field: `${itemLabel} > ${field}`,
          expected: 'present',
          actual: 'missing',
        });
      }
    }

    // 2. Slug pairing. If link is missing/empty, the required-field
    //    check above already emitted `rss_missing_field`; skip the
    //    slug-derived checks (orphan/unrecognized/duplicate) on this
    //    item — there's no way to pair it with a source post.
    if (missingFields.has('link')) {
      continue;
    }

    const slug = slugFromBlogUrl(String(item.link));
    if (slug === null) {
      // Link is present but not of the `/blog/<slug>/` shape — the RSS
      // only emits blog posts today, so surface it rather than silently
      // skipping.
      violations.push({
        kind: 'rss_unrecognized_link',
        source: 'dist/rss.xml',
        field: `${itemLabel} > link`,
        expected: `/blog/<slug>/ URL`,
        actual: item.link,
      });
      continue;
    }

    if (seenSlugs.has(slug)) {
      violations.push({
        kind: 'rss_duplicate_slug',
        source: 'dist/rss.xml',
        field: `${itemLabel} > link`,
        expected: 'unique slug per item',
        actual: slug,
      });
    }
    seenSlugs.add(slug);

    const post = posts.get(slug);
    if (!post) {
      violations.push({
        kind: 'rss_orphan_item',
        source: 'dist/rss.xml',
        field: `${itemLabel} > slug`,
        expected: `a post in ${relative(REPO_ROOT, BLOG_SOURCE_DIR)}/ with basename ${slug}`,
        actual: 'no matching frontmatter post',
      });
      continue;
    }

    // 3. Per-field cross-reference. Each check is gated on the field
    //    NOT being in missingFields — a missing field already produced
    //    a `rss_missing_field` violation; a mismatch violation on the
    //    same field would be redundant.

    // Title — exact equality after normalization (no site-name suffix
    // on RSS item titles).
    if (!missingFields.has('title')) {
      const actual = normalizeText(String(item.title));
      const expected = normalizeText(post.title);
      if (actual !== expected) {
        violations.push({
          kind: 'rss_title_mismatch',
          source: 'dist/rss.xml',
          field: `${itemLabel} > title`,
          expected: `frontmatter title: ${post.title}`,
          actual: `rss title: ${item.title}`,
        });
      }
    }

    // Description — exact equality after normalization.
    if (!missingFields.has('description')) {
      const actual = normalizeText(String(item.description));
      const expected = normalizeText(post.description);
      if (actual !== expected) {
        violations.push({
          kind: 'rss_description_mismatch',
          source: 'dist/rss.xml',
          field: `${itemLabel} > description`,
          expected: `frontmatter description: ${post.description}`,
          actual: `rss description: ${item.description}`,
        });
      }
    }

    // pubDate — epoch-ms equality; frontmatter Date ↔ RSS RFC-822.
    // Surface invalid dates on either side explicitly (rather than
    // silently skipping) so timezone/encoding bugs don't hide.
    if (!missingFields.has('pubDate')) {
      const rssEpoch = new Date(String(item.pubDate)).getTime();
      const fmEpoch = post.date ? post.date.getTime() : NaN;
      if (!Number.isFinite(rssEpoch)) {
        violations.push({
          kind: 'rss_invalid_pubdate',
          source: 'dist/rss.xml',
          field: `${itemLabel} > pubDate`,
          expected: 'RFC-822 date parseable by new Date()',
          actual: item.pubDate,
        });
      } else if (!Number.isFinite(fmEpoch)) {
        violations.push({
          kind: 'rss_invalid_pubdate',
          source: post.source_file,
          field: `${itemLabel} > pubDate (frontmatter side)`,
          expected: 'valid date in frontmatter `date` field',
          actual: post.date === null ? 'missing' : `unparseable (${post.date})`,
        });
      } else if (rssEpoch !== fmEpoch) {
        violations.push({
          kind: 'rss_pubdate_mismatch',
          source: 'dist/rss.xml',
          field: `${itemLabel} > pubDate`,
          expected: `frontmatter date (epoch ms): ${fmEpoch} (${post.date.toUTCString()})`,
          actual: `rss pubDate (epoch ms): ${rssEpoch} (${item.pubDate})`,
        });
      }
    }

    // Link — resolved-normalized equality.
    const actualUrl = normalizeUrl(String(item.link));
    const expectedUrl = normalizeUrl(`/blog/${slug}/`);
    if (actualUrl === null) {
      violations.push({
        kind: 'invalid_url',
        source: 'dist/rss.xml',
        field: `${itemLabel} > link`,
        expected: 'syntactically-valid URL',
        actual: item.link,
      });
    } else if (actualUrl !== expectedUrl) {
      violations.push({
        kind: 'rss_link_mismatch',
        source: 'dist/rss.xml',
        field: `${itemLabel} > link`,
        expected: expectedUrl,
        actual: actualUrl,
      });
    }
  }

  // Coverage — every non-draft post should appear as an RSS item.
  for (const [slug, post] of posts.entries()) {
    if (!seenSlugs.has(slug)) {
      violations.push({
        kind: 'rss_missing_post',
        source: 'dist/rss.xml',
        field: `item[slug=${slug}]`,
        expected: `item for ${post.source_file}`,
        actual: 'missing',
      });
    }
  }

  return {
    violations,
    stats: { channel_present: true, items: items.length },
  };
}

// --- Rendering -------------------------------------------------------

function renderMarkdown(summary, ogResult, rssResult) {
  const lines = [];
  lines.push('# QA-10.5 OG + RSS — audit report');
  lines.push('');
  lines.push(`- Run date: ${summary.run_date}`);
  lines.push(`- HTML pages scanned: ${summary.html_pages_scanned}`);
  lines.push(`- Blog-post pages: ${summary.blog_post_pages}`);
  lines.push(`- RSS items: ${summary.rss_items}`);
  lines.push(`- Source posts: ${summary.source_posts}`);
  lines.push(`- OG violations: ${ogResult.violations.length}`);
  lines.push(`- RSS violations: ${rssResult.violations.length}`);
  lines.push('');

  if (ogResult.perPage.length > 0) {
    lines.push('## Per-page OG verdict');
    lines.push('');
    lines.push('| Page | URL | Blog post | Violations |');
    lines.push('| --- | --- | --- | --- |');
    for (const p of ogResult.perPage) {
      lines.push(
        `| \`${p.page}\` | ${p.url} | ${p.is_blog_post ? 'yes' : 'no'} | ${p.violation_count} |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderFailureMessage(ogResult, rssResult) {
  const lines = [];
  const allViolations = [...ogResult.violations, ...rssResult.violations];
  if (allViolations.length === 0) return '';
  lines.push('');
  lines.push(`QA-10.5 FAIL — ${allViolations.length} violation(s) detected:`);
  lines.push('');
  for (const v of allViolations) {
    const location = v.page
      ? `${v.page} (${v.url})`
      : v.source || '(unknown source)';
    lines.push(`  - [${v.kind}] ${v.field}`);
    lines.push(`      at:       ${location}`);
    lines.push(`      expected: ${v.expected}`);
    lines.push(`      actual:   ${v.actual}`);
  }
  lines.push('');
  lines.push('Resolve each by one of:');
  lines.push(
    '  (a) update the frontmatter in src/content/blog/*.md so the source-of-truth matches intent,',
  );
  lines.push(
    '  (b) update the rendering template (BaseHead.astro, rss.xml.ts, or the page layout) so emission matches the frontmatter, or',
  );
  lines.push(
    '  (c) if the mismatch is a site-name suffix / pubDate timezone / URL format bug, fix at the emission layer.',
  );
  return lines.join('\n');
}

// --- JSON output -----------------------------------------------------

function writeJsonReport(summary, ogResult, rssResult) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const payload = {
    run_date: summary.run_date,
    html_pages_scanned: summary.html_pages_scanned,
    blog_post_pages: summary.blog_post_pages,
    rss_items: summary.rss_items,
    source_posts: summary.source_posts,
    og: {
      violations: ogResult.violations,
      per_page: ogResult.perPage,
    },
    rss: {
      violations: rssResult.violations,
      channel_present: rssResult.stats.channel_present,
      item_count: rssResult.stats.items,
    },
  };
  writeFileSync(REPORT_JSON, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return REPORT_JSON;
}

function todayISO() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function main() {
  const posts = loadPosts();

  const htmlPages = globDistHtml().map((absPath) => ({
    relPath: relative(REPO_ROOT, absPath),
    url: urlFromDistHtmlPath(absPath),
    html: readFileSync(absPath, 'utf8'),
  }));

  let rssContent;
  try {
    rssContent = readFileSync(RSS_PATH, 'utf8');
  } catch (err) {
    throw new Error(
      `${RSS_PATH}: cannot read (${err.code || err.message}). Run 'npm run build' first.`,
    );
  }

  const ogResult = auditOg(htmlPages, posts);
  const rssResult = auditRss(rssContent, posts);

  const summary = {
    run_date: todayISO(),
    html_pages_scanned: htmlPages.length,
    blog_post_pages: ogResult.perPage.filter((p) => p.is_blog_post).length,
    rss_items: rssResult.stats.items,
    source_posts: posts.size,
  };

  process.stdout.write(renderMarkdown(summary, ogResult, rssResult) + '\n');
  const jsonPath = writeJsonReport(summary, ogResult, rssResult);
  process.stdout.write(`\nJSON report: ${relative(REPO_ROOT, jsonPath)}\n`);

  const failMsg = renderFailureMessage(ogResult, rssResult);
  if (failMsg !== '') {
    process.stderr.write(failMsg + '\n');
    process.exit(1);
  }
}

// CLI invocation — only runs when executed directly, not when imported
// by the unit test.
const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((err) => {
    process.stderr.write(`[audit-og-rss] ERROR: ${err.message}\n`);
    process.exit(1);
  });
}
