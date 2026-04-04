import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    pillar: z.enum([
      'ai-first-thinking',
      'ai-in-practice',
      'tools-and-workflows',
      'behind-the-scenes',
    ]),
    series: z
      .enum(['ai-at-home', 'ai-at-work', 'ai-for-gigs', 'ai-mindset'])
      .optional(),
    tags: z.array(z.string()).default([]),
    readingTime: z.number().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
