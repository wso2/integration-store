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
  isHiddenPackage,
} from '../connector-utils';
import semver from 'semver';

// Shape of each entry in ranking-data.json (see scripts/generate-ranking-data.js).
// Precomputed, build-time download-rate ranking -- see that script for the full
// maturity/fallback logic. This file is consumed read-only here; nothing in the
// Store recomputes or re-derives these values at runtime.
interface RankingEntry {
  selectedVersion: string;
  selectedVersionCreatedDate: string;
  selectedVersionPullCount: number;
  ratePerDay: number | null;
  isMature: boolean;
}

// Served from public/ranking-data.json so other tools can fetch it directly
// too, not just this app. Fetched once per page session and cached here --
// a failed fetch falls back to an empty object rather than breaking search.
let rankingDataCache: Record<string, RankingEntry> | null = null;
let rankingDataFetchPromise: Promise<Record<string, RankingEntry>> | null = null;

/** Test-only: clears the in-memory ranking-data cache so test cases don't leak state. */
export function __resetRankingDataCacheForTests(): void {
  rankingDataCache = null;
  rankingDataFetchPromise = null;
}

async function loadRankingData(): Promise<Record<string, RankingEntry>> {
  if (rankingDataCache) {
    return rankingDataCache;
  }
  if (!rankingDataFetchPromise) {
    rankingDataFetchPromise = (async () => {
      try {
        const response = await fetch('/ranking-data.json');
        if (!response.ok) {
          throw new Error(`Failed to fetch ranking data: ${response.status}`);
        }
        const data = await response.json();
        const parsed: Record<string, RankingEntry> = data.packages || {};
        rankingDataCache = parsed;
        return parsed;
      } catch (error) {
        console.warn('Failed to load ranking data, falling back to unranked order:', error);
        const empty: Record<string, RankingEntry> = {};
        rankingDataCache = empty;
        return empty;
      } finally {
        rankingDataFetchPromise = null;
      }
    })();
  }
  return rankingDataFetchPromise;
}

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
  /**
   * Internal: keep date-desc/date-asc/pullCount-asc on the fast path (one page-sized
   * request) instead of the full catalog fetch. For the filter-building loops, which
   * read raw packages page by page and don't care about a globally correct order.
   * Has no effect on queries, Area/Vendor/Type filters or the other sorts.
   */
  skipFullFetch?: boolean;
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
    organization?: string;
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
 * Default timeout for a single fetch attempt on the connector detail page's
 * dependencies. Without this, a slow upstream response (observed at 15-20s+
 * for some packages, vs ~3-5s for others) left the page on a bare spinner
 * indefinitely, with no way to ever reach an error state — see
 * https://github.com/wso2/product-integrator/issues/2553. This bounds each
 * attempt so withRetry's existing retry/backoff logic still applies on top.
 */
const DETAIL_FETCH_TIMEOUT_MS = 10000;

/**
 * fetch() with a hard timeout, so a slow/hanging dependency rejects with a
 * clear error instead of leaving the caller waiting indefinitely.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DETAIL_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s while fetching ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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
  query?: string,
  rankingData: Record<string, RankingEntry> = {}
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
    case 'pullCount-desc': {
      // "Most Popular" now uses precomputed download-rate data (see
      // scripts/generate-ranking-data.js and RANKING_DATA above), not raw
      // totalPullCount. The rate spread is extreme (orders of magnitude), so
      // we log-transform before comparing -- same reasoning as the lifetime-
      // pullCount skew this replaces. Packages with no entry in RANKING_DATA,
      // or a null ratePerDay (never reached maturity -- see the script for
      // the exact rule), sort to the bottom, in no particular order among
      // themselves (confirmed acceptable).
      const getRateScore = (pkg: BallerinaPackage): number => {
        const identity = extractConnectorIdentity(pkg);
        if (!identity) return 0;
        const entry = rankingData[`${identity.org}/${identity.packageName}`];
        if (!entry || entry.ratePerDay === null) return 0;
        return Math.log10(entry.ratePerDay + 1);
      };

      if (query) {
        // When searching, sort by name relevance first, then by rate score
        // within the same relevance group.
        return sorted.sort((a, b) => {
          const scoreA = nameRelevanceScore(a, query);
          const scoreB = nameRelevanceScore(b, query);
          if (scoreA !== scoreB) return scoreA - scoreB;
          return getRateScore(b) - getRateScore(a);
        });
      }
      return sorted.sort((a, b) => getRateScore(b) - getRateScore(a));
    }
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
 *   → "graphql AND org:(ballerina OR ballerinax) AND keyword:Area/Finance"
 * @example buildSolrQuery({areas: ['Finance'], vendors: ['Amazon']})
 *   → "org:(ballerina OR ballerinax) AND keyword:Vendor/Amazon AND keyword:Area/Finance"
 * @example buildSolrQuery({orgName: 'ballerinax', areas: ['Finance']})
 *   → "org:ballerinax AND keyword:Area/Finance"  (explicit orgName still scopes to one org)
 */
