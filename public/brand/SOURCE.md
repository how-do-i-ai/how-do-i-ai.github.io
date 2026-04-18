# Brand asset provenance

Rendered brand assets served from the site. The editable sources
(SVG, design tokens, etc.) live outside this repo in the project's
private brand HQ, maintained alongside this repo in the development
workspace. Do not edit the binaries in this directory — rebuild them
from the brand HQ and copy the result back.

For the full cross-repo setup convention (HQ is a private sibling repo)
and the update workflow, see [`CONTRIBUTING.md` § Cross-repo setup](../../CONTRIBUTING.md#cross-repo-setup).

## Favicon + touch icon

| File in `public/brand/` | HQ origin (brand HQ)               | Last synced |
| ----------------------- | ---------------------------------- | ----------- |
| `favicon.svg`           | `logo/svg/square-mono.svg`         | 2026-04-18  |
| `favicon-32.png`        | `logo/png/square-mono/32.png`      | 2026-04-18  |
| `favicon-48.png`        | `logo/png/square-mono/48.png`      | 2026-04-18  |
| `apple-touch-icon.png`  | `logo/png/square-light-bg/200.png` | 2026-04-18  |

The iOS touch icon uses the light-background variant so the `Ai?` mark sits
on an opaque tile rather than showing through to the user's wallpaper.

## Nav brand mark

Theme-variant PNGs displayed as the `Ai?` mark in the site nav
(`src/components/Nav.astro`). Sourced from the circle-safe variant so the
baked safe-margin gives the mark breathing room without CSS padding.
Lanczos-downsampled from the HQ 8K master per `brand/visual-identity.md`
rasterization rule — direct browser SVG rasterization at 32 px produces
aliased edges.

Loaded via CSS `background-image: image-set(... 1x, ... 2x, ... 3x)`; theme
variant tracks the `.dark` class on `<html>` set pre-paint by the inline
script in `BaseHead.astro`. Both variants are preloaded in `BaseHead.astro`
so the first theme toggle does not flash.

| File in `public/brand/`   | HQ origin (brand HQ)             | Last synced |
| ------------------------- | -------------------------------- | ----------- |
| `nav-mark-light.png`      | `logo/png/circle-light/32.png`   | 2026-04-18  |
| `nav-mark-light@2x.png`   | `logo/png/circle-light/64.png`   | 2026-04-18  |
| `nav-mark-light@3x.png`   | `logo/png/circle-light/96.png`   | 2026-04-18  |
| `nav-mark-dark.png`       | `logo/png/circle-dark/32.png`    | 2026-04-18  |
| `nav-mark-dark@2x.png`    | `logo/png/circle-dark/64.png`    | 2026-04-18  |
| `nav-mark-dark@3x.png`    | `logo/png/circle-dark/96.png`    | 2026-04-18  |

## `og-default.png`

Default Open Graph image used by `src/components/BaseHead.astro` when a
page does not set its own `image` prop. Embedded as `og:image` and
`twitter:image`; renders in link previews on LinkedIn, Slack, Discord,
iMessage, WhatsApp, Twitter, Bluesky, and similar surfaces.

| File in `public/brand/` | HQ origin (brand HQ)                 | Last synced |
| ----------------------- | ------------------------------------ | ----------- |
| `og-default.png`        | `brand/social/og-image/og-image.svg` | 2026-04-18  |

- Dimensions: 1200×630 (standard OG aspect)
- Composition: Signal Orange (`#E85D2A`) base, two-line tagline in Inter 800,
  `how-do-i.ai` in JetBrains Mono, circular logo chip bottom-right
- Rebuild: render the HQ SVG source to a 1200×630 PNG and copy it to this path,
  then bump the "Last synced" date above
