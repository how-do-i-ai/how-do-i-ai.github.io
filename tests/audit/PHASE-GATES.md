# PDR-007 phase gates — governance checklist

> Source of truth: [PDR-007 § Constraint 4](../../../hq/docs/decisions/PDR-007-ui-audit-strategy.md) (HQ repo, private — see [CONTRIBUTING § Cross-repo setup](../../CONTRIBUTING.md#cross-repo-setup)).

This document encodes the phase-boundary rule from PDR-007: **Phase N+1 of the UI audit tooling does not start until Phase N is green in CI for ≥2 consecutive merged PRs, with at least one of those PRs adding a new route or touching design tokens.** The rule exists to prevent stacking untested audit layers on top of each other — the failure mode that produced the PDR-006 constraint 6 amendment.

## This gate is NOT auto-enforced

**There is no CI check for phase boundaries.** The gate is a governance artifact reviewed by humans when a "Start Phase N+1" issue is opened (template: [`start-phase-n.md`](../../.github/ISSUE_TEMPLATE/start-phase-n.md)). Skipping the gate — opening a Phase N+1 work item without verifying this checklist — re-introduces the stacking-failure risk PDR-007 was designed to prevent.

Reviewers enforce it. PRs that add Phase N+1 components without a signed-off gate-review issue should be held until the gate issue is opened AND signed.

## Phase 1 → Phase 2 gate

Phase 1 components: **QA-10.1** (Route Clustering, issue [#120](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/120)), **QA-10.2** (Critical Widths, issue [#122](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/122)), **QA-10.3** (Invariant Specs MVP, issue [#121](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/121)).

Before opening any Phase 2 work (QA-10.4, QA-10.5):

- [ ] **All three Phase 1 components merged to `main`.**
  - QA-10.1 merged in PR #____ on ________
  - QA-10.2 merged in PR #____ on ________
  - QA-10.3 merged in PR #____ on ________
- [ ] **All three green in CI on ≥2 consecutive merged PRs** (two PRs in which every Phase 1 audit step passed on the `main`-targeted run).
  - Consecutive PR 1: #____ (merged ________) — evidence link: ____
  - Consecutive PR 2: #____ (merged ________) — evidence link: ____
- [ ] **At least one of those two PRs added a new route OR modified design tokens.** (Routes = new entry under `src/pages/`; tokens = change to `src/styles/tokens.css` or equivalent variables file.)
  - Route/token change: PR #____ — describe: ________
- [ ] **Pre-Phase-1 CI-time baseline recorded.** Capture the average wall-clock time of the last 3 CI runs on `main` BEFORE the first Phase 1 component merged. This number is the denominator for the Phase 2 → 3 gate's 2× threshold and the post-Phase-3 monitoring 3× threshold.
  - Pre-Phase-1 baseline: ______ seconds (CI run links: ____, ____, ____)

### Sign-off

| Reviewer | Date | Signature (GitHub handle) |
| --- | --- | --- |
| Brand owner / delegate | ________ | ________ |

Once signed: open Phase 2 work items. Until signed: Phase 2 PRs are not eligible for merge.

## Phase 2 → Phase 3 gate

Phase 2 components: **QA-10.4** (DOM Cross-Sections, issue [#132](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/132)), **QA-10.5** (OG + RSS Audit MVP, issue [#133](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/133)).

Before opening any Phase 3 work (QA-10.6):

- [ ] **Both Phase 2 components merged to `main`.**
  - QA-10.4 merged in PR #____ on ________
  - QA-10.5 merged in PR #____ on ________
- [ ] **Both green in CI on ≥2 consecutive merged PRs.**
  - Consecutive PR 1: #____ (merged ________) — evidence link: ____
  - Consecutive PR 2: #____ (merged ________) — evidence link: ____
- [ ] **CI-time delta within budget.** Measure current CI wall-clock time (average of last 3 `main` runs) and compare to the pre-Phase-1 baseline captured at the Phase 1 → 2 gate. Current/baseline must be **< 2×** (PDR-007 § Trigger for Revisit — "CI time budget exceeded (>2× current at Phase 2 completion)").
  - Current CI time: ______ seconds (CI run links: ____, ____, ____)
  - Ratio vs pre-Phase-1 baseline: ______ × (must be < 2.0)
  - If ≥ 2.0: do NOT proceed to Phase 3 — evaluate parallelization, path-filtered execution, or per-component conditional CI per PDR-007 revisit trigger.

### Sign-off

| Reviewer | Date | Signature (GitHub handle) |
| --- | --- | --- |
| Brand owner / delegate | ________ | ________ |

Once signed: open Phase 3 work item (#134). Until signed: Phase 3 PRs are not eligible for merge.

## Post-Phase-3 monitoring

Phase 3 component: **QA-10.6** (Rendering Modes, issue [#134](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/134)).

**No further phase gate.** Once QA-10.6 is green and merged, the PDR-007 adoption sequence is complete. Ongoing oversight shifts to the revisit triggers in [PDR-007 § Trigger for Revisit](../../../hq/docs/decisions/PDR-007-ui-audit-strategy.md). Each trigger, when fired, informs rollback or scope changes — not a new gate.

Monitor continuously (check at every `pdr-007-audit` PR review):

- [ ] **CI-time ratio vs pre-Phase-1 baseline remains < 3×.** If the ratio crosses 3×, fire PDR-007 revisit trigger "CI time budget exceeded (>3× at Phase 3)" — evaluate parallelization, path-filtered execution (e.g., QA-10.6 runs only on `src/**/*.{css,astro}` changes), or per-component conditional execution. May amend PDR-007.
- [ ] **QA-10.2 allowlist growth stays within cadence.** Per PDR-007 revisit trigger, **> 4 `threshold-significance.json` allowlist additions per 90-day window** signals audit-signal degradation. Re-evaluate the threshold-derivation rule or allowlist review cadence. Track additions in the allowlist file commit history.
- [ ] **Phase 1 component fails phase-boundary gate in retrospect.** If a QA-10.1/10.2/10.3 regression emerges after Phase 2 or 3 landed, fire the "Phase 1 component fails phase-boundary gate" trigger — may produce PDR-008 (re-scope of Phase 1 or new component).
- [ ] **New audit surface emerges.** Structured data / JSON-LD, email templates, podcast RSS beyond blog RSS, etc. Evaluate whether it fits an existing QA-10 component or warrants a Phase 4. Not governed by this gate; governed by a new PDR if adopted.
- [ ] **Linux-Chromium fidelity gap widens.** New rendering-mode feature adopted by macOS/Windows but not Linux Chromium → re-evaluate QA-10.6 scope cap; PDR-007 Constraint 1 may need amendment.
- [ ] **Playwright adds `prefers-reduced-data` emulation.** Restore the fourth rendering mode in QA-10.6 — dropped from scope in audit-tooling-design.md § QA-10.6 because `emulateMedia()` does not expose it in Playwright 1.59.1.
- [ ] **3-year persistence assumption falsified.** Project direction changes — re-evaluate long-term-lens phasing. Short-term-optimized phasing from PDR-007 § Alternatives Considered is the fallback.

Post-Phase-3 revisits do not need a gate-review issue; they are handled as PDR amendments or new PDRs as scope requires.

## How to use this document

1. **When ready to start Phase N+1**: open a new issue from the [`start-phase-n.md`](../../.github/ISSUE_TEMPLATE/start-phase-n.md) template. The template is pre-filled with the relevant gate's checklist.
2. **Fill every line.** Blanks in the checklist are evidence gaps; the gate is not passed until every line carries specific data (PR numbers, dates, CI run links, measured CI-time values).
3. **Reviewer signs off** by editing the Sign-off row directly in this document via PR (same PR that opens the Phase N+1 scaffolding, or a separate governance PR that lands first).
4. **After sign-off**: Phase N+1 work items become eligible to land.

## Why this document exists

PDR-007 § Constraint 4 states the phase-boundary rule. Without a physical checklist, the rule lives only as prose in a decision record — easy to forget, easy to reinterpret, easy to skip "just this once." The stacking-failure risk PDR-007 is designed to prevent is exactly the kind of failure that emerges from skipped governance. Phase 2 landing before Phase 1's false-positive rate is understood, or Phase 3 landing before the Phase-2 CI-time budget is measured, would re-create that risk.

This is a paper trail. It exists so future reviewers — including future-you — have a concrete artifact to sign, not a memory of a decision to recall.

## Related

- [PDR-007: UI Audit Strategy](../../../hq/docs/decisions/PDR-007-ui-audit-strategy.md) — the authoritative decision. Constraint 4 and § Trigger for Revisit are the sources encoded here. (HQ repo, private.)
- [Audit tooling design](../../../hq/docs/website/audit-tooling-design.md) § 6 Item 17 — design scope for this document. (HQ repo, private.)
- [`tests/visual/README.md`](../visual/README.md) — visual-regression suite (QA-09); distinct from but colocated with audit tooling (QA-10).
- [`.github/ISSUE_TEMPLATE/start-phase-n.md`](../../.github/ISSUE_TEMPLATE/start-phase-n.md) — pre-filled "Start Phase N+1" issue template.
