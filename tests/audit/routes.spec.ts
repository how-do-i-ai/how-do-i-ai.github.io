/**
 * QA-10.1 — Route clustering via sitemap walk + DOM skeleton hash (Phase 1).
 *
 * Enumerates every route in the built sitemap (`dist/sitemap-index.xml` +
 * `dist/sitemap-0.xml`) plus any route explicitly registered in the
 * baseline's `route_assignments`. For each route, extracts the canonical
 * DOM skeleton inside `<main>` (tag + sorted lowercase classes + children,
 * recursively), SHA-256 hashes the canonical JSON, and fails when:
 *
 *   (a) a route's hash is not a registered archetype AND the route is not
 *       explicitly registered in `route_assignments` (unregistered route),
 *       OR
 *   (b) a route is registered under one archetype but its hash matches a
 *       DIFFERENT archetype's reference (category drift).
 *
 * Exact skeleton-hash matching — explicitly not similarity-based
 * clustering (see PDR-007 § Decision Phase 1; audit-tooling-design § 5
 * Risk 2). The tunable is the normalization performed by the walker
 * (what it strips vs keeps), not a distance threshold.
 *
 * Sources:
 *  - PDR-007 § Decision Phase 1 (HQ repo; private)
 *  - audit-tooling-design.md § 2.1 (HQ repo; private)
 *  - Archetype decisions resolved at 2026-04-21 refinement, captured in
 *    GitHub issue #120 description.
 *
 * Baseline regeneration is authoritative in the Playwright Linux Docker
 * image — see `tests/visual/README.md` § Baselines must be Linux-generated.
 * Run `UPDATE_BASELINE=1 npm run test:audit:routes` inside the container
 * to refresh `tests/audit/__baselines__/route-clusters.json`.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(dirname(TESTS_DIR));
const DIST_DIR = join(REPO_ROOT, 'dist');
const BASELINE_PATH = join(TESTS_DIR, '__baselines__', 'route-clusters.json');
const REPORT_DIR = join(TESTS_DIR, '__reports__');
const REPORT_PATH = join(REPORT_DIR, 'routes-report.json');

// UPDATE_BASELINE=1 refreshes committed archetype hashes from the current
// build (only for routes that match an archetype's canonical_path — see
// afterAll). Unregistered routes still fail even in update mode to keep
// the human-in-the-loop archetype-registration step explicit; hash-only
// drift within registered routes is absorbed silently, which is the
// point of running update.
const UPDATE_BASELINE = process.env.UPDATE_BASELINE === '1';

interface Archetype {
  skeleton_hash: string;
  canonical_path: string;
  registered: string;
}

interface Baseline {
  archetypes: Record<string, Archetype>;
  route_assignments: Record<string, string>;
}

interface SkeletonNode {
  tag: string;
  classes: string[];
  children: SkeletonNode[];
}

type RouteSource = 'sitemap' | 'registered' | 'both';

interface RouteResult {
  route: string;
  source: RouteSource;
  registered_archetype: string | null;
  actual_hash: string;
  expected_hash: string | null;
  matches: boolean;
  drift_archetype: string | null;
}

function readBaseline(): Baseline {
  if (!existsSync(BASELINE_PATH)) {
    throw new Error(
      `Baseline missing: ${BASELINE_PATH}\n` +
        `Create the baseline with initial archetypes and regenerate hashes ` +
        `via UPDATE_BASELINE=1 npm run test:audit:routes inside the ` +
        `Playwright Linux Docker container.`,
    );
  }
  const raw = readFileSync(BASELINE_PATH, 'utf8');
  const parsed = JSON.parse(raw) as Partial<Baseline>;
  if (!parsed.archetypes || !parsed.route_assignments) {
    throw new Error(
      `Baseline ${BASELINE_PATH} is malformed: missing "archetypes" or ` +
        `"route_assignments".`,
    );
  }
  return parsed as Baseline;
}

/**
 * Parse `<loc>...</loc>` values from a sitemap XML file.
 *
 * Regex-based rather than a full XML parser — `@astrojs/sitemap` emits
 * stable, unescaped URLs inside flat `<loc>` tags. Matches the vanilla-Node
 * discipline of other audit-tooling scripts (`check-playwright-version-parity.mjs`),
 * avoids pulling in an XML parser for a trivial extraction.
 */
function parseSitemapLocs(filePath: string): string[] {
  if (!existsSync(filePath)) {
    throw new Error(
      `Sitemap file missing: ${filePath}. Did the build run first? ` +
        `Run \`npm run build\` before invoking this spec, or use the ` +
        `\`test:audit:routes\` script which chains build + test.`,
    );
  }
  const content = readFileSync(filePath, 'utf8');
  const matches = [...content.matchAll(/<loc>([^<]+)<\/loc>/g)];
  return matches.map((m) => m[1]);
}

