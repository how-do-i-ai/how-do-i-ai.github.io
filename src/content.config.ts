import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import {
  CHAPTER_SLUGS,
  PILLAR_SLUGS,
  SERIES_SLUGS,
  WWH_SLUGS,
} from './lib/taxonomy';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    pillar: z.enum(PILLAR_SLUGS),
    series: z.enum(SERIES_SLUGS).optional(),
    // Namespaced tag validation per PDR-009 § 4. Mirrors the strictness
    // posture of z.enum on `pillar`: typos like `chapter:judgement`
    // (British spelling) or duplicate namespace tags fail the build
    // rather than silently breaking filter URLs and JSON-LD downstream.
    tags: z
      .array(z.string())
      .default([])
      .superRefine((tags, ctx) => {
        const chapterTags = tags.filter((t) => t.startsWith('chapter:'));
        const wwhTags = tags.filter((t) => t.startsWith('wwh:'));

        if (chapterTags.length > 1) {
          ctx.addIssue({
            code: 'custom',
            message: `At most one chapter: tag allowed, found: ${chapterTags.join(', ')}`,
          });
        }

        if (wwhTags.length > 1) {
          ctx.addIssue({
            code: 'custom',
            message: `Only one wwh: tag allowed, found: ${wwhTags.join(', ')}`,
          });
        }

        for (const [idx, tag] of tags.entries()) {
          if (tag.startsWith('chapter:')) {
            const slug = tag.slice('chapter:'.length);
            if (!(CHAPTER_SLUGS as readonly string[]).includes(slug)) {
              ctx.addIssue({
                code: 'custom',
                path: [idx],
                message: `Unknown chapter slug: "${slug}". Valid: ${CHAPTER_SLUGS.join(', ')}`,
              });
            }
          }
          if (tag.startsWith('wwh:')) {
            const slug = tag.slice('wwh:'.length);
            if (!(WWH_SLUGS as readonly string[]).includes(slug)) {
              ctx.addIssue({
                code: 'custom',
                path: [idx],
                message: `Unknown wwh slug: "${slug}". Valid: ${WWH_SLUGS.join(', ')}`,
              });
            }
          }
        }
      }),
    readingTime: z.number().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
