# QA-10.2 Critical Widths — threshold allowlist lifecycle

This document governs [`threshold-significance.json`](./threshold-significance.json), the allowlist consumed by QA-10.2 Critical Widths.

## What the allowlist is

QA-10.2 extracts every `min-width` / `max-width` / `min-device-width` / `max-device-width` / `min-resolution` threshold from built CSS (`dist/_astro/*.css`) and classifies each one as:

1. **Covered** — the threshold is already in the QA-09 canonical width set, or
2. **Allowlisted** — the threshold is present in this allowlist and the entry is not past its `review_by` date, or
3. **Unhandled** — neither of the above, which fails the audit.

The allowlist exists so that thresholds we **intentionally tolerate** (third-party CSS breakpoints, typo artifacts mid-repair, deliberate outliers that don't warrant a new QA-09 width) do not drown signal with noise. See [PDR-007 § Constraints on implementation, item 5](../../../hq/docs/decisions/PDR-007-ui-audit-strategy.md) for the driving decision and [audit-tooling-design § 6 Item 16](../../../hq/docs/website/audit-tooling-design.md) for the original scaffolding scope.

> HQ paths above resolve via the sibling-directory convention documented in [`CONTRIBUTING.md` § Cross-repo setup](../../CONTRIBUTING.md#cross-repo-setup). The HQ repo is private; references are for provenance, not click-through.

## Initial state

Empty. Phase 1 install ships `threshold-significance.json` with `"allowlist": []`. The audit runs against built CSS from day one — with nothing allowlisted, every extracted threshold resolves to either **covered** (classified cleanly via the QA-09 width set) or **unhandled** (audit fails and the PR author decides what to do about it). No scaffolding entries are required to enable this flow.

## Entry schema

Each allowlist entry is an object with five required fields. The companion JSON Schema at [`threshold-significance.schema.json`](./threshold-significance.schema.json) is authoritative; this section is a human-readable summary.

| Field          | Type                | Description                                                                                                                                                                                      |
| -------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `threshold_px` | number              | The CSS threshold value in px (em/rem normalized to px at 16px root).                                                                                                                            |
| `reason`       | string              | Why this threshold is allowlisted rather than promoted or removed. Name the source (third-party, intentional outlier, typo mid-repair).                                                          |
| `source_file`  | string              | The built CSS file containing the `@media` rule that produces this threshold (e.g., `dist/_astro/_id_.DamDMsb6.css`). The hashed filename at time of addition is fine — it documents provenance. |
| `added`        | string (YYYY-MM-DD) | The date the entry was added. Must be the PR author's working date or the merge day; no back-dating.                                                                                             |
| `review_by`    | string (YYYY-MM-DD) | The date the entry expires. Convention is `added` + 90 days.                                                                                                                                     |

## Adding an entry

When a QA-10.2 run surfaces an unhandled threshold that shouldn't be promoted to the QA-09 width set and shouldn't be removed from the CSS, add it to the allowlist via PR.

1. Open [`threshold-significance.json`](./threshold-significance.json) and append an entry to the `allowlist` array.
2. Fill all five fields:
   - `threshold_px`: copy the number from the QA-10.2 failure report.
   - `reason`: one sentence. If you cannot explain why the threshold is tolerable in one sentence, it probably shouldn't be allowlisted — promote it to QA-09 widths or fix the CSS instead.
   - `source_file`: copy the file path from the failure report.
   - `added`: today's date in YYYY-MM-DD.
   - `review_by`: today + 90 days in YYYY-MM-DD.
3. Commit on the PR that introduces or reveals the threshold (not on a separate cleanup PR — the allowlist entry lives with the change that makes it necessary).
4. Call out the allowlist addition in the PR description so the reviewer can classify the decision rather than just approve a green CI.

## Review cadence

**Quarterly.** Every 90 days, a reviewer walks the allowlist and, for each entry whose `review_by` is in the past:

- **Extend** — re-justify the entry and bump `review_by` by another 90 days. Use sparingly; a second extension without a path to removal is a signal the allowlist is becoming a graveyard.
- **Promote** — if the threshold has earned its place in the canonical width set, add it to QA-09 widths via the shared source (`tests/config/widths.ts` per the QA-10.2 design) and remove the allowlist entry.
- **Remove and fix** — if the underlying CSS is the real problem, fix the CSS, rebuild, verify QA-10.2 no longer surfaces the threshold, and remove the allowlist entry.

## Expired-entry behaviour

When `review_by` is strictly before today, QA-10.2 MUST fail on that entry even if the threshold would otherwise match. Expired entries are not "soft warnings" — the fail is the forcing function that triggers the extend / promote / remove decision. Suppressing the fail without making one of those three decisions defeats the allowlist's purpose.

## Revisit trigger (PDR-007)

If **more than 4 entries are added within any 90-day window**, the allowlist is absorbing signal that should be addressed at the source — either the audit's threshold-derivation rule is too loose, or the allowlist review cadence is too slow, or both. Per [PDR-007 § Trigger for Revisit](../../../hq/docs/decisions/PDR-007-ui-audit-strategy.md), this condition re-opens the audit's design — not just the allowlist's contents.

## What the allowlist is not

- **Not a silencer.** An allowlist entry is a deferred decision, not a permanent exemption. Every entry has an expiry; every expiry forces a fresh call.
- **Not a substitute for QA-09 widths.** Thresholds that matter for layout correctness belong in the canonical width set, which is tested by pixel-diff as well as audit. Allowlist is for thresholds we tolerate, not thresholds we rely on.
- **Not a place to absorb churn.** If the allowlist grows faster than entries retire, the audit is miscalibrated. Fix the miscalibration (revisit trigger above), not the symptom.