/**
 * Walk sitemap-index → per-sitemap files → URLs, returning pathnames.
 *
 * `@astrojs/sitemap` emits absolute URLs (https://how-do-i.ai/...); we
 * strip the origin and keep the pathname only, because Playwright's
 * `page.goto` resolves relative paths against `use.baseURL` (the preview
 * server), not the production origin.
 */
function collectSitemapRoutes(distDir: string): string[] {
  const indexPath = join(distDir, 'sitemap-index.xml');
  const sitemapUrls = parseSitemapLocs(indexPath);

  const routes: string[] = [];
  for (const sitemapUrl of sitemapUrls) {
    // sitemap-index entries are themselves absolute URLs pointing to
    // per-sitemap files. Extract just the filename to locate the file
    // on disk in `dist/`.
    const filename = sitemapUrl.split('/').pop();
    if (!filename) {
      throw new Error(`Sitemap index entry has no filename: ${sitemapUrl}`);
    }
    const sitemapFilePath = join(distDir, filename);
    for (const urlStr of parseSitemapLocs(sitemapFilePath)) {
      routes.push(new URL(urlStr).pathname);
    }
  }
  return routes;
}

function hashSkeleton(skeleton: SkeletonNode): string {
  // Object keys are emitted in insertion order by Node's JSON.stringify, and
  // extractSkeleton constructs nodes with fixed key order (tag, classes,
  // children), so the serialized form is deterministic without needing a
  // custom canonicalizer.
  const canonical = JSON.stringify(skeleton);
  return createHash('sha256').update(canonical).digest('hex');
}

function findMatchingArchetype(
  hash: string,
  archetypes: Record<string, Archetype>,
  excludeName: string | null = null,
): string | null {
  for (const [name, archetype] of Object.entries(archetypes)) {
    if (name === excludeName) continue;
    if (archetype.skeleton_hash === hash) return name;
  }
  return null;
}

// Tests share the `results` array via closure and write the aggregated
// report in afterAll — serial mode keeps every test in the same worker
// so the shared array is consistent. The audit is fast (five routes),
// and parallelization here would save ~1s for significantly less robust
// reporting.
test.describe.configure({ mode: 'serial' });

