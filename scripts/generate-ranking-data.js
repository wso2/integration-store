#!/usr/bin/env node

/**
 * Generate ranking-data.json — precomputed download-rate ranking data.
 * Fetches from Ballerina Central, computes per-package download rates,
 * writes a static JSON file for the Store to consume at build time.
 */

const fs = require('fs');
const path = require('path');

const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);

if (majorVersion < 18) {
  console.error(`Error: Node.js 18 or higher is required (current: ${nodeVersion})`);
  process.exit(1);
}

if (typeof fetch === 'undefined') {
  console.error('Error: fetch is not available. Please use Node.js 18+.');
  process.exit(1);
}

const { fetchAllPackages } = require('./lib/central');

async function fetchPackages() {
  console.log('Fetching all packages (ballerina + ballerinax)');
  const { packages } = await fetchAllPackages();
  console.log(`Total packages fetched: ${packages.length}`);
  return packages;
}

const PACKAGES_ENDPOINT = 'https://api.central.ballerina.io/2.0/registry/packages';
const MATURITY_MIN_AGE_DAYS = 15;
// Maturity is based on version age only.

// Reads the response body for a more useful error message. Best-effort --
// never throws itself, falls back to an empty string on failure.
async function readErrorBody(response) {
  try {
    const text = await response.text();
    return text ? `: ${text}` : '';
  } catch {
    return '';
  }
}

async function fetchVersionDetail(org, name, version) {
  const url = `${PACKAGES_ENDPOINT}/${org}/${name}/${version}`;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(`HTTP error fetching ${org}/${name}/${version}: ${response.status}${body}`);
  }
  const data = await response.json();
  return { pullCount: data.pullCount, createdDate: data.createdDate };
}

function computeIsMature(createdDate, minAgeDays) {
  const ageDays = (Date.now() - createdDate) / 86400000;
  return ageDays >= minAgeDays;
}

async function fetchVersionList(org, name) {
  const url = `${PACKAGES_ENDPOINT}/${org}/${name}`;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(
      `HTTP error fetching version list for ${org}/${name}: ${response.status}${body}`
    );
  }
  return response.json(); // array of version strings, newest first
}

const WALK_BACK_LIMIT = 5;

async function resolvePackageRanking(org, name, latestVersion, minAgeDays) {
  const latestDetail = await fetchVersionDetail(org, name, latestVersion);
  const latestMature = computeIsMature(latestDetail.createdDate, minAgeDays);

  if (latestMature) {
    return {
      selectedVersion: latestVersion,
      selectedVersionCreatedDate: new Date(latestDetail.createdDate).toISOString(),
      selectedVersionPullCount: latestDetail.pullCount,
      ratePerDay:
        latestDetail.pullCount / Math.max((Date.now() - latestDetail.createdDate) / 86400000, 1),
      isMature: true,
    };
  }

  // Latest isn't mature -- walk backward through version history.
  const versions = await fetchVersionList(org, name);
  for (let i = 1; i < Math.min(versions.length, WALK_BACK_LIMIT + 1); i++) {
    const version = versions[i];
    const detail = await fetchVersionDetail(org, name, version);
    if (computeIsMature(detail.createdDate, minAgeDays)) {
      return {
        selectedVersion: version,
        selectedVersionCreatedDate: new Date(detail.createdDate).toISOString(),
        selectedVersionPullCount: detail.pullCount,
        ratePerDay: detail.pullCount / Math.max((Date.now() - detail.createdDate) / 86400000, 1),
        isMature: true,
      };
    }
  }

  // Nothing mature found within the walk-back limit.
  return {
    selectedVersion: latestVersion,
    selectedVersionCreatedDate: new Date(latestDetail.createdDate).toISOString(),
    selectedVersionPullCount: latestDetail.pullCount,
    ratePerDay: null,
    isMature: false,
  };
}

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'ranking-data.json');

async function main() {
  const packages = await fetchPackages();
  console.log(`Computing rankings for ${packages.length} packages...`);

  const result = {};
  let processed = 0;

  for (const pkg of packages) {
    const key = `${pkg.organization}/${pkg.name}`;
    try {
      result[key] = await resolvePackageRanking(
        pkg.organization,
        pkg.name,
        pkg.version,
        MATURITY_MIN_AGE_DAYS
      );
    } catch (err) {
      console.error(`Failed to resolve ${key}: ${err.message}`);
      throw err; // fail loudly -- do not ship a partial/incomplete file
    }

    processed++;
    if (processed % 25 === 0) {
      console.log(`  ${processed}/${packages.length}...`);
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Sort alphabetically so diffs stay small across runs.
  const sortedResult = {};
  for (const key of Object.keys(result).sort()) {
    sortedResult[key] = result[key];
  }

  const output = {
    generatedAt: new Date().toISOString(),
    config: {
      maturityMinAgeDays: MATURITY_MIN_AGE_DAYS,
    },
    packages: sortedResult,
  };

  const newContent = JSON.stringify(output, null, 2);

  let changed = true;
  if (fs.existsSync(OUTPUT_PATH)) {
    const existing = fs.readFileSync(OUTPUT_PATH, 'utf8');
    const existingParsed = JSON.parse(existing);
    // Compare ignoring generatedAt, since that always differs
    const existingPackages = JSON.stringify(existingParsed.packages);
    const newPackages = JSON.stringify(output.packages);
    changed = existingPackages !== newPackages;
  }

  if (!changed) {
    console.log('No ranking changes since last run -- not writing file.');
    return;
  }

  fs.writeFileSync(OUTPUT_PATH, newContent, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`${Object.keys(result).length} packages ranked.`);
}

main();
