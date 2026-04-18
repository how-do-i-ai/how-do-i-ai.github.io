# Contributing

Thanks for your interest in How Do I AI. This doc covers the repo-level conventions that are not obvious from reading the code.

For dev setup (Node, `npm install`, `npm run dev`/`build`/`preview`) see the [README](./README.md).

## Cross-repo setup

The HDIAI brand is split across two repos:

- **This repo** (`how-do-i-ai/how-do-i-ai.github.io`, public) — the Astro site served at [how-do-i.ai](https://how-do-i.ai).
- **HDIAI HQ repo** (private) — brand, content, and strategy HQ: source-of-truth brand assets (logo SVGs, social/OG images, identity and messaging docs), content strategy, and decision records (ADR / PDR).

### Local layout

The convention is to clone HQ as a **sibling directory** of this repo:

```
<workspace>/
├── how-do-i-ai.github.io/   ← this repo
└── hq/                      ← HDIAI HQ (private)
```

Paths in issue descriptions and commit messages that look like `hq/brand/...` or `../hq/brand/...` refer to this sibling layout. Any local layout works as long as you know where HQ is — the sibling convention just makes those references resolvable without adjustment.

### HQ is private

The HQ repo is not publicly accessible. Issue descriptions, ADR/PDR references, and asset provenance notes in this repo may reference `hq/*` paths — those references are for **provenance and audit**, not click-through navigation. Contributors who need the referenced material must arrange access to the HQ repo separately.

Issues that reference HQ paths should include a short note near the top so new contributors can resolve the reference. The convention is:

> _This issue references files in the HDIAI HQ repo (private). See [`CONTRIBUTING.md` § Cross-repo setup](./CONTRIBUTING.md#cross-repo-setup). Contributors need to arrange HQ access separately._

## Vendored brand assets

Brand assets consumed by the site (favicons, OG image, logo marks) live under `public/brand/`. They are **copied in** from the HQ repo — not symlinked, not pulled at build time, not regenerated in CI. The binaries in `public/brand/` are the deliverable; this repo is self-contained at build time and needs no HQ access to build.

### Provenance: `public/brand/SOURCE.md`

Every file under `public/brand/` is listed in [`public/brand/SOURCE.md`](./public/brand/SOURCE.md) with:

- its path within `public/brand/`,
- its HQ origin path (where the source-of-truth lives in the HQ repo),
- its last-synced date (when it was last re-vendored into this repo).

Keeping `SOURCE.md` accurate is part of the vendoring step — if you update an asset without updating `SOURCE.md`, future contributors will have no way to trace the binary back to its source.

### Update workflow

When HQ ships a new brand release or you need to re-vendor an asset:

1. **Re-render or pull** the finalized asset from HQ (not from an intermediate draft).
2. **Copy** the binary into `public/brand/`, overwriting the existing file. Keep the filename stable so `BaseHead.astro` and friends don't need to change.
3. **Update `public/brand/SOURCE.md`**: verify the HQ origin path still matches, and bump the last-synced date to today. Add a row if the asset is new.
4. **Commit** with a subject like `(feat) replace {asset} with {release-name}` or `(chore) re-vendor {asset} from HQ`, referencing the HQ release when relevant.

No automation, no symlink, no build-time fetch: vendored means vendored. Automation can come later once cadence justifies it.

## Branches, commits, and pull requests

- **Branch names**: `{type}/{issue-number}-{short-slug}` (e.g., `feat/63-jsonld-structured-data`, `docs/76-hq-cross-repo-setup`).
- **Commit subjects**: `(type) imperative lowercase description` (e.g., `(docs) add CONTRIBUTING`, `(feat) replace placeholder OG with Pass-2 brand image`). Types in use: `feat`, `fix`, `docs`, `chore`, `refactor`.
- **Pull requests** target `main`. The repo is rebase-merge only, so keep the branch history tidy — it will land on `main` as-is.
- **CI** runs on every push and PR (`.github/workflows/ci.yml`): security audit (`npm audit --omit=dev`), lint, typecheck, test, build. All must pass before merge.
- **Deployment** to GitHub Pages runs automatically on push to `main` via `.github/workflows/deploy.yml`.