test.describe('QA-10.1 Route Clustering', () => {
  const baseline = readBaseline();
  const sitemapRoutes = collectSitemapRoutes(DIST_DIR);
  const sitemapRouteSet = new Set(sitemapRoutes);
  const registeredRouteSet = new Set(Object.keys(baseline.route_assignments));

  // Test UNION: sitemap routes catch newly-added pages (fail as unregistered
  // until someone updates route_assignments); registered routes catch
  // explicitly-tracked non-sitemap surfaces (/404.html, not in sitemap
  // because error pages shouldn't be indexed).
  const allRoutes = Array.from(
    new Set([...sitemapRouteSet, ...registeredRouteSet]),
  ).sort();

  const results: RouteResult[] = [];

  test.afterAll(() => {
    mkdirSync(REPORT_DIR, { recursive: true });

    // Compute the post-update archetype set first so both the written baseline
    // (in update mode) and the report's `archetypes` field agree. In normal
    // mode, updatedArchetypes equals baseline.archetypes (no-op copy).
    // Refresh ONLY from each archetype's canonical_path route: if two routes
    // share an archetype (which is allowed — route_assignments is a map),
    // naive iteration would let the last result in order silently bless a
    // drifted/mismatching route. canonical_path is the single authoritative
    // source per archetype.
    const updatedArchetypes: Record<string, Archetype> = {
      ...baseline.archetypes,
    };
    if (UPDATE_BASELINE) {
      for (const result of results) {
        const archetypeName = result.registered_archetype;
        if (!archetypeName) continue;
        const archetype = updatedArchetypes[archetypeName];
        if (!archetype) continue;
        if (result.route !== archetype.canonical_path) continue;
        updatedArchetypes[archetypeName] = {
          ...archetype,
          skeleton_hash: result.actual_hash,
        };
      }
    }

    const report = {
      generated_at: new Date().toISOString(),
      update_mode: UPDATE_BASELINE,
      archetypes: updatedArchetypes,
      results,
      unregistered_routes: results
        .filter((r) => r.registered_archetype === null)
        .map((r) => r.route),
      drift_routes: results
        .filter((r) => r.drift_archetype !== null)
        .map((r) => ({
          route: r.route,
          registered_as: r.registered_archetype,
          matches_archetype: r.drift_archetype,
        })),
    };
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

    if (UPDATE_BASELINE) {
      const updatedBaseline: Baseline = {
        archetypes: updatedArchetypes,
        route_assignments: { ...baseline.route_assignments },
      };
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify(updatedBaseline, null, 2)}\n`,
      );
    }
  });

  for (const route of allRoutes) {
    test(`${route} — DOM skeleton matches registered archetype`, async ({
      page,
    }) => {
      const inSitemap = sitemapRouteSet.has(route);
      const isRegistered = registeredRouteSet.has(route);
      const source: RouteSource =
        inSitemap && isRegistered
          ? 'both'
          : inSitemap
            ? 'sitemap'
            : 'registered';

      await page.goto(route, { waitUntil: 'networkidle' });

      const skeleton = (await page.evaluate(() => {
        function extract(el: Element): {
          tag: string;
          classes: string[];
          children: unknown[];
        } {
          const children: unknown[] = [];
          for (const child of Array.from(el.children)) {
            children.push(extract(child));
          }
          const classes = Array.from(el.classList)
            .map((c) => c.toLowerCase())
            .sort();
          // Fixed key order (tag, classes, children) matches the host-side
          // SkeletonNode shape; JSON.stringify preserves insertion order,
          // making the hash deterministic.
          return {
            tag: el.tagName.toLowerCase(),
            classes,
            children,
          };
        }
        const main = document.querySelector('main');
        if (!main) {
          throw new Error(
            `No <main> element on ${window.location.pathname} — ` +
              `cannot extract skeleton (expected by BaseLayout).`,
          );
        }
        return extract(main);
      })) as SkeletonNode;

      const hash = hashSkeleton(skeleton);

      const registeredArchetype = baseline.route_assignments[route] ?? null;
      // Catch route_assignments that name a non-existent archetype early.
      // Otherwise the downstream "Skeleton mismatch" error reports
      // `expected: null` which is hard to diagnose.
      if (
        registeredArchetype !== null &&
        !(registeredArchetype in baseline.archetypes)
      ) {
        throw new Error(
          `Unknown archetype in route_assignments: "${registeredArchetype}" ` +
            `(route: ${route}). Either add an archetype with that name to ` +
            `baseline.archetypes, or correct the route_assignments entry.`,
        );
      }
      const expectedHash =
        registeredArchetype !== null
          ? (baseline.archetypes[registeredArchetype]?.skeleton_hash ?? null)
          : null;
      const matches = registeredArchetype !== null && hash === expectedHash;
      const driftArchetype = matches
        ? null
        : findMatchingArchetype(hash, baseline.archetypes, registeredArchetype);

      results.push({
        route,
        source,
        registered_archetype: registeredArchetype,
        actual_hash: hash,
        expected_hash: expectedHash,
        matches,
        drift_archetype: driftArchetype,
      });

      // Failure mode (a): route has no registered archetype.
      // Runs BEFORE the UPDATE_BASELINE early-return: baseline regeneration
      // must never silently absorb a new route — archetype assignment is a
      // human authorship step (see audit-tooling-design § 2.1). Hash-only
      // drift on already-registered routes IS absorbed in update mode; that
      // is what "update" means.
      if (registeredArchetype === null) {
        const lines = [
          `Unregistered route: ${route} (source: ${source})`,
          `  actual skeleton_hash: ${hash}`,
        ];
        if (driftArchetype) {
          lines.push(
            `  hash matches existing archetype "${driftArchetype}" — add ` +
              `{ "${route}": "${driftArchetype}" } to route_assignments in ` +
              `tests/audit/__baselines__/route-clusters.json.`,
          );
        } else {
          lines.push(
            `  hash matches NO existing archetype. Either:`,
            `    (i) register ${route} under a new archetype in ` +
              `tests/audit/__baselines__/route-clusters.json and rerun ` +
              `UPDATE_BASELINE=1, or`,
            `    (ii) bring the route's structure in line with an existing ` +
              `archetype.`,
          );
        }
        throw new Error(lines.join('\n'));
      }

      // Baseline-update mode: skip the hash-match assertions so the reporter
      // captures every current hash and afterAll writes them back into the
      // baseline. Unregistered-route detection above remains in force.
      if (UPDATE_BASELINE) return;

      // Failure mode (b): registered archetype differs from matching archetype
      // (category drift).
      if (driftArchetype !== null) {
        throw new Error(
          [
            `Category drift: ${route} is registered as "${registeredArchetype}" ` +
              `but its skeleton hash matches archetype "${driftArchetype}".`,
            `  actual skeleton_hash: ${hash}`,
            `  If this drift is intentional, update route_assignments to ` +
              `"${driftArchetype}". Otherwise, a recent change converged two ` +
              `archetypes — revisit the structural difference.`,
          ].join('\n'),
        );
      }

      // Standard hash mismatch — same archetype, but its structure shifted.
      if (!matches) {
        throw new Error(
          [
            `Skeleton mismatch for ${route} (archetype "${registeredArchetype}").`,
            `  expected skeleton_hash: ${expectedHash}`,
            `  actual   skeleton_hash: ${hash}`,
            `  If the structural change is intentional, regenerate the ` +
              `baseline in Docker:`,
            `    docker run --rm -v "$(pwd)":/work -w /work -e CI=true \\`,
            `      mcr.microsoft.com/playwright:v1.59.1-noble \\`,
            `      sh -c "npm ci && UPDATE_BASELINE=1 npm run test:audit:routes"`,
            `  and commit the updated tests/audit/__baselines__/route-clusters.json.`,
          ].join('\n'),
        );
      }
    });
  }
});
