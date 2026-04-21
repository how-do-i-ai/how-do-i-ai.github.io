# Visual regression + UI audit tooling

This directory hosts part of two distinct quality gates that share the same Playwright infrastructure, the same `__baselines__/` naming convention (across `tests/visual/__baselines__/` and `tests/audit/__baselines__/`), and the same Linux-parity baseline rule — but answer different questions. Future contributors must keep them distinct or artifacts drift.

## QA-09 visual regression vs QA-10 UI audit tooling

| Gate                        | Question it answers                         | Scope                                                                                                                                                                                                                                                                                                                                                                                                   | Source of truth                                                                              |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **QA-09 visual regression** | "Did anything change relative to baseline?" | 72 pixel baselines (3 pages × 12 widths × 2 color schemes). Single `tests/visual/screenshots.spec.ts` spec. Pixel-diff gate.                                                                                                                                                                                                                                                                            | `hq/docs/website/prd.md` § QA-09                                                             |
| **QA-10 UI audit tooling**  | "Is the baseline itself correct?"           | Six phased components covering route archetypes, CSS critical widths, home-page invariants, DOM cross-sections, non-browser surfaces (OG/RSS), and rendering modes. Artifacts split across `tests/audit/` (Playwright specs + runbooks + allowlist data), `scripts/` (pure-Node audits), and `tests/visual/` (Phase 2 style sidecars + Phase 3 rendering-mode baselines colocated with the QA-09 PNGs). | `hq/docs/decisions/PDR-007-ui-audit-strategy.md` + `hq/docs/website/audit-tooling-design.md` |

QA-09 is live today. QA-10 is adopted per PDR-007 and rolls out in three phases; as of PR authoring, QA-10 components are scheduled per-phase and tracked as separate implementation issues (see § Components below). CI currently wires QA-06/07/08/09; QA-10 components join CI as each phase lands. QA-09 and QA-10 coexist; QA-10 does not replace QA-09, and nothing in PDR-007 modifies QA-09 behavior.

