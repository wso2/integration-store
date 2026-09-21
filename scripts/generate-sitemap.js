#!/usr/bin/env node

/**
 * Generate sitemap.xml for all connectors
 * Fetches connectors from Ballerina Central API and creates a sitemap
 */

const fs = require('fs');
const path = require('path');

// Check Node.js version and ensure fetch is available
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);

if (majorVersion < 18) {
  console.error(`Error: Node.js 18 or higher is required (current: ${nodeVersion})`);
  console.error('Please upgrade Node.js or install node-fetch: npm install node-fetch');
  process.exit(1);
}

// Ensure fetch is available (Node 18+ has it built-in)
if (typeof fetch === 'undefined') {
  console.error('Error: fetch is not available. Please use Node.js 18+ or install node-fetch.');
  process.exit(1);
}

const REST_ENDPOINT = 'https://api.central.ballerina.io/2.0/registry/search-packages';
const BASE_URL = process.env.SITE_URL || 'https://wso2.com/integration-platform/connectors';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SITEMAP_PATH = path.join(PUBLIC_DIR, 'sitemap.xml');

async function fetchAllPackages() {
  const batchSize = 100;
  let allPackages = [];
  let offset = 0;
  let hasMore = true;

  console.log('Fetching connector packages...');

  while (hasMore) {
    try {
      const query = `org:(ballerina OR ballerinax)`;
      const sort = 'createdDate,DESC';
      const url = `${REST_ENDPOINT}?offset=${offset}&limit=${batchSize}&sort=${sort}&q=${encodeURIComponent(query)}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      allPackages = [...allPackages, ...data.packages];
      offset += batchSize;

      console.log(`Fetched ${allPackages.length} of ${data.count} packages...`);

      // Check if we've fetched everything
      hasMore = offset < data.count;

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Failed to fetch batch at offset ${offset}:`, error);
      throw new Error(`Failed to fetch connector packages at offset ${offset}: ${error.message}`);
    }
  }

  console.log(`Total packages fetched: ${allPackages.length}`);
  return allPackages;
}

/**
 * Escape XML special characters to prevent XML injection
 * @param {string} str - String to escape
 * @returns {string} XML-safe string
 */
function escapeXml(str) {
  if (typeof str !== 'string') {
    return String(str);
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSitemapUrls(packages) {
  const urls = [];
  const seenConnectors = new Set();

  // Add homepage
  urls.push({
    loc: BASE_URL,
    changefreq: 'daily',
    priority: '1.0',
    lastmod: new Date().toISOString().split('T')[0],
  });

  // Add connector URLs
  packages.forEach((pkg) => {
    // Parse URL to extract org and package name
    const urlPath = pkg.URL.replace(/^packages\//, '').replace(/^\//, '');
    const urlParts = urlPath.split('/').filter(Boolean);

    if (urlParts.length >= 2) {
      const [org, packageName] = urlParts;
      const connectorKey = `${org}/${packageName}`;

      if (seenConnectors.has(connectorKey)) {
        return;
      }

      seenConnectors.add(connectorKey);
      urls.push({
        loc: `${BASE_URL}/connector/${org}/${packageName}/latest`,
        changefreq: 'weekly',
        priority: '0.8',
        lastmod: pkg.createdDate
          ? new Date(pkg.createdDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
      });
    }
  });

  return urls;
}

function generateSitemap(urls) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  urls.forEach((url) => {
    xml += '  <url>\n';
    xml += `    <loc>${escapeXml(url.loc)}</loc>\n`;
    xml += `    <lastmod>${escapeXml(url.lastmod)}</lastmod>\n`;
    xml += `    <changefreq>${escapeXml(url.changefreq)}</changefreq>\n`;
    xml += `    <priority>${escapeXml(url.priority)}</priority>\n`;
    xml += '  </url>\n';
  });

  xml += '</urlset>';

  return xml;
}

async function main() {
  try {
    // Validate BASE_URL
    if (process.env.SITE_URL) {
      console.log(`Using custom SITE_URL: ${BASE_URL}`);
    }

    // Fetch all packages
    const packages = await fetchAllPackages();

    if (packages.length === 0) {
      console.error('No packages found. Exiting.');
      process.exit(1);
    }

    // Generate sitemap
    console.log('Generating sitemap...');
    const urls = buildSitemapUrls(packages);
    const sitemap = generateSitemap(urls);

    fs.writeFileSync(SITEMAP_PATH, sitemap, 'utf8');
    console.log(`✓ Sitemap generated successfully at: ${SITEMAP_PATH}`);
    console.log(`✓ Total URLs: ${urls.length}`);
  } catch (error) {
    console.error('Error generating sitemap:', error);

    if (fs.existsSync(SITEMAP_PATH)) {
      console.warn(`Using existing sitemap at: ${SITEMAP_PATH}`);
      process.exit(0);
    }

    const fallbackSitemap = generateSitemap(buildSitemapUrls([]));
    fs.writeFileSync(SITEMAP_PATH, fallbackSitemap, 'utf8');
    console.warn(`Generated fallback sitemap at: ${SITEMAP_PATH}`);
    process.exit(0);
  }
}

main();
