# Brand asset provenance

Rendered brand assets served from the site. The editable sources
(SVG, design tokens, etc.) live outside this repo in the project's
private brand HQ, maintained alongside this repo in the development
workspace. Do not edit the binaries in this directory — rebuild them
from the brand HQ and copy the result back.

## Favicon + touch icon

| File in `public/brand/` | HQ origin (brand HQ)              |
| ----------------------- | --------------------------------- |
| `favicon.svg`           | `logo/svg/square-mono.svg`        |
| `favicon-32.png`        | `logo/png/square-mono/32.png`     |
| `favicon-48.png`        | `logo/png/square-mono/48.png`     |
| `apple-touch-icon.png`  | `logo/png/square-light-bg/200.png`|

The iOS touch icon uses the light-background variant so the `Ai?` mark sits
on an opaque tile rather than showing through to the user's wallpaper.

## `og-default.png`

Default Open Graph image used by `src/components/BaseHead.astro` when a
page does not set its own `image` prop. Embedded as `og:image` and
`twitter:image`; renders in link previews on LinkedIn, Slack, Discord,
iMessage, WhatsApp, Twitter, Bluesky, and similar surfaces.

- Dimensions: 1200×630 (standard OG aspect)
- Composition: Signal Orange (`#E85D2A`) base, two-line tagline in Inter 800,
  `how-do-i.ai` in JetBrains Mono, circular logo chip bottom-right
- Source of truth: `og-image.svg` in the brand HQ (`brand/social/og-image/`)
- Rebuild: render the SVG to a 1200×630 PNG and copy it to this path
