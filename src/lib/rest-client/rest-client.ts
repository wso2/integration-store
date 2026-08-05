/*
 Copyright (c) 2026 WSO2 LLC. (http://www.wso2.com) All Rights Reserved.

 WSO2 LLC. licenses this file to you under the Apache License,
 Version 2.0 (the "License"); you may not use this file except
 in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 KIND, either express or implied.  See the License for the
 specific language governing permissions and limitations
 under the License.
*/

import { BallerinaPackage, FilterOptions, PackageDetails } from '@/types/connector';
import {
  extractFilterOptions,
  parseConnectorMetadata,
  getDisplayName,
  HIDDEN_PACKAGES,
} from '../connector-utils';
import semver from 'semver';

const REST_ENDPOINT = 'https://api.central.ballerina.io/2.0/registry/search-packages';
const PACKAGES_ENDPOINT = 'https://api.central.ballerina.io/2.0/registry/packages';
const GRAPHQL_ENDPOINT = 'https://api.central.ballerina.io/2.0/graphql';

/**
 * Sort options used in the UI
 */
export type SortOption =
  | 'name-asc'
  | 'name-desc'
  | 'pullCount-desc'
  | 'pullCount-asc'
  | 'date-desc'
  | 'date-asc';

/**
 * Search parameters for the REST API
 */
export interface SearchParams {
  query?: string;
  areas?: string[];
  vendors?: string[];
  types?: string[];
  offset: number;
  limit: number;
  sort: SortOption;
  orgName?: string;
}

/**
 * Response from the REST API search endpoint
 */
export interface SearchResponse {
  packages: BallerinaPackage[];
  count: number;
  offset: number;
  limit: number;
}

export interface LatestConnectorEntry {
  org: string;
  packageName: string;
  createdDate: string;
}

/**
 * Internal API response structure (before mapping)
 */
interface RawSearchResponse {
  packages: Array<{
    name: string;
    version: string;
    URL: string;
    summary: string;
    keywords: string[];
    icon: string;
    createdDate: string;
    pullCount?: number;
  }>;
  count: number;
  offset: number;
  limit: number;
}

/**
 * Retry helper for network requests with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt + 1}/${maxRetries} failed:`, error);

      // Don't retry on last attempt
      if (attempt < maxRetries - 1) {
        // Exponential backoff
        const delay = delayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Convert sort option to REST API sort parameter
 * @example "pullCount-desc" → "pullCount,DESC"
 */
function toRestSortParam(sortOption: SortOption): string {
  const [field, direction] = sortOption.split('-');

  const fieldMap: Record<string, string> = {
    name: 'name',
    pullCount: 'pullCount',
    date: 'createdDate',
  };

  const directionMap: Record<string, string> = {
    asc: 'ASC',
    desc: 'DESC',
  };

  return `${fieldMap[field]},${directionMap[direction]}`;
}

/**
 * Compute a relevance score for a package based on how well its name matches the query.
 * Lower score = better match (used for sorting).
 *   0 = exact name match
 *   1 = name starts with query
 *   2 = name contains query
 *   3 = no name match (matched on other fields)
 */
function nameRelevanceScore(pkg: BallerinaPackage, query: string): number {
  const q = query.toLowerCase();
  const name = pkg.name.toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  return 3;
}

/**
 * Sort merged packages according to the specified sort option
 * Used after deduplicating results from multiple queries
 */