Paths under `hq/...` reference the sibling HDIAI HQ repo (private) — see [CONTRIBUTING § Cross-repo setup](../../CONTRIBUTING.md#cross-repo-setup). Those paths are for provenance, not click-through, and are deliberately code-formatted (not markdown links) so GitHub does not render them as clickable 404s.

---

## QA-09 — Visual regression

Playwright screenshot baselines for QA-09 (see `hq/docs/website/prd.md` § QA-09) — the mobile visual-regression gate.

### What this guards

- **Layout regressions** at the 12 viewport widths that matter for HDIAI: `320, 375, 414, 480, 500, 600, 640, 700, 767, 768, 1024, 1440` (CSS px).
- **Dark-mode parity**: every width is captured in both light and dark color schemes.
- **Three canonical surfaces**: `/` (home), `/blog/` (blog index), `/blog/sample-post/` (a blog post) — representing the three layout archetypes the site serves.
- The **480–767 collapse band** specifically — per PDR-006 constraint 6 (see `hq/docs/website/prd.md#qa-09-mobile-visual-regression`) and the 2026-04-19 amendment. This is the width range where Pattern A single-row navigation is emergent rather than enforced; the B1 regression in PR #99 came from untested assumptions here.

3 pages × 12 widths × 2 color schemes = **72 baseline snapshots** per run.

### How to run

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

### What the PR workflow shows

When a PR changes tokens, layout, or mobile nav in a way that shifts pixels:

1. The `Visual regression tests` step in CI fails.
2. The `playwright-report` artifact contains an HTML report with side-by-side expected / actual / diff views for every affected snapshot.
3. The `visual-diffs` artifact contains the raw `actual.png` and `diff.png` files.

Reviewers inspect the report, decide whether the visual shift is intentional, and either approve the PR (after the author regenerates baselines) or request a layout fix.

### Why chromium-only

Visual regression in this repo guards **HDIAI layout intent** (tokens, spacing, nav collapse, typography rhythm), not **cross-browser render drift**. Running Firefox and WebKit would multiply baseline count by 3× with little added signal — Firefox/WebKit rendering variance is a separate concern and would need a different gate (probably visual review rather than pixel-diff).

If cross-browser visual parity becomes a product goal later, adding projects to `playwright.config.ts` is a one-line change.

### Tuning the diff tolerance

`playwright.config.ts` sets `toHaveScreenshot.maxDiffPixelRatio: 0.01` — up to 1% of pixels may differ before a snapshot is considered a regression. If flakes become common (rare on Linux CI with self-hosted fonts, but possible with emoji rendering shifts or Astro build non-determinism), raise the tolerance conservatively and document the reason.

`animations: 'disabled'` and `emulateMedia({ reducedMotion: 'reduce' })` together keep transitions out of the capture — the only known sources of diff beyond intentional layout shifts.

---

## QA-10 — UI audit tooling (PDR-007)

QA-10 adopts six audit components across three phases, ordered by cost-of-waiting curve (steepest first). See `hq/docs/decisions/PDR-007-ui-audit-strategy.md` § Decision for the adoption rationale and `hq/docs/website/audit-tooling-design.md` § 2 for full per-component design (inputs → components → outputs).

Phases are **gates, not schedules** (`hq/docs/decisions/PDR-007-ui-audit-strategy.md` § Constraints on implementation — Constraint 4). Phase N+1 does not begin until Phase N components are green on ≥2 consecutive PRs. Governance checklist tracked in **[#125](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/125)**; runbook lands at `tests/audit/PHASE-GATES.md` when the issue closes.

### Components

| Component                       | Phase | Surface                                                                                                                                                          | Governing section                                                                                                                   |
| ------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **QA-10.1** Route Clustering    | 1     | `tests/audit/routes.spec.ts` + `tests/audit/__baselines__/route-clusters.json`                                                                                   | `PDR-007` § Decision — Phase 1 • `audit-tooling-design.md` § 2 QA-10.1                                                              |
| **QA-10.2** Critical Widths     | 1     | `scripts/extract-widths.mjs` + allowlist `tests/audit/threshold-significance.json` (see below)                                                                   | `PDR-007` § Decision — Phase 1 • `PDR-007` § Constraint 5 • `audit-tooling-design.md` § 2 QA-10.2                                   |
| **QA-10.3** Invariant Specs MVP | 1     | `tests/audit/invariants.spec.ts` + shared `tests/audit/selectors.ts`                                                                                             | `PDR-007` § Decision — Phase 1 • `audit-tooling-design.md` § 2 QA-10.3                                                              |
| **QA-10.4** DOM Cross-Sections  | 2     | Extension of `tests/visual/screenshots.spec.ts` — JSON sidecars committed alongside QA-09 PNGs at `tests/visual/__baselines__/{name}-{width}-{mode}.styles.json` | `PDR-007` § Decision — Phase 2 • `audit-tooling-design.md` § 2 QA-10.4                                                              |
| **QA-10.5** OG + RSS Audit MVP  | 2     | `scripts/audit-og-rss.mjs`                                                                                                                                       | `PDR-007` § Decision — Phase 2 • `audit-tooling-design.md` § 2 QA-10.5                                                              |
| **QA-10.6** Rendering Modes     | 3     | `tests/visual/rendering-modes.spec.ts` + `*-{rendering}.png` baselines under `tests/visual/__baselines__/`                                                       | `PDR-007` § Decision — Phase 3 • `PDR-007` § Constraint 1 (Linux-Chromium fidelity ceiling) • `audit-tooling-design.md` § 2 QA-10.6 |

Governing-section references resolve to `hq/docs/decisions/PDR-007-ui-audit-strategy.md` and `hq/docs/website/audit-tooling-design.md` in the sibling HQ repo. Component scripts and specs land with their owning phase; until a component ships, the surface path above is the committed target, not an existing file.

### Threshold allowlist (QA-10.2)

Per `hq/docs/decisions/PDR-007-ui-audit-strategy.md` § Constraint 5, QA-10.2's self-generating width list is paired with a reviewer-maintained allowlist at `tests/audit/threshold-significance.json`. Entries carry `threshold_px`, `reason`, `source_file`, `added`, and `review_by` (90-day cadence); expired entries fail the audit. Schema, lifecycle rules, and review cadence are tracked in **[#119](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/119)**; design reference at `hq/docs/website/audit-tooling-design.md` § 6 Item 16.

### Runbooks

Per-component operational docs land inside `tests/audit/` alongside the specs they govern. They are tracked as separate issues so the runbook and the component-that-needs-it can land together:

| Runbook                                             | Location (when issue closes)            | Tracking                                                                |
| --------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| Evolving home-page invariants (QA-10.3)             | `tests/audit/INVARIANTS-RUNBOOK.md`     | [#123](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/123) |
| Registering new route archetypes (QA-10.1)          | `tests/audit/ROUTE-CLUSTERS-RUNBOOK.md` | [#124](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/124) |
| Phase N → N+1 gate checklist (PDR-007 Constraint 4) | `tests/audit/PHASE-GATES.md`            | [#125](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/125) |

Design reference for the runbook contents: `hq/docs/website/audit-tooling-design.md` § 6 Items 14, 15, 17.

---

## Baselines must be Linux-generated

Applies to **both** QA-09 and QA-10 baseline artifacts that are rendered by Chromium. CI runs on `ubuntu-latest`; Chromium font rasterization, anti-aliasing, and emoji fallback differ subtly between macOS and Linux — even with identical self-hosted fonts, a baseline taken on macOS will produce diff-pixels on Ubuntu. This is an accepted fidelity ceiling (`hq/docs/decisions/PDR-007-ui-audit-strategy.md` § Constraint 1), not a gap.

**Playwright-rendered baselines must be generated inside the official Playwright Linux container**, matching the CI environment exactly. Other committed artifacts (Node-produced JSON such as `route-clusters.json`, or hand-maintained data like the allowlist) are deterministic under Node and do not strictly need Docker — but commit-source discipline around audit baselines recommends using the same container for consistency. The per-component table below is authoritative.

Per-component baseline expectations (`hq/docs/website/audit-tooling-design.md` § 6 Item 12):

| Component | Baseline artifact                                         | Docker required?                                                                                                   |
| --------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| QA-09     | `tests/visual/__baselines__/*.png`                        | **Yes** — committed pixel baselines                                                                                |
| QA-10.1   | `tests/audit/__baselines__/route-clusters.json`           | Recommended — determinism is high in principle, but commit-source discipline matches other Playwright-based audits |
| QA-10.2   | `tests/audit/threshold-significance.json`                 | No — author-maintained allowlist, not a baseline                                                                   |
| QA-10.3   | None (no baselines; boolean invariant assertions)         | N/A                                                                                                                |
| QA-10.4   | `tests/visual/__baselines__/*.styles.json` sidecars       | **Yes** — regenerated with the QA-09 PNGs in the same Docker run                                                   |
| QA-10.5   | None (source of truth is post frontmatter + RSS 2.0 spec) | N/A                                                                                                                |
| QA-10.6   | `tests/visual/__baselines__/*-{rendering}.png`            | **Required** — Linux-Chromium fidelity ceiling applies strictly                                                    |

Regenerate with a single Docker invocation for QA-09 today:

```bash
# Run from the repo root. Version tag must match devDependencies.@playwright/test.
docker run --rm \
  -v "$(pwd)":/work \
  -w /work \
  -e CI=true \
  mcr.microsoft.com/playwright:v1.59.1-noble \
  sh -c "npm ci && npm run test:visual:update"
```

The same container will regenerate audit baselines via `npm run test:audit:update` once the audit script family lands (design reference: `hq/docs/website/audit-tooling-design.md` § 6 Item 10). Docker parity for the audit baseline family is tracked in **[#128](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/128)**; when that ticket closes a sibling `tests/audit/README.md` may absorb the QA-10-specific portion of this section.

This produces byte-identical baselines to what CI will compare against on the next push. Local regeneration on macOS or Windows is not authoritative — per `hq/docs/website/audit-tooling-design.md` § 5 Risk 3, PRs that touch rendering-mode baselines should state in the commit message that they were regenerated in Docker.

---

## Relationship with `.tmp/branch-build-screenshots/`

`/.tmp/branch-build-screenshots/` contains **66 pre-existing screenshots** from the PDR-006 branch-build mobile-polish work. They are:

- **Not regression baselines.** They were per-branch snapshots used for human visual comparison during the Wave 1–3 mobile redesign.
- **Artifacts of a past workflow**, preserved because the PDR-006 work treated them as inline-rendered deliverables in GitHub.
- **Not consumed by either QA-09 or QA-10.** Nothing in `tests/visual/` or `tests/audit/` reads, writes, or diffs against them.

The canonical regression baselines for post-launch visual integrity live under `tests/visual/__baselines__/` (QA-09 PNGs today, QA-10.4 style sidecars and QA-10.6 rendering-mode PNGs as those phases land). The branch-build screenshots are kept for historical provenance only — see `.gitignore` for the scoped retention exception.