function buildSolrQuery(
  params: Pick<SearchParams, 'areas' | 'vendors' | 'types' | 'query' | 'orgName'>
): string {
  const filters: string[] = [];

  // Always include organization (required).
  // When no specific org is requested, search both ballerina (standard library,
  // e.g. io/http/time) and ballerinax (connectors) orgs. Central's Solr search
  // supports parenthetical OR grouping on this field (verified live), so this is
  // a single query, not a fan-out — it doesn't affect generateFilterCombinations,
  // MAX_COMBINATIONS, or the fast-path pagination logic below.
  const orgs = params.orgName ? [params.orgName] : ['ballerina', 'ballerinax'];
  filters.push(orgs.length > 1 ? `org:(${orgs.join(' OR ')})` : `org:${orgs[0]}`);

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
      return finalQuery || 'org:(ballerina OR ballerinax)'; // Fallback to org filter
    }

    // Check if query already contains wildcards before escaping
    const hasWildcards = trimmedQuery.includes('*') || trimmedQuery.includes('?');

    // Escape Solr special characters
    const escapedQuery = escapeSolrQuery(trimmedQuery);

    // If query is empty after escaping, just use filters
    if (!escapedQuery) {
      const finalQuery = filters.join(' AND ');
      return finalQuery || 'org:(ballerina OR ballerinax)';
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
  return finalQuery || 'org:(ballerina OR ballerinax)'; // Fallback to org filter
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
  return packages.filter((pkg) => !isHiddenPackage(pkg));
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
 * Exact hidden-package count per org scope, computed once by fetching the full
 * unfiltered catalog and cached for the session (in-flight promises are cached
 * too, so concurrent page loads share one fetch). The fast path in searchPackages
 * below used to estimate this proportionally from each page's own local sample,
 * which gave a different (and visibly inconsistent) total depending on which page
 * happened to be requested — see https://github.com/wso2/product-integrator/issues/2552.
 */
const hiddenCountCache = new Map<string, Promise<number>>();

/** Test-only: clears the in-memory hidden-count cache so test cases don't leak state. */
export function __resetHiddenCountCacheForTests(): void {
  hiddenCountCache.clear();
}

async function getTotalHiddenCount(orgName?: string): Promise<number> {
  const cacheKey = orgName ?? 'all';
  const cached = hiddenCountCache.get(cacheKey);
  if (cached) return cached;

  const promise = fetchAllForCombination({
    orgName,
    offset: 0,
    limit: 1,
    sort: 'pullCount-desc',
  }).then((packages) => packages.filter((pkg) => isHiddenPackage(pkg)).length);

  hiddenCountCache.set(cacheKey, promise);
  return promise;
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
  // pullCount-desc ("Most Popular") also needs the complete result set: it's
  // ranked using RANKING_DATA (see above), a precomputed download-rate lookup
  // covering the whole catalog -- correctly ranking it requires comparing every
  // matching package against each other, not just whatever one page Central's
  // own API-side sort would have returned first.
  // date-desc/date-asc/pullCount-asc need it for the same reason: a small per-page
  // buffer can't produce a globally correct order.
  const needsFullFetch =
    !!params.query ||
    params.sort === 'name-asc' ||
    params.sort === 'name-desc' ||
    params.sort === 'pullCount-desc' ||
    (!params.skipFullFetch &&
      (params.sort === 'date-desc' ||
        params.sort === 'date-asc' ||
        params.sort === 'pullCount-asc')) ||
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
    // Only pullCount-desc actually reads ranking data -- skip the fetch
    // entirely for every other sort to avoid an unnecessary network request.
    const rankingData = params.sort === 'pullCount-desc' ? await loadRankingData() : {};
    const sorted = sortMergedPackages(filtered, params.sort, params.query, rankingData);
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
  const [result, totalHidden] = await Promise.all([
    executeSingleSearch({
      ...combinations[0],
      limit: fetchLimit,
    }),
    getTotalHiddenCount(params.orgName),
  ]);
  result.packages = excludeHidden(result.packages);
  result.count = Math.max(0, result.count - totalHidden);
  result.packages = result.packages.slice(0, params.limit);
  // Only pullCount-desc actually reads ranking data -- skip the fetch
  // entirely for every other sort to avoid an unnecessary network request.
  const rankingData = params.sort === 'pullCount-desc' ? await loadRankingData() : {};
  result.packages = sortMergedPackages(result.packages, params.sort, params.query, rankingData);
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
 * Builds the org-scoped localStorage key for cached filters, so filters
 * fetched for one org scope are never served back for a different one.
 */
function getFilterCacheKey(orgName?: string): string {
  return `${FILTER_CACHE_KEY}_${orgName ?? 'all'}`;
}

/**
 * Get cached filter options from localStorage
 */
function getCachedFilters(orgName?: string): FilterOptions | null {
  try {
    const cacheKey = getFilterCacheKey(orgName);
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const { filters, timestamp }: CachedFilters = JSON.parse(cached);
    const age = Date.now() - timestamp;

    // Return cached filters if less than 24 hours old
    if (age < FILTER_CACHE_TTL) {
      return filters;
    }

    // Cache expired, clear it
    localStorage.removeItem(cacheKey);
    return null;
  } catch (error) {
    console.error('Failed to get cached filters:', error);
    return null;
  }
}

/**
 * Cache filter options in localStorage
 */
function cacheFilters(filters: FilterOptions, orgName?: string): void {
  try {
    const cached: CachedFilters = {
      filters,
      timestamp: Date.now(),
    };
    localStorage.setItem(getFilterCacheKey(orgName), JSON.stringify(cached));
  } catch (error) {
    console.error('Failed to cache filters:', error);
  }
}

/**
 * Fetch all packages to build complete filter options
 * This is done in the background to avoid blocking initial page load
 */
export async function fetchAllPackagesForFilters(orgName?: string): Promise<FilterOptions> {
  // Try to get cached filters first
  const cached = getCachedFilters(orgName);
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
        skipFullFetch: true,
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
  cacheFilters(filters, orgName);

  return filters;
}

/**
 * Fetch the latest connector pages for sitemap generation.
 * Multiple package versions collapse into a single /latest URL per connector.
 */
export async function fetchLatestConnectorEntries(
  orgName?: string
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
    .filter((pkg) => !isHiddenPackage(pkg))
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
  orgName?: string,
  onUpdate?: (filters: FilterOptions) => void
): Promise<FilterOptions> {
  // Try cached filters first
  const cached = getCachedFilters(orgName);
  if (cached) {
    return cached;
  }

  // Fetch first batch quickly to get initial filters
  const firstBatch = await searchPackages({
    offset: 0,
    limit: 100,
    sort: 'date-desc',
    orgName,
    skipFullFetch: true,
  });

  const initialFilters = extractFilterOptions(firstBatch.packages);

  // Start background fetch for complete filters
  if (firstBatch.count > 100 && onUpdate) {
    fetchAllPackagesForFilters(orgName).then((completeFilters) => {
      onUpdate(completeFilters);
    });
  } else {
    // Cache if we got everything
    cacheFilters(initialFilters, orgName);
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
  const response = await fetchWithTimeout(`${PACKAGES_ENDPOINT}/${orgName}/${packageName}`);
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

    const response = await fetchWithTimeout(
      `${PACKAGES_ENDPOINT}/${orgName}/${packageName}/${targetVersion}`
    );

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

      const graphqlResponse = await fetchWithTimeout(GRAPHQL_ENDPOINT, {
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
