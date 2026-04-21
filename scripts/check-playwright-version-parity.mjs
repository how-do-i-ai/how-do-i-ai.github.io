#!/usr/bin/env node
// Fail-fast check that the committed Playwright Docker image tag matches
// devDependencies["@playwright/test"] in package.json.
//
// Driven by PDR-007 § Constraints 1 (Linux-only baseline parity) and
// hq/docs/website/audit-tooling-design.md § 5 Risk 6. Two sources of truth
// (npm dep range + docker tag in prose) drift silently: baselines regenerated
// in one version compared against another produce spurious CI failures
// and can mask real regressions when re-baselining cascades.
//
// Sources:
//   - npm side: package.json → devDependencies["@playwright/test"]
//   - docker side: tests/visual/DOCKER_IMAGE_TAG (single-line, e.g. v1.59.1-noble)
//
// Exit 0 when the npm X.Y.Z version matches the docker tag's v{X}.{Y}.{Z}
// prefix (followed by `-variant` or end-of-string). Exit 1 with a diff-style
// message otherwise.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_JSON = join(REPO_ROOT, 'package.json');
const DOCKER_IMAGE_TAG = join(REPO_ROOT, 'tests/visual/DOCKER_IMAGE_TAG');

function readNpmPlaywrightVersion() {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  } catch (err) {
    throw new Error(
      `${PACKAGE_JSON}: cannot read (${err.code || err.message})`,
    );
  }
  const raw = pkg.devDependencies?.['@playwright/test'];
  if (!raw) {
    throw new Error(
      `${PACKAGE_JSON}: devDependencies["@playwright/test"] is not set`,
    );
  }
  // Accept pure range specifiers anchored to the whole string:
  //   ^X.Y.Z, ~X.Y.Z, X.Y.Z (bare). Anchoring rejects git URLs
  //   (`git+https://…#v1.59.1`), npm aliases (`npm:@playwright/test@…`),
  //   prereleases (`1.59.1-rc.1`), and compound ranges (`>=1.59 <1.60`)
  //   — none of which this script is prepared to compare against a
  //   Docker image tag without ambiguity.
  const match = raw.match(/^[\^~]?([0-9]+\.[0-9]+\.[0-9]+)$/);
  if (!match) {
    throw new Error(
      `${PACKAGE_JSON}: devDependencies["@playwright/test"]="${raw}" is not a plain ^X.Y.Z / ~X.Y.Z / X.Y.Z range. ` +
        `Prereleases, git URLs, npm aliases, and compound ranges are not supported.`,
    );
  }
  return { raw, version: match[1] };
}

function readDockerImageTag() {
  let content;
  try {
    content = readFileSync(DOCKER_IMAGE_TAG, 'utf8').trim();
  } catch (err) {
    throw new Error(
      `${DOCKER_IMAGE_TAG}: cannot read (${err.code || err.message})`,
    );
  }
  if (!content) {
    throw new Error(
      `${DOCKER_IMAGE_TAG}: file is empty; expected a single tag like v1.59.1-noble`,
    );
  }
  if (content.includes('\n')) {
    throw new Error(
      `${DOCKER_IMAGE_TAG}: must contain a single line; got multiple lines`,
    );
  }
  return content;
}

function versionsMatch(npmVersion, dockerTag) {
  // Expected tag form: v{major}.{minor}.{patch}[-variant]
  // e.g. v1.59.1-noble, v1.59.1 (bare). Anchored at start to avoid
  // false matches like 1.59.1 matching inside 1.59.10 or similar.
  const pattern = new RegExp(`^v${npmVersion.replace(/\./g, '\\.')}(-|$)`);
  return pattern.test(dockerTag);
}

function main() {
  let raw, version, dockerTag;
  try {
    ({ raw, version } = readNpmPlaywrightVersion());
    dockerTag = readDockerImageTag();
  } catch (err) {
    console.error('[playwright-version-parity] ERROR');
    console.error(`  ${err.message}`);
    process.exit(1);
  }
  const ok = versionsMatch(version, dockerTag);

  const lines = [
    `  package.json devDependencies["@playwright/test"]: ${raw}  →  ${version}`,
    `  tests/visual/DOCKER_IMAGE_TAG:                    ${dockerTag}`,
  ];

  if (ok) {
    console.log('[playwright-version-parity] OK');
    console.log(lines.join('\n'));
    process.exit(0);
  }

  console.error('[playwright-version-parity] MISMATCH');
  console.error(lines.join('\n'));
  console.error('');
  console.error(`  Expected docker tag to match: v${version}[-variant]`);
  console.error('');
  console.error('  To fix:');
  console.error(
    '    (a) bump package.json @playwright/test to match the docker tag, OR',
  );
  console.error(
    '    (b) update tests/visual/DOCKER_IMAGE_TAG to match the npm version,',
  );
  console.error(
    '        then regenerate visual and audit baselines in the new Docker image.',
  );
  process.exit(1);
}

main();
