import type { APIContext } from 'astro';
import { groupPostsByChapter } from '../lib/llms-curriculum';
import { formatMarkdownLink } from '../lib/llms-markdown';
import { getPublishedPosts } from '../lib/posts';

/**
 * Emits the site's `llms.txt` per the emerging https://llmstxt.org/
 * convention — a brand/content summary discoverable by LLM crawlers.
 *
 * Extends the Core + Pillars sections originally shipped statically (#64)
 * with a Curriculum section grouping posts by their `chapter:*` tag per
 * PDR-009 § 4. Chapter ordering follows `CHAPTER_SLUGS` (fixed pedagogical
 * sequence); posts without a chapter tag land in an Unclassified section
 * so the file remains a complete post index rather than omitting
 * currently-unclassified content.
 *
 * Content was previously maintained as `public/llms.txt`; the dynamic
 * route supersedes it so chapter assignments stay in sync with the
 * editorial source (frontmatter) without manual file maintenance.
 */
export async function GET(context: APIContext) {
  const posts = await getPublishedPosts();
  const curriculum = groupPostsByChapter(posts);
  const site = context.site!.href.replace(/\/$/, '');

  const lines: string[] = [
    '# How Do I AI?',
    '',
    `> AI first – for everything you do. — ${site}`,
    '',
    `How Do I AI? is a publication, not a personal brand. Multi-format content — blog, video, podcast — about applying AI to real work: drafting, planning, household logistics, side gigs, creative projects, shipping code. Practitioner walkthroughs with real workflows, real results, and the parts that didn't work. No "Top 10 Tools" lists. No courses to sell. No "AI will change everything" hype. AI writes. A human decides what's true.`,
    '',
    '## Core',
    '',
    `- [About](${site}/about/): What How Do I AI? is, how it's made, and why it isn't attributed to a person — a question brand, not a personal brand.`,
    `- [Blog](${site}/blog/): All posts, filterable by pillar, series, or tag.`,
    `- [RSS feed](${site}/rss.xml): Subscribe to new posts.`,
    `- [Sitemap](${site}/sitemap-index.xml): Full URL index.`,
    '',
    '## Pillars',
    '',
    `- [AI-First Thinking](${site}/blog/?pillar=thinking): Mental models, the Default Question, editorial position — starting with "how would I do this if AI could do anything?" instead of "can AI help?".`,
    `- [AI in Practice](${site}/blog/?pillar=practice): Practitioner walkthroughs — real workflows applied to real work, including the parts that didn't work.`,
    `- [Tools & Workflows](${site}/blog/?pillar=tools): Tool assessments, integrations, and repeatable workflows. Honest takes — not neutral.`,
    `- [Behind the Scenes](${site}/blog/?pillar=meta): About the publication itself — how it's made, editorial standards, the AI-first production process.`,
  ];

  const hasAnyPosts =
    curriculum.chapters.some((c) => c.posts.length > 0) ||
    curriculum.unclassified.length > 0;

  if (hasAnyPosts) {
    lines.push(
      '',
      '## Curriculum',
      '',
      'Blog posts grouped by chapter per PDR-009 § 4. Chapter ordering follows the curriculum sequence; within each chapter, posts are listed newest-first.',
    );

    for (const chapter of curriculum.chapters) {
      if (chapter.posts.length === 0) continue;
      lines.push('', `### ${chapter.label}`, '');
      for (const post of chapter.posts) {
        lines.push(
          `- ${formatMarkdownLink(post.data.title, `${site}/blog/${post.id}/`)}`,
        );
      }
    }

    if (curriculum.unclassified.length > 0) {
      lines.push('', '### Unclassified', '');
      for (const post of curriculum.unclassified) {
        lines.push(
          `- ${formatMarkdownLink(post.data.title, `${site}/blog/${post.id}/`)}`,
        );
      }
    }
  }

  const body = lines.join('\n') + '\n';

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