function sortMergedPackages(
  packages: BallerinaPackage[],
  sort: SortOption,
  query?: string
): BallerinaPackage[] {
  const sorted = [...packages];

  switch (sort) {
    case 'name-asc':
      return sorted.sort((a, b) => {
        const vendorA = parseConnectorMetadata(a.keywords).vendor;
        const vendorB = parseConnectorMetadata(b.keywords).vendor;
        return getDisplayName(a.name, vendorA, a.keywords).localeCompare(
          getDisplayName(b.name, vendorB, b.keywords)
        );
      });
    case 'name-desc':
      return sorted.sort((a, b) => {
        const vendorA = parseConnectorMetadata(a.keywords).vendor;
        const vendorB = parseConnectorMetadata(b.keywords).vendor;
        return getDisplayName(b.name, vendorB, b.keywords).localeCompare(
          getDisplayName(a.name, vendorA, a.keywords)
        );
      });
    case 'pullCount-desc':
      if (query) {
        // When searching, sort by name relevance first, then by pull count within same relevance
        return sorted.sort((a, b) => {
          const scoreA = nameRelevanceScore(a, query);
          const scoreB = nameRelevanceScore(b, query);
          if (scoreA !== scoreB) return scoreA - scoreB;
          return (b.totalPullCount || 0) - (a.totalPullCount || 0);
        });
      }
      return sorted.sort((a, b) => (b.totalPullCount || 0) - (a.totalPullCount || 0));
    case 'pullCount-asc':
      return sorted.sort((a, b) => (a.totalPullCount || 0) - (b.totalPullCount || 0));
    case 'date-desc':
      return sorted.sort(
        (a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime()
      );
    case 'date-asc':
      return sorted.sort(
        (a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime()
      );
    default:
      return sorted;
  }
}

/**
 * Build Solr query string from search filters (single values only)
 * Text query comes first, then filters are ANDed
 * @example buildSolrQuery({query: 'graphql', areas: ['Finance']})
 *   → "graphql AND org:ballerinax AND keyword:Area/Finance"
 * @example buildSolrQuery({areas: ['Finance'], vendors: ['Amazon']})
 *   → "org:ballerinax AND keyword:Vendor/Amazon AND keyword:Area/Finance"
 */
function buildSolrQuery(
  params: Pick<SearchParams, 'areas' | 'vendors' | 'types' | 'query' | 'orgName'>
): string {
  const filters: string[] = [];

  // Always include organization (required)
  const org = params.orgName || 'ballerinax';
  filters.push(`org:${org}`);

  // Helper to escape Lucene/Solr string values
  function escapeLuceneValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /**
   * Escape Solr query special characters
   * Escapes: + - && || ! ( ) { } [ ] ^ " ~ * ? : \ /
   * Also handles leading/trailing whitespace
   *
   * Space is deliberately NOT escaped: the API's wildcard search treats the whole
   * `*...*` term as a literal pattern (not analyzed/tokenized), so an escaped space
   * (`\ `) never matches anything. Leaving the space bare lets multi-word queries
   * like "SAP Business" match a literal "sap business" substring in indexed fields.
   */
  function escapeSolrQuery(query: string): string {
    // Trim whitespace first
    const trimmed = query.trim();
    if (!trimmed) return '';

    // Escape special Solr characters
    // Note: We escape * and ? here but will add them back if needed for wildcards
    return trimmed.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1');
  }

  // Add vendor filter (required with AND operator)
  if (params.vendors && params.vendors.length > 0) {
    params.vendors.forEach((vendor) => {
      const escaped = escapeLuceneValue(vendor);
      filters.push(`keyword:Vendor/${escaped}`);
    });
  }

  // Add type filter (required with AND operator)
  if (params.types && params.types.length > 0) {
    params.types.forEach((type) => {
      const escaped = escapeLuceneValue(type);
      filters.push(`keyword:Type/${escaped}`);
    });
  }

  // Add area filter last (required with AND operator).
  // Several area names contain "&" (e.g. "Finance & Accounting"), and the search
  // API's query parser silently returns 0 results if an unescaped "&...&"-bearing
  // clause is followed by another "AND keyword:..." clause — verified against the
  // live API that the same clauses in the opposite order parse correctly. Keeping
  // area filters last sidesteps that parser quirk instead of relying on escaping,
  // which does not fix it (see https://github.com/wso2/product-integrator/issues/1853).
  if (params.areas && params.areas.length > 0) {
    params.areas.forEach((area) => {
      const escaped = escapeLuceneValue(area);
      filters.push(`keyword:Area/${escaped}`);
    });
  }

  // Build the query: text search first (if provided), then AND with filters
  if (params.query) {
    // Trim the query first
    const trimmedQuery = params.query.trim();

    // If query is empty after trimming, just use filters
    if (!trimmedQuery) {
      const finalQuery = filters.join(' AND ');
      return finalQuery || 'org:ballerinax'; // Fallback to org filter
    }

    // Check if query already contains wildcards before escaping
    const hasWildcards = trimmedQuery.includes('*') || trimmedQuery.includes('?');

    // Escape Solr special characters
    const escapedQuery = escapeSolrQuery(trimmedQuery);

    // If query is empty after escaping, just use filters
    if (!escapedQuery) {
      const finalQuery = filters.join(' AND ');
      return finalQuery || 'org:ballerinax';
    }

    // Add wildcards for partial matching only if query doesn't already have them.
    // Multi-word queries are split into separate per-word wildcard clauses rather than
    // one literal multi-word wildcard term: e.g. `*dynamics 365*` reliably returns 0
    // results from the API even though `*dynamics*` and `*365*` each match, and ANDing
    // them individually (`*dynamics* AND *365*`) does too — verified live. filterByRelevance
    // still requires the full phrase to appear in the name/keywords, so this only widens
    // the API candidate set; it doesn't loosen what's ultimately shown to the user.
    const searchTerm = hasWildcards
      ? trimmedQuery
      : escapedQuery
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => `*${word}*`)
          .join(' AND ');

    const finalQuery = `${searchTerm} AND ${filters.join(' AND ')}`;
    return finalQuery;
  }

  const finalQuery = filters.join(' AND ');
  return finalQuery || 'org:ballerinax'; // Fallback to org filter
}

/**
 * Maximum number of filter combinations before falling back to single query
 * to avoid making too many parallel API calls
 */
const MAX_COMBINATIONS = 50;

/**
 * Generate all combinations of filter values for OR queries
 * Since Solr doesn't support parenthetical grouping, we need to make multiple queries
 */
function generateFilterCombinations(params: SearchParams): SearchParams[] {
  const { areas = [], vendors = [], types = [], ...rest } = params;

  // If all filters have 0 or 1 values, no combinations needed
  if (areas.length <= 1 && vendors.length <= 1 && types.length <= 1) {
    return [params];
  }

  // Generate combinations - treat single values as one-element arrays
  const areaList = areas.length > 0 ? areas : [undefined];
  const vendorList = vendors.length > 0 ? vendors : [undefined];
  const typeList = types.length > 0 ? types : [undefined];

  // Check if Cartesian product would exceed threshold
  const comboCount = areaList.length * vendorList.length * typeList.length;
  if (comboCount > MAX_COMBINATIONS) {
    console.warn(
      `Filter combination count (${comboCount}) exceeds MAX_COMBINATIONS (${MAX_COMBINATIONS}). ` +
        `Falling back to single query to avoid excessive API calls.`
    );
    return [params];
  }

  const combinations: SearchParams[] = [];

  for (const area of areaList) {
    for (const vendor of vendorList) {
      for (const type of typeList) {
        combinations.push({
          ...rest,
          areas: area ? [area] : [],
          vendors: vendor ? [vendor] : [],
          types: type ? [type] : [],
        });
      }
    }
  }

  return combinations;
}

/**
 * Execute a single search query
 */
async function executeSingleSearch(params: SearchParams): Promise<SearchResponse> {
  return withRetry(async () => {
    const solrQuery = buildSolrQuery(params);
    const sortParam = toRestSortParam(params.sort);

    // Build URL manually to avoid encoding the comma in sort parameter
    const queryParams = new URLSearchParams();
    queryParams.set('q', solrQuery);
    queryParams.set('offset', params.offset.toString());
    queryParams.set('limit', params.limit.toString());
    queryParams.set('readme', 'false');

    // Add sort without encoding the comma
    const urlString = `${REST_ENDPOINT}?${queryParams.toString()}&sort=${sortParam}`;

    const response = await fetch(urlString);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', response.status, errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: RawSearchResponse = await response.json();

    // Map pullCount to totalPullCount to match existing interface
    const packages: BallerinaPackage[] = data.packages.map((pkg) => ({
      ...pkg,
      totalPullCount: pkg.pullCount,
    }));

    return {
      packages,
      count: data.count,
      offset: data.offset,
      limit: data.limit,
    };
  });
}

function extractConnectorIdentity(
  pkg: Pick<BallerinaPackage, 'URL' | 'name'>
): { org: string; packageName: string } | null {
  const parsedUrl = new URL(pkg.URL, 'https://central.ballerina.io');
  const urlPath = parsedUrl.pathname.replace(/^\/?packages\//, '').replace(/^\//, '');
  const urlParts = urlPath.split('/').filter(Boolean);

  if (urlParts.length >= 2) {
    return { org: urlParts[0], packageName: urlParts[1] };
  }

  if (pkg.name) {
    return { org: 'ballerinax', packageName: pkg.name };
  }

  return null;
}

/**
 * Filter packages to only those whose name or keywords contain the search query.
 * The API wildcard search matches across all fields (including summary), which
 * returns too many irrelevant results. This narrows results to relevant matches.
 */
function filterByRelevance(packages: BallerinaPackage[], query?: string): BallerinaPackage[] {
  if (!query) return packages;
  const q = query.trim().toLowerCase();
  if (!q) return packages;
  return packages.filter((pkg) => {
    const name = pkg.name.toLowerCase();
    const keywords = pkg.keywords.map((k) => k.toLowerCase());
    return name.includes(q) || keywords.some((k) => k.includes(q));
  });
}

/**
 * Exclude packages listed in the HIDDEN_PACKAGES set
 */
function excludeHidden(packages: BallerinaPackage[]): BallerinaPackage[] {
  return packages.filter((pkg) => !HIDDEN_PACKAGES.has(pkg.name));
}

/**
 * Re-check Area/Vendor/Type filters against each package's own keyword array.
 *
 * The search API's `keyword:` field query is not an exact match on a single tag —
 * it matches loosely/tokenized against the whole keyword list. E.g. `keyword:Vendor/OpenAI`
 * also matches `azure.openai.text` (actual vendor: Microsoft) purely because it carries
 * an unrelated bare keyword `"Azure OpenAI"`, and an Area value containing "&" (e.g.
 * "Finance & Accounting") can match packages tagged with a completely different area
 * that merely share a bare keyword like "Finance". This filters out those false
 * positives so only packages with the exact `Area/`, `Vendor/`, or `Type/` tag survive.
 */
function filterByExactKeywords(
  packages: BallerinaPackage[],
  params: Pick<SearchParams, 'areas' | 'vendors' | 'types'>
): BallerinaPackage[] {
  const hasTag = (pkg: BallerinaPackage, prefix: string, values?: string[]) =>
    !values ||
    values.length === 0 ||
    values.some((value) => pkg.keywords.includes(`${prefix}${value}`));

  return packages.filter(
    (pkg) =>
      hasTag(pkg, 'Area/', params.areas) &&
      hasTag(pkg, 'Vendor/', params.vendors) &&
      hasTag(pkg, 'Type/', params.types)
  );
}

/**
 * Fetch every package matching a single filter combination, paginating through
 * the API in batches. Used whenever the final result set must be exact (see
 * needsFullFetch in searchPackages) rather than trusting the API's own count/offset.
 */
async function fetchAllForCombination(combo: SearchParams): Promise<BallerinaPackage[]> {
  const countResult = await executeSingleSearch({ ...combo, offset: 0, limit: 1 });
  const totalCount = countResult.count;
  const batchSize = 500;
  const batchPromises = [];
  for (let offset = 0; offset < totalCount; offset += batchSize) {
    batchPromises.push(executeSingleSearch({ ...combo, offset, limit: batchSize }));
  }
  const batchResults = await Promise.all(batchPromises);
  return batchResults.flatMap((r) => r.packages);
}

/**
 * Search packages with server-side filtering, sorting, and pagination.
 * Handles OR logic across multi-select filters by making multiple API calls.
 */
export async function searchPackages(params: SearchParams): Promise<SearchResponse> {
  const combinations = generateFilterCombinations(params);
  const hasKeywordFilters = !!(
    params.areas?.length ||
    params.vendors?.length ||
    params.types?.length
  );

  // Search queries need relevance filtering, name sorts need client-side display-name
  // sorting, and any Area/Vendor/Type filter needs exact-match re-checking — the API's
  // `keyword:` query can both under- and over-match a single tag (see buildSolrQuery and
  // filterByExactKeywords). All three require the complete result set up front: the API's
  // own count/offset can't be trusted to reflect what the result looks like after that
  // client-side filtering, so a fixed overfetch buffer can't be sized correctly either.
  const needsFullFetch =
    !!params.query ||
    params.sort === 'name-asc' ||
    params.sort === 'name-desc' ||
    hasKeywordFilters;

  if (needsFullFetch) {
    const perComboPackages = await Promise.all(combinations.map(fetchAllForCombination));

    // Merge and deduplicate by name-version (combinations can overlap)
    const packageMap = new Map<string, BallerinaPackage>();
    perComboPackages.flat().forEach((pkg) => {
      const key = `${pkg.name}-${pkg.version}`;
      if (!packageMap.has(key)) {
        packageMap.set(key, pkg);
      }
    });
    const merged = Array.from(packageMap.values());

    // filterByExactKeywords uses the original params (not a single combo) so OR
    // semantics across multi-select values are preserved.
    const visible = excludeHidden(merged);
    const exactMatches = filterByExactKeywords(visible, params);
    const filtered = filterByRelevance(exactMatches, params.query);
    const sorted = sortMergedPackages(filtered, params.sort, params.query);
    const paged = sorted.slice(params.offset, params.offset + params.limit);
    return {
      packages: paged,
      count: sorted.length,
      offset: params.offset,
      limit: params.limit,
    };
  }

  // Fast path: no query, no name-sort, no Area/Vendor/Type filters. The only
  // client-side exclusion possible here is the small, fixed-size HIDDEN_PACKAGES
  // set, so a fixed overfetch buffer is safe and server-side pagination can stay fast.
  const buffer = HIDDEN_PACKAGES.size;
  const fetchLimit = params.limit + buffer;
  const result = await executeSingleSearch({
    ...combinations[0],
    limit: fetchLimit,
  });
  const beforeCount = result.packages.length;
  result.packages = excludeHidden(result.packages);
  const hiddenInPage = beforeCount - result.packages.length;
  // If we fetched all results, we know the exact hidden count.
  // Otherwise, estimate proportionally from the page sample.
  const totalHidden =
    beforeCount === 0 || result.count <= fetchLimit
      ? hiddenInPage
      : Math.round((hiddenInPage / beforeCount) * result.count);
  result.count = Math.max(0, result.count - totalHidden);
  result.packages = result.packages.slice(0, params.limit);
  result.packages = sortMergedPackages(result.packages, params.sort, params.query);
  result.limit = params.limit;
  return result;
}

const FILTER_CACHE_KEY = 'ballerina_connector_filters';
const FILTER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

interface CachedFilters {
  filters: FilterOptions;
  timestamp: number;
}

/**
 * Get cached filter options from localStorage
 */
function getCachedFilters(): FilterOptions | null {
  try {
    const cached = localStorage.getItem(FILTER_CACHE_KEY);
    if (!cached) return null;

    const { filters, timestamp }: CachedFilters = JSON.parse(cached);
    const age = Date.now() - timestamp;

    // Return cached filters if less than 24 hours old
    if (age < FILTER_CACHE_TTL) {
      return filters;
    }

    // Cache expired, clear it
    localStorage.removeItem(FILTER_CACHE_KEY);
    return null;
  } catch (error) {
    console.error('Failed to get cached filters:', error);
    return null;
  }
}

/**
 * Cache filter options in localStorage
 */
function cacheFilters(filters: FilterOptions): void {
  try {
    const cached: CachedFilters = {
      filters,
      timestamp: Date.now(),
    };
    localStorage.setItem(FILTER_CACHE_KEY, JSON.stringify(cached));
  } catch (error) {
    console.error('Failed to cache filters:', error);
  }
}

/**
 * Fetch all packages to build complete filter options
 * This is done in the background to avoid blocking initial page load
 */
export async function fetchAllPackagesForFilters(
  orgName: string = 'ballerinax'
): Promise<FilterOptions> {
  // Try to get cached filters first
  const cached = getCachedFilters();
  if (cached) {
    return cached;
  }

  const batchSize = 100;
  let allPackages: BallerinaPackage[] = [];
  let offset = 0;
  let hasMore = true;

  // Fetch all packages in batches
  while (hasMore) {
    try {
      const response = await searchPackages({
        offset,
        limit: batchSize,
        sort: 'date-desc',
        orgName,
      });

      allPackages = [...allPackages, ...response.packages];
      offset += batchSize;

      // Check if we've fetched everything
      hasMore = offset < response.count;
    } catch (error) {
      console.error(`Failed to fetch batch at offset ${offset}:`, error);
      break;
    }
  }

  // Extract filter options
  const filters = extractFilterOptions(allPackages);

  // Cache for future use
  cacheFilters(filters);

  return filters;
}

/**
 * Fetch the latest connector pages for sitemap generation.
 * Multiple package versions collapse into a single /latest URL per connector.
 */
export async function fetchLatestConnectorEntries(
  orgName: string = 'ballerinax'
): Promise<LatestConnectorEntry[]> {
  const countResult = await executeSingleSearch({
    offset: 0,
    limit: 1,
    sort: 'date-desc',
    orgName,
  });

  if (countResult.count === 0) {
    return [];
  }

  const batchSize = 500;
  const batchPromises = [];

  for (let offset = 0; offset < countResult.count; offset += batchSize) {
    batchPromises.push(
      executeSingleSearch({
        offset,
        limit: batchSize,
        sort: 'date-desc',
        orgName,
      })
    );
  }

  const batchResults = await Promise.all(batchPromises);
  const latestEntries = new Map<string, LatestConnectorEntry>();

  batchResults
    .flatMap((result) => result.packages)
    .filter((pkg) => !HIDDEN_PACKAGES.has(pkg.name))
    .forEach((pkg) => {
      const identity = extractConnectorIdentity(pkg);
      if (!identity) {
        return;
      }

      const key = `${identity.org}/${identity.packageName}`;
      if (!latestEntries.has(key)) {
        latestEntries.set(key, {
          org: identity.org,
          packageName: identity.packageName,
          createdDate: pkg.createdDate,
        });
      }
    });

  return Array.from(latestEntries.values());
}

/**
 * Fetch filter options progressively (fast initial load)
 * Returns partial filters immediately, then enriches in background
 */
export async function fetchFiltersProgressively(
  orgName: string = 'ballerinax',
  onUpdate?: (filters: FilterOptions) => void
): Promise<FilterOptions> {
  // Try cached filters first
  const cached = getCachedFilters();
  if (cached) {
    return cached;
  }

  // Fetch first batch quickly to get initial filters
  const firstBatch = await searchPackages({
    offset: 0,
    limit: 100,
    sort: 'date-desc',
    orgName,
  });

  const initialFilters = extractFilterOptions(firstBatch.packages);

  // Start background fetch for complete filters
  if (firstBatch.count > 100 && onUpdate) {
    fetchAllPackagesForFilters(orgName).then((completeFilters) => {
      onUpdate(completeFilters);
    });
  } else {
    // Cache if we got everything
    cacheFilters(initialFilters);
  }

  return initialFilters;
}

/**
 * Fetch available versions for a package
 */

export async function fetchPackageVersionsNoRetry(
  orgName: string,
  packageName: string
): Promise<string[]> {
  const response = await fetch(`${PACKAGES_ENDPOINT}/${orgName}/${packageName}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  // If data is an array of strings, return as is
  if (Array.isArray(data) && data.every((v) => typeof v === 'string')) {
    return data;
  }
  // If data is an object with a versions array of strings, return that
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray(data.versions) &&
    data.versions.every((v: unknown) => typeof v === 'string')
  ) {
    return data.versions;
  }
  throw new Error(
    `Unexpected response from ${PACKAGES_ENDPOINT}/${orgName}/${packageName}: expected array or { versions: [...] }`
  );
}

export async function fetchPackageVersions(
  orgName: string,
  packageName: string
): Promise<string[]> {
  return withRetry(() => fetchPackageVersionsNoRetry(orgName, packageName));
}

/**
 * Fetch detailed package information including readme/documentation
 */
export async function fetchPackageDetails(
  orgName: string,
  packageName: string,
  version?: string
): Promise<PackageDetails> {
  return withRetry(async () => {
    // Fetch all versions for the package
    const allVersions = await fetchPackageVersionsNoRetry(orgName, packageName);

    // If no version provided or version is "latest", determine latest version
    let targetVersion = version;

    if (!targetVersion || targetVersion === 'latest') {
      // Map to objects with both raw and sanitized semver
      const sanitized = allVersions
        .map((v) => {
          const valid = semver.valid(v) || semver.coerce(v)?.version;
          return valid ? { raw: v, semver: valid } : null;
        })
        .filter((v): v is { raw: string; semver: string } => !!v);
      if (sanitized.length === 0) {
        throw new Error('No versions found for package');
      }
      // Sort by sanitized semver descending
      sanitized.sort((a, b) => semver.rcompare(a.semver, b.semver));
      targetVersion = sanitized[0].raw; // Use the original/raw version string
    }

    const response = await fetch(`${PACKAGES_ENDPOINT}/${orgName}/${packageName}/${targetVersion}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const packageData = await response.json();

    // Add versions array to the response
    packageData.versions = allVersions;

    // Fetch totalPullCount from GraphQL API (more accurate than REST API)
    try {
      const graphqlQuery = {
        query: `
          query {
            package(orgName: "${orgName}", packageName: "${packageName}", version: "${targetVersion}") {
              totalPullCount
            }
          }
        `,
      };

      const graphqlResponse = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(graphqlQuery),
      });

      if (graphqlResponse.ok) {
        const graphqlData = await graphqlResponse.json();
        if (graphqlData?.data?.package?.totalPullCount !== undefined) {
          packageData.totalPullCount = graphqlData.data.package.totalPullCount;
        } else {
          // Data structure is missing or incomplete, use fallback
          packageData.totalPullCount = packageData.pullCount;
        }
      } else {
        // Non-OK response, use fallback
        packageData.totalPullCount = packageData.pullCount;
      }
    } catch (error) {
      // If GraphQL fails, fall back to using pullCount from current version
      console.warn('Failed to fetch totalPullCount from GraphQL:', error);
      packageData.totalPullCount = packageData.pullCount;
    }

    return packageData;
  });
}
