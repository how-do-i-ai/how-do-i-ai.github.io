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
- **CI** runs on every push and PR (`.github/workflows/ci.yml`): security audit (`npm audit --omit=dev`), lint, typecheck, unit tests (`npm run test`), build, Playwright suites (QA-07 touch-target audit + QA-08 axe-core WCAG 2.2 AA + QA-09 visual regression — all run by a single `npx playwright test` invocation), and Lighthouse mobile gates (QA-06, `npx lhci autorun`). All must pass before merge.
- **Deployment** to GitHub Pages runs automatically on push to `main` via `.github/workflows/deploy.yml`.

## Mobile quality gates

Four binary gates run on every PR — any failure blocks merge. Thresholds come from `hq/docs/website/prd.md` §§ QA-06..QA-09 (private HQ repo).

| Gate | Scope | Command |
|------|-------|---------|
| **QA-06 Lighthouse** | Performance ≥95, Accessibility =100, Best Practices ≥95, SEO ≥95 at 375×667 mobile with Slow-4G throttling, median of 3 runs per page | `npm run test:lighthouse` |
| **QA-07 Touch-target audit** | Every `<a> / <button> / <details summary> / <input>` on `/`, `/blog/`, `/blog/sample-post/` ≥ 44×44px at 320/375/414/768 | `npm run test:touch-targets` |
| **QA-08 axe-core** | Zero WCAG 2.2 AA violations (cumulative `wcag2a / wcag2aa / wcag21a / wcag21aa / wcag22aa` rules) on the same 3 pages × 320/375/414/768/1024 × light + dark = 30 permutations | `npm run test:a11y` |
| **QA-09 Visual regression** | 72 Playwright screenshot baselines (3 pages × 12 widths × 2 color modes) — see § below | `npm run test:visual` |

Combined local run: `npm run test:e2e` (QA-07/08/09) + `npm run test:lighthouse` (QA-06). Both expect Chromium to be installed — first run `npx playwright install --with-deps chromium`.

## Visual regression baselines

Playwright screenshot baselines under `tests/visual/__baselines__/` guard against unintended layout/token shifts (see [`tests/visual/README.md`](./tests/visual/README.md) for the full design rationale, width list, and why chromium-only).

### When baselines legitimately need updating

Any PR that intentionally changes the visual surface — tokens, typography, nav, spacing, dark-mode variants, new content components — will diff the relevant baselines. That is the gate working as intended. The reviewer's job is to decide whether the diff matches the PR's stated intent.

### Update procedure

1. **Make your code change** on a feature branch. Push and open the PR.
2. **CI will fail** on the `Visual regression tests` step for any snapshots that shifted. Download the `playwright-report` artifact from the failing run to see side-by-side expected/actual/diff views.
3. **If the diff is intentional**, regenerate the baselines locally using the official Playwright Linux container (baselines MUST be Linux-generated — macOS rasterization differs from CI's Ubuntu):

   ```bash
   # Run from the repo root. Version tag must match devDependencies.@playwright/test.
   docker run --rm \
     -v "$(pwd)":/work \
     -w /work \
     -e CI=true \
     mcr.microsoft.com/playwright:v1.59.1-noble \
     sh -c "npm ci && npm run test:visual:update"
   ```

4. **Commit the updated `.png` files** under `tests/visual/__baselines__/` with a subject that names the visual change (e.g., `(chore) refresh visual baselines for PDR-007 nav update`). Push; CI should now pass.
5. **Call out the baseline churn in the PR description** so reviewers know the visual change is deliberate and the diff they see in the artifact is what was approved.

### When NOT to update baselines

If you did not intend a visual change and CI shows diffs, the PR has introduced a regression — fix the code, not the baseline.
