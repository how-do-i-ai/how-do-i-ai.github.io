---
name: "Start Phase N+1 (PDR-007 audit tooling)"
about: "Governance review to authorize opening Phase N+1 work items per PDR-007 Constraint 4."
title: "Governance: Start Phase __ — PDR-007 phase gate review"
labels: pdr-007-audit,documentation,priority:must
assignees: ""
---

<!--
  This template opens a governance review issue for the PDR-007 phase-boundary gate.
  Fill the relevant section below (Phase 1 → 2 OR Phase 2 → 3). Delete the unused section.
  Source: tests/audit/PHASE-GATES.md
-->

> **Driving decision:** PDR-007 § Constraint 4 (HQ repo, private — see [`CONTRIBUTING.md § Cross-repo setup`](https://github.com/how-do-i-ai/how-do-i-ai.github.io/blob/main/CONTRIBUTING.md#cross-repo-setup)).
>
> This template encodes the gate documented in [`tests/audit/PHASE-GATES.md`](https://github.com/how-do-i-ai/how-do-i-ai.github.io/blob/main/tests/audit/PHASE-GATES.md): Phase N+1 does NOT start until Phase N is green in CI on ≥2 consecutive merged PRs, with at least one of those PRs adding a new route or touching design tokens.

## Which gate is this?

- [ ] **Phase 1 → Phase 2** (QA-10.1 / QA-10.2 / QA-10.3 → QA-10.4 / QA-10.5)
- [ ] **Phase 2 → Phase 3** (QA-10.4 / QA-10.5 → QA-10.6)

Delete the section below that does NOT apply.

---

## Phase 1 → Phase 2 checklist

- [ ] **All three Phase 1 components merged to `main`.**
  - QA-10.1 (Route Clustering, #120) merged in PR #____ on ________
  - QA-10.2 (Critical Widths, #122) merged in PR #____ on ________
  - QA-10.3 (Invariant Specs MVP, #121) merged in PR #____ on ________
- [ ] **All three green in CI on ≥2 consecutive merged PRs.**
  - Consecutive PR 1: #____ (merged ________) — evidence link: ____
  - Consecutive PR 2: #____ (merged ________) — evidence link: ____
- [ ] **At least one of those two PRs added a new route OR modified design tokens.**
  - Route/token change: PR #____ — describe: ________
- [ ] **Pre-Phase-1 CI-time baseline recorded.** (Average of last 3 CI runs on `main` BEFORE the first Phase 1 component merged. Used as denominator at the Phase 2 → 3 gate.)
  - Pre-Phase-1 baseline: ______ seconds (CI run links: ____, ____, ____)

### Sign-off (Phase 1 → Phase 2)

| Reviewer | Date | Signature (GitHub handle) |
| --- | --- | --- |
| Brand owner / delegate | ________ | ________ |

On sign-off: update `tests/audit/PHASE-GATES.md` § Phase 1 → Phase 2 gate sign-off row in the same or a companion PR, then open Phase 2 work items (#132, #133).

---

## Phase 2 → Phase 3 checklist

- [ ] **Both Phase 2 components merged to `main`.**
  - QA-10.4 (DOM Cross-Sections, #132) merged in PR #____ on ________
  - QA-10.5 (OG + RSS Audit MVP, #133) merged in PR #____ on ________
- [ ] **Both green in CI on ≥2 consecutive merged PRs.**
  - Consecutive PR 1: #____ (merged ________) — evidence link: ____
  - Consecutive PR 2: #____ (merged ________) — evidence link: ____
- [ ] **CI-time delta within budget (< 2× pre-Phase-1 baseline).**
  - Pre-Phase-1 baseline (from Phase 1 → 2 gate record): ______ seconds
  - Current CI time (avg of last 3 `main` runs): ______ seconds (CI run links: ____, ____, ____)
  - Ratio: ______ × (must be < 2.0)
  - If ≥ 2.0: STOP — evaluate parallelization, path-filtered execution, or per-component conditional CI per PDR-007 § Trigger for Revisit before re-opening this gate.

### Sign-off (Phase 2 → Phase 3)

| Reviewer | Date | Signature (GitHub handle) |
| --- | --- | --- |
| Brand owner / delegate | ________ | ________ |

On sign-off: update `tests/audit/PHASE-GATES.md` § Phase 2 → Phase 3 gate sign-off row in the same or a companion PR, then open Phase 3 work item (#134).

---

## Reminder

This gate is **not auto-enforced**. CI will not block a Phase N+1 PR merely because this issue is unsigned. The gate is governance — reviewers enforce it. A Phase N+1 PR opened or merged without a signed-off gate-review issue should be treated as a protocol violation and held until this issue is signed.

See [`tests/audit/PHASE-GATES.md`](https://github.com/how-do-i-ai/how-do-i-ai.github.io/blob/main/tests/audit/PHASE-GATES.md) for the full rationale and the post-Phase-3 monitoring list.
