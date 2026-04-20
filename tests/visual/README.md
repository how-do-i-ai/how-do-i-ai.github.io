# Visual regression suite

Playwright screenshot baselines for [QA-09](../../../hq/docs/website/prd.md) — the mobile visual-regression gate for this site.

## What this guards

- **Layout regressions** at the 12 viewport widths that matter for HDIAI: `320, 375, 414, 480, 500, 600, 640, 700, 767, 768, 1024, 1440` (CSS px).
- **Dark-mode parity**: every width is captured in both light and dark color schemes.
- **Three canonical surfaces**: `/` (home), `/blog/` (blog index), `/blog/sample-post/` (a blog post) — representing the three layout archetypes the site serves.
- The **480–767 collapse band** specifically — per [PDR-006 constraint 6](../../../hq/docs/website/prd.md#qa-09-mobile-visual-regression) and the 2026-04-19 amendment. This is the width range where Pattern A single-row navigation is emergent rather than enforced; the B1 regression in PR #99 came from untested assumptions here.

3 pages × 12 widths × 2 color schemes = **72 baseline snapshots** per run.

## How to run

From the repo root:

```bash
# Run the suite against the current committed baselines.
# Fails if any pixel diff exceeds the allowed tolerance.
npm run test:visual

# Regenerate every baseline. Use this after an intentional visual change
# (tokens, layout, mobile nav, etc.) — the resulting image churn goes
# through PR review so reviewers explicitly sign off on the shift.
npm run test:visual:update
```

Both scripts run `npm run build` internally before invoking Playwright, so a clean `dist/` is always tested.

## Baselines must be Linux-generated

CI runs on `ubuntu-latest`. Chromium font rasterization, anti-aliasing, and emoji fallback differ subtly between macOS and Linux — even with identical self-hosted fonts, a baseline taken on macOS will produce diff-pixels on Ubuntu.

**All committed baselines in `__baselines__/` are generated inside the official Playwright Linux container**, matching the CI environment exactly. Regenerate the same way:

```bash
# Run from the repo root. Version tag MUST match devDependencies.@playwright/test.
docker run --rm \
  -v "$(pwd)":/work \
  -w /work \
  -e CI=true \
  mcr.microsoft.com/playwright:v1.59.1-noble \
  sh -c "npm ci && npm run test:visual:update"
```

This produces byte-identical baselines to what CI will compare against on the next push.

## What the PR workflow shows

When a PR changes tokens, layout, or mobile nav in a way that shifts pixels:

1. The `Visual regression tests` step in CI fails.
2. The `playwright-report` artifact contains an HTML report with side-by-side expected / actual / diff views for every affected snapshot.
3. The `visual-diffs` artifact contains the raw `actual.png` and `diff.png` files.

Reviewers inspect the report, decide whether the visual shift is intentional, and either approve the PR (after the author regenerates baselines) or request a layout fix.

## Relationship with `.tmp/branch-build-screenshots/`

`/.tmp/branch-build-screenshots/` contains **66 pre-existing screenshots** from the PDR-006 branch-build mobile-polish work. They are:

- **Not regression baselines.** They were per-branch snapshots used for human visual comparison during the Wave 1–3 mobile redesign.
- **Artifacts of a past workflow**, preserved because the PDR-006 work treated them as inline-rendered deliverables in GitHub.
- **Not consumed by this suite.** Nothing in `tests/visual/` reads, writes, or diffs against them.

The canonical regression baselines for post-launch visual integrity live here, under `tests/visual/__baselines__/`. The branch-build screenshots are kept for historical provenance only — see `.gitignore` for the scoped retention exception.

## Why chromium-only

Visual regression in this repo guards **HDIAI layout intent** (tokens, spacing, nav collapse, typography rhythm), not **cross-browser render drift**. Running Firefox and WebKit would multiply baseline count by 3× with little added signal — Firefox/WebKit rendering variance is a separate concern and would need a different gate (probably visual review rather than pixel-diff).

If cross-browser visual parity becomes a product goal later, adding projects to `playwright.config.ts` is a one-line change.

## Tuning the diff tolerance

`playwright.config.ts` sets `toHaveScreenshot.maxDiffPixelRatio: 0.01` — up to 1% of pixels may differ before a snapshot is considered a regression. If flakes become common (rare on Linux CI with self-hosted fonts, but possible with emoji rendering shifts or Astro build non-determinism), raise the tolerance conservatively and document the reason.

`animations: 'disabled'` and `emulateMedia({ reducedMotion: 'reduce' })` together keep transitions out of the capture — the only known sources of diff beyond intentional layout shifts.
