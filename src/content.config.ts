import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { PILLAR_SLUGS, SERIES_SLUGS } from './lib/taxonomy';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    pillar: z.enum(PILLAR_SLUGS),
    series: z.enum(SERIES_SLUGS).optional(),
    tags: z.array(z.string()).default([]),
    readingTime: z.number().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
