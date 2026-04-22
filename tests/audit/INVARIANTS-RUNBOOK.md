# QA-10.3 home-page invariants — evolution runbook

> Source of truth: [PDR-007 § Consequences — baseline maintenance burden](../../../hq/docs/decisions/PDR-007-ui-audit-strategy.md) and [audit-tooling-design.md § 6 Item 14](../../../hq/docs/website/audit-tooling-design.md) (HQ repo, private — see [CONTRIBUTING § Cross-repo setup](../../CONTRIBUTING.md#cross-repo-setup)).

This document codifies how the QA-10.3 invariant set — the Playwright `test()` blocks in [`tests/audit/invariants.spec.ts`](./invariants.spec.ts) — evolves as the site's design evolves intentionally. The MVP set is five home-page assertions ([#121](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/121)); Invariant 6 ([#147](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/147)) and Invariant 7 ([#148](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/148)) were added post-MVP as successive applications of the runbook's § When to add trigger 2 ("a new failure class is discovered") — both surfaced by the F1/F2 findings of the same PDR-007 UI-review pass. Undisciplined edits to that set defeat QA-10.3's purpose: **invariants are the institutional memory of the design decisions that must not regress**. Every add and every remove passes through this runbook.

## What an invariant is (and is not)

An **invariant** is a boolean assertion on measurable DOM/CSSOM state at a bounded set of viewports, read from a live preview of the site. It encodes a design decision — a PDR, a REQ, or a named failure class — as a predicate that either holds or does not.

Invariants are distinct from QA-09 visual regression (`tests/visual/screenshots.spec.ts`). QA-09 answers "did anything change relative to baseline?" QA-10.3 answers "is the design intent still upheld?" See [`tests/visual/README.md`](../visual/README.md) § "QA-09 visual regression vs QA-10 UI audit tooling" for the full distinction. Both gates coexist; neither replaces the other.

An invariant is **not**:

- A pixel-exact measurement. Sub-pixel font-metric drift between macOS and Linux invalidates such assertions on the first non-CI development session. See [audit-tooling-design.md § QA-10.3 "Linux-parity approach"](../../../hq/docs/website/audit-tooling-design.md).
- A duplicate of QA-09. If the only thing an invariant catches is "pixels shifted," it is not an invariant — it is a baseline, and QA-09 already owns baselines.
- A convenience snapshot of current behavior. Every invariant names a decision it defends. "The header is blue" is not an invariant. "`--color-accent` resolves to a non-empty color value at every viewport in both modes, per REQ-HOME-01 / PDR-004" is.

## When to add an invariant

Add an invariant when **any one** of these triggers fires:

1. **A new PDR or design decision lands** that imposes a design constraint expressible as a boolean geometric or CSSOM predicate. The invariant is the runtime guard that keeps the decision from silently eroding over the 3-year project horizon ([PDR-007 § Assumption A1](../../../hq/docs/decisions/PDR-007-ui-audit-strategy.md)). Example: PDR-006 constraint 6 (nav collapse band) produced Invariant 4 (`.pillar-links ∩ .nav-actions = ∅`), encoding the PR #99 B1 regression class.
2. **A new failure class is discovered** during PR review, visual-regression triage, or production. Encoding the failure as an invariant converts a one-time catch into a standing guarantee. The reverse-test pattern in [`invariants.reverse.spec.ts`](./invariants.reverse.spec.ts) is how we prove the invariant actually catches the class it was written for.
3. **A new page type enters the canonical surface set.** Today that set is home (`/`), blog index (`/blog/`), and a representative post (`/blog/sample-post/`) — see [`tests/visual/README.md`](../visual/README.md) § "What this guards". When QA-10.1 route clustering ([`tests/audit/routes.spec.ts`](./routes.spec.ts) + [`ROUTE-CLUSTERS-RUNBOOK.md`](./ROUTE-CLUSTERS-RUNBOOK.md) once landed) registers a new archetype, evaluate whether the new page type carries design decisions that warrant invariants of its own.

Not every PDR or failure class produces an invariant. If the decision is already covered by QA-06/07/08/09 (Lighthouse, touch targets, axe-core, visual regression), there is no new gap to guard. Add an invariant only when the decision falls between those gates — which is exactly QA-10.3's purpose ([PDR-007 § Decision](../../../hq/docs/decisions/PDR-007-ui-audit-strategy.md)).

## When to remove an invariant

**The only valid reason to remove or weaken an invariant is PDR supersession.** A later PDR retires the decision the invariant defends; the invariant retires with it, referenced from the retiring PDR's cascade log.

**Not valid reasons to remove an invariant:**

- "It is inconvenient." Inconvenience is the cost of the guarantee. PDR-007 § Consequences accepted this cost explicitly.
- "It is noisy." A genuinely noisy invariant signals a design-spec drift, not a spec-is-wrong condition. The remedy is to fix the drift or refine the predicate (boolean tolerance tuning), not retire the guard.
- "It is hard to maintain." Maintenance burden is measured by runbook edits and predicate refinements, both of which are reviewed. If the predicate requires rewriting because the DOM structure it probes has been refactored, update the selector in [`selectors.ts`](./selectors.ts) and the predicate in [`helpers.ts`](./helpers.ts) — the invariant itself (what it asserts about design intent) stays.
- "Nobody remembers why it is there." Every invariant's docblock names the PDR/REQ that justifies it (see § How to author below). "Nobody remembers" is a documentation bug, not a retirement signal.

**Deprecation procedure.** When a PDR supersedes a prior decision and the old invariant must retire:

1. The retiring PDR names the invariant(s) in its cascade log. The PDR is the primary artifact; the invariant retirement is a consequence, not a standalone decision.
2. A PR removes the invariant's `test()` block, removes any predicate-specific helpers from [`helpers.ts`](./helpers.ts), and — if no other consumer uses them — removes selectors from [`selectors.ts`](./selectors.ts).
3. The PR description references the retiring PDR explicitly. The reviewer's job in that PR is to verify the PDR does supersede the invariant's justification, not merely to approve the deletion.
4. No separate issue is needed; the retiring PDR's implementation is the tracking surface.

**Soft-disable is not a retirement.** `test.skip()` on an invariant without a supporting PDR is a protocol violation. If an invariant is failing legitimately (the site regressed), fix the site. If it is failing because the predicate is wrong (the assertion no longer matches the design intent), fix the predicate. If it is failing because the design intent changed, write the PDR first.

## How to author an invariant

Invariants live in [`tests/audit/invariants.spec.ts`](./invariants.spec.ts) as flat Playwright `test()` blocks. Shared browser-side predicates live in [`helpers.ts`](./helpers.ts). Shared selectors live in [`selectors.ts`](./selectors.ts). Do not duplicate these across files.

### 1. Prefer boolean geometric predicates over pixel-exact measurements

[Design doc § 2.3](../../../hq/docs/website/audit-tooling-design.md) and the Linux-parity constraint require this. Pixel-exact measurements are invalidated by sub-pixel font-metric drift between macOS and Linux. Boolean predicates (overlap / no-overlap, orphan / no-orphan, present / absent, weight-at-least) absorb that drift.

Working shapes:

- **Intersection tests** (Invariant 4): does bounding rect A intersect bounding rect B? AABB overlap, no pixel distance.
- **Line membership tests** (Invariant 3): group `Range.getClientRects()` into visual lines with a 1px `top`-coordinate tolerance; assert a property of the first / last line (e.g., "contains at least one non-accent rect"). The tolerance is what absorbs the drift.
- **Computed-style comparisons** (Invariants 1, 5): compare `getComputedStyle(...).fontWeight` numerically, or assert `getComputedStyle(...).position !== 'sticky'`. Font-weight and position are color-scheme-independent; one run per viewport is enough.
- **CSS custom property resolution** (Invariant 2): `getComputedStyle(document.documentElement).getPropertyValue('--color-accent')` — assert non-empty and regex-matches a color format. OS-independent.

When the design decision is inherently a numeric threshold (e.g., "contrast ratio ≥ 4.5:1"), the appropriate gate is usually QA-08 axe-core, not QA-10.3. If a new numeric-threshold design decision emerges that axe-core cannot express, document the predicate with Linux baselining explicitly in the docblock, and accept that the assertion is only authoritatively re-tunable inside the Playwright Linux Docker container (see [`tests/visual/README.md`](../visual/README.md) § "Baselines must be Linux-generated").

### 2. Colocate selectors in `tests/audit/selectors.ts`

Every DOM selector used by an invariant must be a reference into [`tests/audit/selectors.ts`](./selectors.ts). Two reasons:

- QA-10.4 (DOM Cross-Sections, Phase 2) consumes the same selector set ([audit-tooling-design.md § QA-10.4 "Dependencies"](../../../hq/docs/website/audit-tooling-design.md)). Divergence between QA-10.3 and QA-10.4 selector sets defeats the shared-selector design.
- A future Nav/hero refactor should require exactly one file update ([`selectors.ts`](./selectors.ts)), not N parallel updates across specs.

If a new invariant needs a selector not yet in [`selectors.ts`](./selectors.ts), add it in the same PR that adds the invariant. The `SelectorKey` type is exported for callers that need it; the object is declared `as const` so keys are literal-typed.

### 3. Name against a referenceable decision

Every invariant's `test()` title carries a human-readable assertion. Every invariant's docblock (the `/** ... */` comment immediately above the `test()` call) names the PDR or REQ that justifies it.

Title pattern (present-tense assertion):

```ts
test('Invariant N: {what the predicate asserts, in plain English}', ...)
```

Manifest-key pattern (when the invariant is registered in a future manifest — see [audit-tooling-design.md § QA-10.3 "Inputs"](../../../hq/docs/website/audit-tooling-design.md) on the manifest-vs-inline threshold at >10 invariants):

```
invariant_{subject}_{verb}_{PDR|REQ}_{id}
```

Examples from the MVP set (and Invariants 6 / 7, added post-MVP):

- `invariant_wordmark_strongest_REQ_NAV_02` (Invariant 1 — REQ-NAV-02)
- `invariant_color_accent_resolves_REQ_HOME_01_PDR_004` (Invariant 2 — REQ-HOME-01 / PDR-004)
- `invariant_hero_tagline_no_accent_orphan_PDR_004` (Invariant 3 — PDR-004 § Wrap behavior 2026-04-19 amendment)
- `invariant_pillar_nav_no_overlap_PDR_006_C6` (Invariant 4 — PDR-006 constraint 6)
- `invariant_site_nav_no_sticky_fixed_REQ_MOB_04` (Invariant 5 — REQ-MOB-04 forward-compat)
- `invariant_latest_eyebrow_aligned_PDR_007_147` (Invariant 6 — PDR-007 discovery case, issue #147)
- `invariant_home_block_axis_consistency_PDR_007_148` (Invariant 7 — PDR-007 discovery case, issue #148)

The docblock must:

- Name the PDR / REQ / amendment date in the first paragraph.
- Quote the specific constraint line when useful (e.g., Invariant 3 quotes PDR-004 "no accent word may stand alone on the first or last line of its phrase").
- State the predicate shape in one sentence ("Predicate: bounding-box intersection test (AABB). No pixel-exact distance measurement; collision is boolean.").
- When the invariant encodes a specific historical regression, name the PR and viewport ("Encodes the PR #99 B1 regression: at 480vp, flex-wrap: nowrap made .pillar-links overflow…").

### 4. Pair every invariant with a reverse test (recommended)

[`invariants.reverse.spec.ts`](./invariants.reverse.spec.ts) exists because **an invariant that has never been observed to fail is an invariant whose detection is unverified**. The reverse-test pattern injects a CSS override that produces a concrete, targeted violation, then asserts the predicate correctly detects it with measurement-rich output.

The MVP reverse spec covers Invariant 1 as a worked example (issue [#121](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/121) AC). Additional invariants do not strictly require their own reverse test at MVP, but authoring one is the strongest way to establish that a new predicate is not a silent-pass. The shared-helpers pattern in [`helpers.ts`](./helpers.ts) (predicates exported so forward and reverse specs run the identical code) is mandatory for reverse-tested invariants: if the forward spec and reverse spec held different copies of the predicate, the reverse spec would vouch for a predicate that is not the one gating CI.

### 5. Emit rich measurements on failure

Failure messages must carry concrete data, not just `expect(x).toBe(y)`. The MVP pattern:

- Each viewport / mode run returns a `measurement` object with `pass: boolean` + whatever numeric / structural evidence led to that verdict (computed weights, bounding rects, line counts, violation lists with selector + text preview).
- `assertAllRunsPassed` (see [`invariants.spec.ts`](./invariants.spec.ts)) formats the measurement blob into the failure message so the CI log shows **why** the gate fired, not just **that** it fired.
- A per-run JSON summary is written to `tests/audit/__reports__/invariants-report.json` (gitignored) so CI artifacts can surface the same data for post-hoc review.

Measurements make runbook updates possible. A week from now, a reviewer seeing "Invariant 4 failed at 480vp, `pillars.right = 428`, `actions.left = 316`" can reason about the regression. A reviewer seeing only "Invariant 4 failed" cannot.

## PR review checklist — invariant changes

Apply this checklist to every PR that adds, removes, or modifies an invariant. Reviewers enforce it; CI does not.

**For PRs that add an invariant:**

- [ ] **Named against a referenceable decision.** The invariant's `test()` title, docblock, and (if used) manifest key cite a PDR / REQ / amendment date. "Obvious" design choices that are not in a PDR/REQ are not invariants — they are conventions. Convert the convention to a decision record first, then add the invariant.
- [ ] **Selector reused from [`selectors.ts`](./selectors.ts), or added there with justification.** If the new invariant touches DOM that no existing selector names, the PR extends [`selectors.ts`](./selectors.ts) in the same diff. The justification is a one-line comment above the new key describing what it addresses ("added for Invariant N — REQ-XXX-NN").
- [ ] **Predicate is boolean (geometric or CSSOM), not pixel-exact.** See § How to author rule 1. If the predicate must be numeric (rare), the docblock explicitly states the Linux-baselining requirement and the tolerance rationale.
- [ ] **Expected failure mode is documented.** The docblock names what a failure looks like in practice: which viewport(s), what property, what historical regression class it guards (when applicable). "Predicate returns `pass: false`" is not a documented failure mode. "At 480vp the `.pillar-links` overflow overlaps `.nav-actions`, obscuring the theme toggle (PR #99 B1 class)" is.
- [ ] **Measurement output is rich.** Failure messages include concrete numeric / structural evidence. The reviewer can evaluate the failure without running the spec locally.
- [ ] **Reverse-test pairing considered.** For invariants encoding a specific named regression class, a reverse test in [`invariants.reverse.spec.ts`](./invariants.reverse.spec.ts) is strongly recommended. If omitted, the PR description states why (e.g., "predicate shape is CSSOM-only and trivially verifiable by inspection").

**For PRs that remove or weaken an invariant:**

- [ ] **A PDR supersedes the invariant's justification.** The PR description cites the retiring PDR by path and section. "Inconvenient," "noisy," "hard to maintain," and "nobody remembers why" are rejected grounds (§ When to remove).
- [ ] **The retiring PDR's cascade log names the invariant.** The retirement is downstream of the PDR, not of the PR. If the PDR does not mention the invariant, either the PDR is incomplete or the retirement is unauthorized; both block the PR.
- [ ] **Shared artifacts are cleaned up atomically.** If the removed invariant was the only consumer of a helper in [`helpers.ts`](./helpers.ts) or a selector in [`selectors.ts`](./selectors.ts), remove those in the same PR. Orphan selectors / helpers accumulate review overhead.
- [ ] **No `test.skip()` as a partial-retire shortcut.** Either fully remove or fully restore. A skipped invariant with no PDR backing is a protocol violation (§ "Soft-disable is not a retirement").

**For PRs that modify an existing invariant (predicate refinement, tolerance adjustment, viewport expansion):**

- [ ] **The design intent has not changed** — only the predicate's expression of it. If intent has shifted, write a PDR first; the PR modifying the invariant follows the PDR.
- [ ] **The refinement has a measurement-backed reason.** E.g., "tolerance relaxed from 0px to 1px to absorb sub-pixel font-metric drift observed on CI run https://github.com/how-do-i-ai/how-do-i-ai.github.io/actions/runs/NNNN". "Seems to flake sometimes" is not a measurement.
- [ ] **Reverse coverage still holds.** If a paired reverse test exists, verify it still fails the refined predicate on the same injected violation.

## Worked example — adding an invariant for a new design token

Scenario: a future PDR-00N adopts a new design token `--color-surface-elevated` intended for cards, callouts, and interactive tiles, with a light/dark pair defined in `src/styles/tokens.css`. The design decision is that every `.card` element resolves its `background-color` to `--color-surface-elevated` at every viewport and in both color schemes — the token swap is the entire mechanism by which dark-mode card contrast is maintained.

Walk-through against the add-an-invariant triggers (§ When to add):

- **Trigger 1 — new PDR** fires: PDR-00N introduces the token and the contract.
- **Trigger 2 — failure class**: an earlier review noticed a `.card` using `background: var(--color-surface)` (the base surface) by accident, producing indistinguishable card-on-surface contrast in dark mode. That is the failure class this invariant guards.
- **QA gap check**: QA-06 Lighthouse and QA-08 axe-core would catch a catastrophic contrast failure, but not the specific "wrong token was referenced" class. QA-09 visual regression would catch it, but only after the PR that introduced it — and the diff would be interpreted as "intentional dark-mode adjustment" by a reviewer unfamiliar with PDR-00N. The invariant closes that gap.

Authoring steps:

1. **Selector** — add to [`selectors.ts`](./selectors.ts):

   ```ts
   export const SELECTORS = {
     // ...existing...
     card: '.card',
     surfaceElevatedProbe: ':root', // read --color-surface-elevated from document root
   } as const;
   ```

   Justification comment above the new keys: `// added for Invariant N — PDR-00N "--color-surface-elevated adoption"`.

2. **Predicate shape** — boolean, CSSOM-only (no geometry):
   - Resolve `--color-surface-elevated` from `document.documentElement` (light + dark).
   - For every `.card` in the DOM, compute `getComputedStyle(card).backgroundColor` and assert it parses to the same color value as the token.
   - Color comparison is string-normalized (`rgb(...)` vs `rgba(...)` whitespace, case) — no pixel sampling. CSSOM returns a canonical `rgb(...)` string for computed `background-color`, so normalization is tractable.

3. **Spec** — append to [`invariants.spec.ts`](./invariants.spec.ts) following the existing docblock + viewport-loop pattern:

   ```ts
   /* -------------------------------------------------------------------------
    * Invariant N — Every .card background-color resolves to --color-surface-elevated.
    *
    * PDR-00N § Tokens: "--color-surface-elevated is the sole card background
    * source; direct color literals and --color-surface are both regressions."
    * Guards the failure class observed in PR #MMM where a .card used
    * var(--color-surface) and silently broke dark-mode contrast.
    *
    * Predicate: for every .card in the DOM, getComputedStyle(card).backgroundColor
    * === getComputedStyle(document.documentElement).getPropertyValue('--color-surface-elevated')
    * after CSS color normalization. CSSOM-only; OS-independent.
    * ----------------------------------------------------------------------- */
   test('Invariant N: .card background resolves to --color-surface-elevated (both modes)', async ({
     browser,
   }) => {
     const viewports = [320, 768, 1440];
     const modes: Mode[] = ['light', 'dark'];
     // ... viewport × mode loop, page.evaluate with the predicate, push to results[],
     // assertAllRunsPassed at end (see Invariant 2 for the exact shape).
   });
   ```

4. **Reverse test** — add to [`invariants.reverse.spec.ts`](./invariants.reverse.spec.ts): inject `.card { background: red !important }`, assert the predicate detects the violation with the card's selector, its actual `backgroundColor` value, and the expected token value in the failure measurement.

5. **Predicate helper** — if the normalization logic is non-trivial (e.g., parsing both `rgb(…)` and `rgba(…, 1)` to the same canonical form), extract it to [`helpers.ts`](./helpers.ts) so forward and reverse specs share it.

6. **PR review** — apply the § PR review checklist. The checklist items flow directly from PDR-00N (referenceable decision ✓), selector addition with justification ✓, CSSOM boolean predicate ✓, documented failure mode (PR #MMM ✓), rich measurement (per-card `.card → backgroundColor` list in failure output ✓), reverse test paired ✓.

Outcome: every future PR that touches cards or tokens runs this invariant on `/`. A `.card` in a new component that forgets the token, or a future refactor that changes `--color-surface-elevated` without updating `.card` styles, fails CI with a measurement naming the specific card selectors and the actual-vs-expected color values. The PDR-00N decision becomes a runtime guarantee, not a prose commitment.

## Related

- [PDR-007 — UI Audit Strategy](../../../hq/docs/decisions/PDR-007-ui-audit-strategy.md) § Consequences (baseline maintenance burden) — the authorizing decision for QA-10.3 and this runbook. (HQ repo, private.)
- [audit-tooling-design.md](../../../hq/docs/website/audit-tooling-design.md) § QA-10.3 (design) and § 6 Item 14 (runbook scope). (HQ repo, private.)
- [`invariants.spec.ts`](./invariants.spec.ts) — the forward spec; source of truth for which invariants currently exist.
- [`invariants.reverse.spec.ts`](./invariants.reverse.spec.ts) — the reverse-detection proof pattern.
- [`helpers.ts`](./helpers.ts) — shared browser-side predicates.
- [`selectors.ts`](./selectors.ts) — shared DOM selectors (also consumed by QA-10.4).
- [`tests/visual/README.md`](../visual/README.md) — QA-09 vs QA-10 distinction; component map; Linux-baseline rule.
- [`PHASE-GATES.md`](./PHASE-GATES.md) — companion governance runbook (Phase 1 → 2 → 3 gates per PDR-007 Constraint 4).
- [Issue #123](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/123) — tracking issue for this runbook.
- [Issue #121](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/121) — QA-10.3 MVP invariant specs (the five MVP invariants this runbook governs).
- [Issue #147](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/147) — Invariant 6 (`.latest-section` eyebrow alignment) — the first post-MVP addition under the § When to add trigger 2 ("new failure class discovered") path; a worked example of the add-an-invariant flow.
- [Issue #148](https://github.com/how-do-i-ai/how-do-i-ai.github.io/issues/148) — Invariant 7 (`.hero` / `.latest-section` horizontal alignment consistency) — second post-MVP addition; guards the "three blocks, three axes" failure class where the pre-#148 hero filled the viewport while `.latest-section` sat in a 48rem centered container, producing visually-divergent container widths at wide viewports.
