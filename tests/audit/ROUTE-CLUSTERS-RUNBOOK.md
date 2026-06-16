# QA-10.1 Route Clustering — archetype runbook

This runbook governs [`tests/audit/__baselines__/route-clusters.json`](./__baselines__/route-clusters.json) and the archetype-registration workflow consumed by [QA-10.1 (`routes.spec.ts`)](./routes.spec.ts).

> Source of truth: [PDR-007 § Decision — Phase 1 (#6 Route Clustering)](../../../hq/docs/decisions/PDR-007-ui-audit-strategy.md) and [audit-tooling-design.md § 2 QA-10.1 / § 6 Item 15](../../../hq/docs/website/audit-tooling-design.md) (private HQ repo — see [CONTRIBUTING.md § Cross-repo setup](../../CONTRIBUTING.md#cross-repo-setup)).

## What QA-10.1 gates, and what the tunable is

QA-10.1 hashes the canonical DOM skeleton of each route (stripping text, attribute values, `data-*` values, inline-style values — keeping tag + sorted classes + children) and compares against a **committed archetype set** at [`tests/audit/__baselines__/route-clusters.json`](./__baselines__/route-clusters.json). A route's hash either matches a registered archetype or the gate fails. No similarity, no distance, no threshold.

The single tunable is the **skeleton normalization algorithm** — what the walker in [`routes.spec.ts`](./routes.spec.ts) strips vs. keeps. If normalization changes, every archetype hash re-baselines in the same PR (see [§ Normalization changes](#normalization-changes)).

When a new page archetype emerges (resource pages, author bios, category indexes, video embeds …), someone must register it explicitly. The procedures below make that step boring and auditable so archetype sprawl does not accumulate as silent hash churn.

## Registering a new archetype

Use this procedure when a new page shape ships (e.g., a new `src/pages/**/*.astro` that is structurally distinct from the five registered archetypes: `home`, `blog-index`, `blog-post`, `about`, `error`).

1. **Build locally and run the audit against the current baseline.**

   ```bash
   npm run test:audit:routes
   ```

   The spec walks `dist/sitemap-index.xml` + `dist/sitemap-0.xml`, navigates each route via the preview server, and compares hashes against [`tests/audit/__baselines__/route-clusters.json`](./__baselines__/route-clusters.json). Any unregistered route fails with a message shaped like:

   ```
   Unregistered route: /author/alexey/ (source: sitemap)
     actual skeleton_hash: 3f2a9c…
     hash matches NO existing archetype. Either:
       (i) register /author/alexey/ under a new archetype in
           tests/audit/__baselines__/route-clusters.json and rerun
           UPDATE_BASELINE=1, or
       (ii) bring the route's structure in line with an existing archetype.
   ```

   Copy the `actual skeleton_hash` from the failure output (it is also recorded in `tests/audit/__reports__/routes-report.json` — gitignored, regenerated per run).

2. **Decide whether this really is a new archetype or a drift of an existing one.** Cross-check the failure message: if the reporter says _"hash matches existing archetype `<name>`"_, do NOT register a new archetype — add the route to `route_assignments` under `<name>` and move on. New archetypes are justified only when the `<main>` skeleton (stripped of text and attribute values) is genuinely different in shape.

   If unsure, inspect both pages' rendered DOM side-by-side (`npx playwright test --project=audit-routes --debug` pauses at each route and opens Playwright Inspector — see [§ Debugging procedure](#debugging-procedure)). Drift within an archetype is the more common case; new archetypes are the exception, not the default.

3. **Name the archetype.** Names are stable identifiers (kebab-case, singular, role-not-route). Examples: `blog-post`, `author-bio`, `resource-card`, `video-post`. Names appear in the committed JSON and in failure messages; choose one that another reviewer will interpret correctly a year from now without reading the `src/pages/` tree.

4. **Edit [`tests/audit/__baselines__/route-clusters.json`](./__baselines__/route-clusters.json)** manually in the same PR that introduces the new page. Append the archetype under `archetypes` and assign the route(s) under `route_assignments`:

   ```jsonc
   {
     "archetypes": {
       // … existing entries …
       "author-bio": {
         "skeleton_hash": "<paste actual hash from step 1>",
         "canonical_path": "/author/alexey/",
         "registered": "2026-04-21",
       },
     },
     "route_assignments": {
       // … existing entries …
       "/author/alexey/": "author-bio",
     },
   }
   ```

   Fields:
   - `skeleton_hash` — the SHA-256 hex digest emitted by the spec. Copy verbatim.
   - `canonical_path` — the single route treated as the authoritative source for this archetype's hash. Baseline regeneration (`UPDATE_BASELINE=1`) refreshes `skeleton_hash` from THIS path's current hash only; other routes assigned to the archetype are checked against it. See the `afterAll` block in [`routes.spec.ts`](./routes.spec.ts) for why.
   - `registered` — the date the archetype enters the baseline (YYYY-MM-DD). Historical marker; not consumed by the gate.

5. **Assign every route of that shape in `route_assignments`.** If `/author/alexey/`, `/author/taylor/`, and `/author/jordan/` all share the same `author-bio` shape, all three need explicit assignments. The spec fails on any unregistered route found in the sitemap.

6. **Regenerate the baseline hash in Docker.** For Playwright-rendered baselines the committed source of truth is Linux — see [`tests/visual/README.md` § Baselines must be Linux-generated](../visual/README.md#baselines-must-be-linux-generated). Route-clusters JSON is deterministic under Node in principle, but commit-source discipline recommends regenerating it in the same Docker container as other Playwright-based audits:

   ```bash
   docker run --rm -v "$(pwd)":/work -w /work -e CI=true \
     mcr.microsoft.com/playwright:v1.60.0-noble \
     sh -c "npm ci && UPDATE_BASELINE=1 npm run test:audit:routes"
   ```

   `UPDATE_BASELINE=1` refreshes `skeleton_hash` for any archetype whose `canonical_path` route already appears in `route_assignments`. Unregistered routes still fail in update mode — baseline regeneration must never silently absorb a new route. Archetype registration (step 4) is a human authorship step by design.

7. **Rerun the audit green.**

   ```bash
   npm run test:audit:routes
   ```

   All routes should now either match their assigned archetype or be absent from `route_assignments` (in which case they were never in the sitemap to begin with — the spec tests the union of sitemap routes and registered routes).

8. **PR review confirms the archetype is genuinely new.** The reviewer's job is to answer: "Would registering this route under an existing archetype have worked?" If yes, the new archetype is noise — revise. If no, approve. This review is the whole point of requiring archetype registration to go through a PR.

## Merging archetypes

Rare. Two archetypes can converge to identical skeletons after a refactor (e.g., the `about` page's `<main>` is rewritten to match the `home` archetype's shape, or two blog sub-layouts collapse into a single template). When this happens, the spec flags **category drift**:

```
Category drift: /about/ is registered as "about" but its skeleton hash
matches archetype "home".
  actual skeleton_hash: d29359e9…
  If this drift is intentional, update route_assignments to "home".
  Otherwise, a recent change converged two archetypes — revisit the
  structural difference.
```

Procedure, when the convergence IS intentional:

1. **Verify hashes match.** The failure message already names the matching archetype. Cross-check in [`tests/audit/__baselines__/route-clusters.json`](./__baselines__/route-clusters.json): the two archetypes have identical `skeleton_hash` values, or one archetype's `skeleton_hash` equals another's after the current change lands.

2. **Choose the canonical name.** Prefer the archetype with more routes assigned (lowest migration churn) and the more general name (`home` over `about` when the pages share structure). Document the reason in the PR description so future reviewers understand why the loser was retired.

3. **Remap `route_assignments`.** Change every assignment pointing at the deprecated archetype to the canonical one.

4. **Remove the deprecated archetype entry** from `archetypes`. Do not leave orphaned definitions — they read as dead weight and invite confusion.

5. **Rerun `npm run test:audit:routes`**. The spec should pass green with the collapsed archetype set.

Archetype merges are not reversible without another PR. If the convergence is accidental (the refactor did not intend to collapse shapes), revert the structural change rather than merging archetypes — this preserves the semantic distinction the gate is designed to protect.

## Normalization changes

The walker in [`routes.spec.ts`](./routes.spec.ts) extracts `{tag, classes (sorted, lowercase), children[]}` from `<main>` recursively — no text, no attribute values, no `data-*` values, no inline-style values. That set of strip/keep choices is the **normalization algorithm**.

**Any change to what the skeleton walker strips or keeps re-baselines ALL archetypes in the same PR. Never partial re-baseline.** This is a non-negotiable procedure, not a guideline.

Why: the skeleton-hash match is an exact equality check. If the normalization shifts for one archetype (e.g., "also strip `role` attribute values") but not others, the archetypes become mutually incomparable — the hash of `blog-post` under the new normalization cannot be compared against the hash of `home` under the old. The gate passes green on internal inconsistency.

Procedure when you need to change normalization:

1. **Modify the extraction logic in [`routes.spec.ts`](./routes.spec.ts)'s `page.evaluate()` block** — the `extract(el)` inner function. Keep the return shape `{tag, classes, children}` stable; only add/remove what is stripped.

2. **Regenerate every archetype hash** with `UPDATE_BASELINE=1` in Docker:

   ```bash
   docker run --rm -v "$(pwd)":/work -w /work -e CI=true \
     mcr.microsoft.com/playwright:v1.60.0-noble \
     sh -c "npm ci && UPDATE_BASELINE=1 npm run test:audit:routes"
   ```

   All `skeleton_hash` values in [`tests/audit/__baselines__/route-clusters.json`](./__baselines__/route-clusters.json) should change together (or several will, and a reviewer verifies the unchanged ones are genuinely invariant under the normalization shift).

3. **Commit normalization change + baseline regeneration in the same commit.** Do not split across commits. The baseline without the normalization change is invalid; the normalization change without the regenerated baseline fails CI.

4. **Document the normalization change in the commit/PR description.** State what strip-or-keep choice changed, and why. Future readers (including future-you) need to understand why every hash shifted at once.

A partial re-baseline — updating only the hashes that broke on CI — looks innocent and silently degrades the gate. Reviewers flag any PR that modifies normalization without touching every archetype's hash as a procedure violation, not a subjective preference.

## Design position — NO similarity thresholds

QA-10.1 does not use k-means clustering, Jaccard distance, fuzzy matching, or any other similarity-based approach. This is a locked design decision, not an implementation detail.

Source: [PDR-007 § Decision — Phase 1](../../../hq/docs/decisions/PDR-007-ui-audit-strategy.md) and [audit-tooling-design.md § 5 Risk 2](../../../hq/docs/website/audit-tooling-design.md) (private HQ repo).

Why similarity-based clustering is rejected:

- **Instability at small n.** At 5–30 routes (the realistic range for this site across a 3-year persistence window), k-means produces different cluster assignments on identical inputs depending on initialization. Jaccard distance requires a threshold knob that trades false positives against false negatives with no principled setting.
- **Silent false-positive absorption.** A legitimate new archetype whose skeleton is "close to" an existing one gets absorbed into the wrong cluster. The gate passes green while the semantic distinction is lost.
- **The review gate is the whole point.** Requiring explicit archetype registration via PR is the mechanism that catches "this page is structurally different in a way that matters." A similarity algorithm auto-absorbs that signal into a cluster.

The single tunable is the **normalization algorithm** (see [§ Normalization changes](#normalization-changes)) — what the walker strips or keeps. It is a binary choice per attribute/content type, not a continuous knob. If a future PR proposes reintroducing similarity-based matching, that PR must amend PDR-007 first — do not land the code change on its own authority.

The revisit trigger for this design position, in [PDR-007 § Trigger for Revisit](../../../hq/docs/decisions/PDR-007-ui-audit-strategy.md) and [audit-tooling-design.md § 7](../../../hq/docs/website/audit-tooling-design.md): a legitimate route archetype requires fuzzy matching that exact skeleton hash cannot express. The bar is high by design.

## Debugging procedure

When the spec fails and the failure message alone isn't enough to diagnose — typically: "I see `/foo/` has `actual skeleton_hash: abc…` and `expected skeleton_hash: def…`, but I don't know what structurally differs" — use the procedure below to read the difference in a human-scannable form.

### Available today — no extra tooling

1. **Re-read the per-run report.** Every audit run writes `tests/audit/__reports__/routes-report.json` (gitignored — do not click through, the path resolves at runtime). It contains, for each route: `actual_hash`, `expected_hash`, `matches`, and `drift_archetype` (the archetype whose hash the route's actual hash matched, if any). When two routes are expected to share an archetype and don't, `drift_archetype` often names the culprit.

2. **Open the failing route in Playwright Inspector.** From the repo root:

   ```bash
   npm run build
   npx playwright test --project=audit-routes --debug
   ```

   Playwright pauses at each `page.goto`; you can open DevTools in the launched browser and inspect the `<main>` subtree directly. Compare against the archetype's `canonical_path` route rendered in the same session.

3. **Patch the spec temporarily to dump the skeleton JSON.** Add a single line after the `hash` computation in [`routes.spec.ts`](./routes.spec.ts):

   ```ts
   console.log(`${route}\n${JSON.stringify(skeleton, null, 2)}`);
   ```

   Re-run `npm run test:audit:routes`. Each route prints its stripped skeleton tree to stdout. Diff two such outputs with `diff -u` or your editor's JSON diff viewer. Remove the patch before committing — it is a debug aid, not production logging.

4. **Re-render both routes in the browser and compare** via DevTools' Elements panel. Because the skeleton strips text and attribute values, visual inspection of the rendered DOM is often enough to spot the structural difference — an added wrapper div, a shifted class, a missing `<section>`.

### Future helper — `scripts/diff-skeletons.mjs`

The first time the procedures above are too slow for an ad-hoc debug session, author `scripts/diff-skeletons.mjs` (not yet committed — see the sibling scripts under [`scripts/`](../../scripts/) for the Node + Playwright script style already in use) as a companion to this runbook. Design scope: [audit-tooling-design.md § 6 Item 15](../../../hq/docs/website/audit-tooling-design.md) (private HQ repo). Intended signature and output:

```bash
# Compare skeletons for two routes against the running preview server.
node scripts/diff-skeletons.mjs /blog/sample-post/ /blog/other-post/
```

Expected output: a tree-diff of the two extracted skeletons (tag + classes, nested), with added/removed subtrees called out in the margin. The script is deferred intentionally — the procedures in this section cover every debug need the Phase 1 archetype set has surfaced. Authoring it alongside the first real debugging session ensures the output format matches the shape of the problem instead of being speculative.

When authored, update this section to replace the "Future helper" block with "how to run it" + a representative example of the output.

## Worked example: registering `/author/alexey/`

Hypothetical: a new `src/pages/author/[slug].astro` page ships, generating `/author/alexey/`, `/author/taylor/`, and `/author/jordan/`. Structurally these are author-bio pages — a header with the author's name, a portrait, a bio paragraph, and a list of posts — distinct from `blog-post`, `about`, or `home`.

1. **Build and run.**

   ```bash
   npm run build
   npm run test:audit:routes
   ```

2. **Read the failure.** The spec fails:

   ```
   Unregistered route: /author/alexey/ (source: sitemap)
     actual skeleton_hash: 4a7e8f1b90c2d3e4567890abcdef1234567890abcdef1234567890abcdef1234
     hash matches NO existing archetype. Either:
       (i) register /author/alexey/ under a new archetype in
           tests/audit/__baselines__/route-clusters.json and rerun
           UPDATE_BASELINE=1, or
       (ii) bring the route's structure in line with an existing archetype.

   Unregistered route: /author/taylor/ (source: sitemap)
     actual skeleton_hash: 4a7e8f1b90c2d3e4567890abcdef1234567890abcdef1234567890abcdef1234
     hash matches NO existing archetype. …

   Unregistered route: /author/jordan/ (source: sitemap)
     actual skeleton_hash: 4a7e8f1b90c2d3e4567890abcdef1234567890abcdef1234567890abcdef1234
     …
   ```

   All three have the same `actual skeleton_hash` — good sign, they share a shape.

3. **Confirm it is genuinely new.** The `home`, `blog-index`, `blog-post`, `about`, and `error` archetypes already have distinct hashes in [`tests/audit/__baselines__/route-clusters.json`](./__baselines__/route-clusters.json); none match `4a7e8f1b…`. Inspect `/author/alexey/` in Playwright Inspector (`npx playwright test --project=audit-routes --debug`) — confirm its `<main>` shape (header + portrait + bio + post list) does not match any existing archetype's layout.

4. **Pick a name.** `author-bio` reads as role-not-route, singular, kebab-case — matches the convention used by `blog-post` and `blog-index`.

5. **Edit [`tests/audit/__baselines__/route-clusters.json`](./__baselines__/route-clusters.json):**

   ```jsonc
   {
     "archetypes": {
       "home": {
         "skeleton_hash": "d29359e9…",
         "canonical_path": "/",
         "registered": "2026-04-21",
       },
       "blog-index": {
         "skeleton_hash": "b9d088df…",
         "canonical_path": "/blog/",
         "registered": "2026-04-21",
       },
       "blog-post": {
         "skeleton_hash": "088aec23…",
         "canonical_path": "/blog/sample-post/",
         "registered": "2026-04-21",
       },
       "about": {
         "skeleton_hash": "822e794b…",
         "canonical_path": "/about/",
         "registered": "2026-04-21",
       },
       "error": {
         "skeleton_hash": "24ea3a7f…",
         "canonical_path": "/404.html",
         "registered": "2026-04-21",
       },
       "author-bio": {
         "skeleton_hash": "4a7e8f1b90c2d3e4567890abcdef1234567890abcdef1234567890abcdef1234",
         "canonical_path": "/author/alexey/",
         "registered": "2026-05-15",
       },
     },
     "route_assignments": {
       "/": "home",
       "/blog/": "blog-index",
       "/blog/sample-post/": "blog-post",
       "/about/": "about",
       "/404.html": "error",
       "/author/alexey/": "author-bio",
       "/author/taylor/": "author-bio",
       "/author/jordan/": "author-bio",
     },
   }
   ```

   (Abbreviated hash values for readability — use the full SHA-256 hex in the real file.)

6. **Regenerate in Docker** so the committed hash matches what Linux CI will compute:

   ```bash
   docker run --rm -v "$(pwd)":/work -w /work -e CI=true \
     mcr.microsoft.com/playwright:v1.60.0-noble \
     sh -c "npm ci && UPDATE_BASELINE=1 npm run test:audit:routes"
   ```

   `UPDATE_BASELINE=1` refreshes `author-bio`'s `skeleton_hash` from `/author/alexey/` (the canonical path) and writes the regenerated baseline back. The other archetypes' hashes don't change unless the page structure shifted.

7. **Rerun green.**

   ```bash
   npm run test:audit:routes
   ```

   All eight routes (five pre-existing + three author pages) now match their assigned archetypes.

8. **Open the PR.** Call out the new archetype in the PR description: _"Adds `author-bio` archetype for the new `src/pages/author/[slug].astro` pages. Structurally distinct from `blog-post` (no article body, no tags; has portrait + post list)."_ The reviewer verifies the shape is genuinely new and approves.

## Related

- [PDR-007 § Decision — Phase 1 (#6 Route Clustering)](../../../hq/docs/decisions/PDR-007-ui-audit-strategy.md) — the authoritative decision. Design position "no similarity thresholds" and the tunable-is-normalization rule are sourced here. (HQ repo, private.)
- [audit-tooling-design.md § 2 QA-10.1 / § 5 Risk 2 / § 6 Item 15](../../../hq/docs/website/audit-tooling-design.md) — solution design for QA-10.1, clustering-instability risk, and the original scaffolding scope for this runbook. (HQ repo, private.)
- [`tests/audit/routes.spec.ts`](./routes.spec.ts) — the spec this runbook governs. Failure messages cross-link here for archetype-registration procedure.
- [`tests/audit/__baselines__/route-clusters.json`](./__baselines__/route-clusters.json) — the committed archetype set.
- [`tests/visual/README.md`](../visual/README.md) — QA-09 / QA-10 distinction, runbook index, Linux-baseline rule.
- [`tests/audit/PHASE-GATES.md`](./PHASE-GATES.md) — PDR-007 phase-boundary governance (the Phase 1 → Phase 2 gate that QA-10.1 participates in).
- [`tests/audit/THRESHOLD-ALLOWLIST.md`](./THRESHOLD-ALLOWLIST.md) — sibling QA-10.2 allowlist lifecycle doc (same documentation style).
