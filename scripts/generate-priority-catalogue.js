#!/usr/bin/env node

/**
 * Generate public/priority-catalogue.json: every visible package in "Most Popular"
 * order, holding the card data the store renders, so the default view needs no call to
 * Ballerina Central (see src/lib/priority-catalogue).
 *
 *   1. fetch every package from Central (scripts/lib/central.js),
 *   2. drop hidden and deprecated packages (the lists the app uses),
 *   3. order what is left by the download-rate ranking in ranking-data.json, then spread it
 *      across Areas, one package per Area per round (src/lib/priority-catalogue/area-interleave.js),
 *   4. write the result to public/priority-catalogue.json.
 *
 * It only READS public/ranking-data.json (never writes it). The output is gitignored.
 *
 * The catalogue drives what the store renders, so an incomplete one is worse than none:
 * if Central can't be reached, doesn't return every package it reports, or the result
 * fails validation, this exits 1 and fails the build instead of shipping a partial
 * file. For a build that can't reach Central on purpose (offline, a quick local check),
 * set SKIP_PRIORITY_CATALOGUE=true: any previous file is removed, nothing is generated
 * and the store falls back to querying Central directly.
 *
 * Copies of the hidden and deprecated lists are committed next to it in public/
 * (hidden-packages.json, deprecated-packages.json) so other tools can read them. They are
 * not generated here; a test keeps them identical to the sources the app imports.
 *
 * By hand: npm run generate-priority
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OUTPUT_PATH = path.join(PUBLIC_DIR, 'priority-catalogue.json');
const RANKING_PATH = path.join(PUBLIC_DIR, 'ranking-data.json');

const { fetchAllPackages } = require('./lib/central');
const { interleaveByArea } = require('../src/lib/priority-catalogue/area-interleave');

// A catalogue smaller than this means Central answered badly; don't publish it.
const MIN_PACKAGES = 100;

// Same hide lists as the app (src/lib/connector-utils HIDDEN_PACKAGES).
function loadHiddenPackages() {
  return new Set([
    ...require('../src/lib/connector-utils/hidden-packages.json'),
    ...require('../src/lib/connector-utils/deprecated-packages.json'),
  ]);
}

// Same rule as isHiddenPackage in src/lib/connector-utils: bare name or "org/name".
function isHidden(pkg, hidden) {
  return (
    hidden.has(pkg.name) || (!!pkg.organization && hidden.has(`${pkg.organization}/${pkg.name}`))
  );
}

// Same identity the app derives in rest-client.ts (extractConnectorIdentity).
function connectorKey(pkg) {
  const pathname = new URL(pkg.URL, 'https://central.ballerina.io').pathname;
  const parts = pathname
    .replace(/^\/?packages\//, '')
    .replace(/^\//, '')
    .split('/')
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return `ballerinax/${pkg.name}`;
}

// Same score as "Most Popular" in rest-client.ts (sortMergedPackages, pullCount-desc).
function rateScore(pkg, ranking) {
  const entry = ranking[connectorKey(pkg)];
  if (!entry || entry.ratePerDay === null || entry.ratePerDay === undefined) return 0;
  return Math.log10(entry.ratePerDay + 1);
}

function toCard(pkg, ranking) {
  const rate = ranking[connectorKey(pkg)]?.ratePerDay;
  return {
    name: pkg.name,
    organization: pkg.organization,
    version: pkg.version,
    URL: pkg.URL,
    summary: pkg.summary,
    keywords: pkg.keywords,
    icon: pkg.icon,
    createdDate: pkg.createdDate,
    totalPullCount: pkg.pullCount,
    // Download rate behind the ranking; null when the package has none.
    ratePerDay: typeof rate === 'number' ? Math.round(rate * 1000) / 1000 : null,
  };
}

function validate(page) {
  if (page.packages.length === 0) {
    throw new Error('priority-catalogue: no visible packages');
  }
  page.packages.forEach((pkg, i) => {
    for (const field of ['name', 'version', 'URL']) {
      if (typeof pkg[field] !== 'string' || pkg[field] === '') {
        throw new Error(`priority-catalogue: package #${i} (${pkg.name}) is missing ${field}`);
      }
    }
    // Central sends createdDate as epoch milliseconds (a number); kept verbatim.
    const dateOk =
      (typeof pkg.createdDate === 'string' && pkg.createdDate !== '') ||
      Number.isFinite(pkg.createdDate);
    if (!dateOk) {
      throw new Error(`priority-catalogue: package #${i} (${pkg.name}) is missing createdDate`);
    }
    if (typeof pkg.summary !== 'string' || typeof pkg.icon !== 'string') {
      throw new Error(`priority-catalogue: package #${i} (${pkg.name}) is missing summary or icon`);
    }
    if (pkg.ratePerDay !== null && !Number.isFinite(pkg.ratePerDay)) {
      throw new Error(`priority-catalogue: package #${i} (${pkg.name}) has an invalid ratePerDay`);
    }
    if (!Array.isArray(pkg.keywords)) {
      throw new Error(`priority-catalogue: package #${i} (${pkg.name}) is missing keywords`);
    }
  });
}

/**
 * Pure: the packages the default view lists (hidden ones removed), in "Most Popular"
 * order: download rate, spread across Areas. Ties keep input order. `packages` must already be unique per org/name, as
 * fetchAllPackages returns them.
 */
