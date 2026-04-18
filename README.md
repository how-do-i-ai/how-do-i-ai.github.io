# How Do I AI

Static blog for [how-do-i.ai](https://how-do-i.ai), built with [Astro](https://astro.build) and deployed to GitHub Pages.

## Local development

Prerequisites: Node.js LTS and npm.

```sh
npm install
npm run dev      # Dev server on http://localhost:4321
npm run build    # Production build into dist/
npm run preview  # Serve the built site locally
```

## Project structure

```
src/
├── components/        Reusable Astro components (cards, badges, nav, filter)
├── content/
│   └── blog/          Markdown posts (one file per post)
├── content.config.ts  Content collection schema (Zod)
├── layouts/           Page shells (BaseLayout, BlogPostLayout)
├── lib/               Pure helpers (posts, reading-time, format-date)
├── pages/             Routes — each .astro file maps to a URL
└── styles/
    └── global.css     Design tokens, resets, base typography

public/
├── fonts/             Self-hosted woff2 (Inter, JetBrains Mono)
└── ...                Static assets served from site root
```

## Content authoring

Blog posts live in `src/content/blog/{slug}.md`. Frontmatter is validated by the schema in `src/content.config.ts`:

| Field         | Required | Notes                                         |
| ------------- | -------- | --------------------------------------------- |
| `title`       | yes      | Post title                                    |
| `description` | yes      | Short summary for meta/OG/cards               |
| `date`        | yes      | Publication date (ISO 8601)                   |
| `pillar`      | yes      | One of the pillar slugs below                 |
| `series`      | no       | One of the series slugs below                 |
| `tags`        | no       | Array of strings; default `[]`                |
| `readingTime` | no       | Integer minutes; auto-estimated if omitted    |
| `draft`       | no       | `true` to exclude from build; default `false` |

Valid pillars: `thinking`, `practice`, `tools`, `meta`.

Valid series: `ai-at-home`, `ai-at-work`, `ai-for-gigs`, `ai-mindset`.

Drafts (`draft: true`) are excluded from listings, RSS, sitemap, and page generation — they do not produce any HTML output.

## Deployment

GitHub Pages via `.github/workflows/deploy.yml`. Triggered on push to `main`. The workflow builds the site and publishes `dist/` to the `gh-pages` environment.

## Contributing

Repo conventions — cross-repo setup (the private HDIAI HQ sibling repo), vendored brand asset provenance, branch and commit style — live in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

See [LICENSE](./LICENSE) for the project license. Self-hosted fonts carry their own licenses — see attribution files alongside the font binaries in `public/fonts/`.
