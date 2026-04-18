# Brand asset provenance

These files are copies from the brand HQ (`hq/brand/`). Do not edit in
place — regenerate from the HQ originals if the assets are updated upstream.

All paths below are relative to the repository root.

## Favicon + touch icon

| File in `public/brand/` | HQ origin                                   |
| ----------------------- | ------------------------------------------- |
| `favicon.svg`           | `hq/brand/logo/svg/square-mono.svg`         |
| `favicon-32.png`        | `hq/brand/logo/png/square-mono/32.png`      |
| `favicon-48.png`        | `hq/brand/logo/png/square-mono/48.png`      |
| `apple-touch-icon.png`  | `hq/brand/logo/png/square-light-bg/200.png` |

The iOS touch icon uses the light-background variant so the `Ai?` mark sits
on an opaque tile rather than showing through to the user's wallpaper.

## `og-default.png`

Default Open Graph image used by `src/components/BaseHead.astro` when a page
does not set its own `image` prop. Embedded as `og:image` and
`twitter:image`; renders in link previews on LinkedIn, Slack, Discord,
iMessage, WhatsApp, Twitter, Bluesky, and similar surfaces.

- Dimensions: 1200×630 (standard OG aspect)
- Composition: Signal Orange (`#E85D2A`) base, two-line tagline in Inter 800,
  `how-do-i.ai` in JetBrains Mono, circular logo chip bottom-right
- Source: `hq/brand/social/og-image/og-image.svg` (rendered to PNG)
- Rendered asset: `hq/brand/social/og-image/og-image.png`