function buildPriorityCatalogue({
  packages,
  ranking,
  hidden,
  centralCount = packages.length,
  generatedAt = new Date().toISOString(),
}) {
  const scored = packages
    .filter((pkg) => !isHidden(pkg, hidden))
    .map((pkg) => ({ pkg, score: rateScore(pkg, ranking) }));
  scored.sort((a, b) => b.score - a.score);
  // Same function the app applies to the default view (searchCatalog in rest-client.ts).
  const ordered = interleaveByArea(scored.map(({ pkg }) => pkg));

  const page = {
    generatedAt,
    centralCount,
    totalCount: ordered.length,
    packages: ordered.map((pkg) => toCard(pkg, ranking)),
  };
  validate(page);
  return page;
}

/** Removes any previous output so a failed or skipped run can never leave a stale file. */
function clearPriorityCatalogue(outPath = OUTPUT_PATH) {
  fs.rmSync(outPath, { force: true });
}

/**
 * Builds and writes the file. Throws when the ranking data or the packages are unusable;
 * nothing is written then. The write is atomic (temp file, then rename).
 */
function writePriorityCatalogue(packages, options = {}) {
  const outPath = options.outPath || OUTPUT_PATH;
  const rankingPath = options.rankingPath || RANKING_PATH;

  const ranking = JSON.parse(fs.readFileSync(rankingPath, 'utf8')).packages;
  if (!ranking || typeof ranking !== 'object' || Object.keys(ranking).length === 0) {
    throw new Error(`no ranking entries in ${rankingPath}`);
  }
  const page = buildPriorityCatalogue({
    packages,
    ranking,
    hidden: options.hidden || loadHiddenPackages(),
    centralCount: options.centralCount ?? packages.length,
  });

  const tmpPath = `${outPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(page) + '\n', 'utf8');
  fs.renameSync(tmpPath, outPath);
  return page;
}

/**
 * SKIP_PRIORITY_CATALOGUE=true is a local-only escape hatch. Without the file the store
 * queries Central from the browser (10-30 s first load), so a CI or deploy build
 * (CI=true) must never ship that way.
 */
function skipRequested(env = process.env) {
  if (env.SKIP_PRIORITY_CATALOGUE !== 'true') return false;
  if (env.CI === 'true') {
    throw new Error('SKIP_PRIORITY_CATALOGUE is not allowed when CI=true');
  }
  return true;
}

async function main() {
  clearPriorityCatalogue();
  try {
    if (skipRequested()) {
      console.warn('SKIP_PRIORITY_CATALOGUE=true: not generating priority-catalogue.json.');
      return;
    }
  } catch (error) {
    console.error(`Could not generate priority-catalogue.json: ${error.message}`);
    process.exit(1);
  }
  try {
    // Throws unless every package Central reports came back.
    const { count, packages } = await fetchAllPackages({ sort: 'pullCount,DESC' });
    if (packages.length < MIN_PACKAGES) {
      throw new Error(
        `only ${packages.length} packages came back; expected at least ${MIN_PACKAGES}`
      );
    }
    const page = writePriorityCatalogue(packages, { centralCount: count });
    console.log(
      `Wrote ${page.totalCount} packages to ${OUTPUT_PATH} (${count} in Central, ${count - page.totalCount} hidden or deprecated)`
    );
  } catch (error) {
    clearPriorityCatalogue();
    console.error(`Could not generate priority-catalogue.json: ${error.message}`);
    console.error(
      'Fix the cause and rebuild, or set SKIP_PRIORITY_CATALOGUE=true to build without it.'
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildPriorityCatalogue,
  clearPriorityCatalogue,
  writePriorityCatalogue,
  skipRequested,
  validate,
  MIN_PACKAGES,
  isHidden,
  rateScore,
};
