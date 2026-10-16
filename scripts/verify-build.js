#!/usr/bin/env node

/**
 * Post-build check (npm "postbuild"): fails the build when build/priority-catalogue.json
 * is missing or unusable. The app quietly falls back to querying Central from the browser
 * when it can't use the file (10-30 s first load), so a bad file must stop the build here
 * instead of showing up as a slow production site.
 *
 * Checks the copy inside build/, which is what gets deployed: it exists, is JSON (not the
 * SPA's index.html), has the expected shape and size, and every package passes the same
 * validation the generator applies.
 */

const fs = require('fs');
const path = require('path');
const { validate, MIN_PACKAGES, skipRequested } = require('./generate-priority-catalogue');

const BUILD_CATALOGUE_PATH = path.join(__dirname, '..', 'build', 'priority-catalogue.json');

/** Throws a descriptive error when the file at `filePath` is not a usable catalogue. */
function verifyPriorityCatalogue(filePath = BUILD_CATALOGUE_PATH) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${filePath} is missing`);
  }
  let page;
  try {
    page = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${filePath} is not valid JSON (${error.message})`);
  }
  if (!page || typeof page !== 'object' || !Array.isArray(page.packages)) {
    throw new Error(`${filePath} has no "packages" array`);
  }
  if (page.packages.length < MIN_PACKAGES) {
    throw new Error(`only ${page.packages.length} packages; expected at least ${MIN_PACKAGES}`);
  }
  if (page.totalCount !== page.packages.length) {
    throw new Error(
      `totalCount ${page.totalCount} does not match ${page.packages.length} packages`
    );
  }
  validate(page);
  return page;
}

function main() {
  try {
    if (skipRequested()) {
      console.warn('SKIP_PRIORITY_CATALOGUE=true: not verifying priority-catalogue.json.');
      return;
    }
    const page = verifyPriorityCatalogue();
    console.log(`Verified build/priority-catalogue.json (${page.totalCount} packages).`);
  } catch (error) {
    console.error(`Build output check failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { verifyPriorityCatalogue };
