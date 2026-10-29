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
  normalizeForSearch,
  HIDDEN_PACKAGES,
  isHiddenPackage,
} from '../connector-utils';
import semver from 'semver';
import { PackageNotFoundError, isNotFoundError } from './errors';
import {
  loadPriorityCatalogue,
  PriorityCatalogue,
  PriorityCatalogueCard,
} from '../priority-catalogue';
import { interleaveByArea } from '../priority-catalogue/area-interleave';
import { popularityScore } from '../priority-catalogue/popularity-score';

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
      // A 404 is a definite answer; retrying only delays the "not found" page.
      if (isNotFoundError(error)) throw error;
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
  const q = normalizeForSearch(query);
  const name = normalizeForSearch(pkg.name);
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
      // "Most Popular" blends the precomputed download rate (see
      // scripts/generate-ranking-data.js and RANKING_DATA above) with the package's
      // lifetime downloads -- see popularityScore. Packages with no entry in RANKING_DATA,
      // or a null ratePerDay (never reached maturity -- see the script for the exact rule),
      // are scored on their lifetime downloads alone, which is small for a new package.
      const getRateScore = (pkg: BallerinaPackage): number => {
        const identity = extractConnectorIdentity(pkg);
        const entry = identity ? rankingData[`${identity.org}/${identity.packageName}`] : undefined;
        return popularityScore(entry?.ratePerDay, pkg.totalPullCount);
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
  const q = normalizeForSearch(query);
  if (!q) return packages;
  return packages.filter((pkg) => {
    // Separators are normalised on both sides so "aws sns" finds the package `aws.sns`.
    const name = normalizeForSearch(pkg.name);
    const keywords = pkg.keywords.map(normalizeForSearch);
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

  const hasArea = (pkg: BallerinaPackage) => hasTag(pkg, 'Area/', params.areas);

  return packages.filter(
    (pkg) =>
      hasArea(pkg) && hasTag(pkg, 'Vendor/', params.vendors) && hasTag(pkg, 'Type/', params.types)
  );
}

/**
 * Fetch every package matching a single filter combination, paginating through
 * the API in batches. Used whenever the final result set must be exact (see
 * needsFullFetch in searchPackages) rather than trusting the API's own count/offset.
 */
async function fetchAllForCombination(combo: SearchParams): Promise<BallerinaPackage[]> {
  const batchSize = 500;
  // The first request already returns the total count, so ask for a full batch
  // right away instead of probing the count first. Most filtered/search results
  // fit in one batch; only larger ones need the remaining batches (in parallel).
  const first = await executeSingleSearch({ ...combo, offset: 0, limit: batchSize });
  const batchPromises = [];
  for (let offset = batchSize; offset < first.count; offset += batchSize) {
    batchPromises.push(executeSingleSearch({ ...combo, offset, limit: batchSize }));
  }
  const rest = await Promise.all(batchPromises);
  return [first, ...rest].flatMap((r) => r.packages);
}

/**
 * The raw, unfiltered catalog per org scope, downloaded once (500-row
 * batches) and shared by everything that needs the whole catalog on a cold load: the
 * unfiltered full-fetch path (fetchCatalog), the exact hidden-package count
 * (getTotalHiddenCount) and the filter options (fetchAllPackagesForFilters). In-flight
 * promises are cached too so concurrent callers share one download, and a failed
 * download evicts its own entry so the next call retries.
 *
 * The cached array is shared: callers must treat it as read-only.
 */
const RAW_CATALOG_TTL = 12 * 60 * 1000; // 12 minutes
interface RawCatalogEntry {
  promise: Promise<BallerinaPackage[]>;
  timestamp: number;
}
const rawCatalogCache = new Map<string, RawCatalogEntry>();

function getRawCatalog(orgName?: string): Promise<BallerinaPackage[]> {
  const cacheKey = orgName ?? 'all';
  const cached = rawCatalogCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < RAW_CATALOG_TTL) {
    return cached.promise;
  }

  const entry: RawCatalogEntry = {
    promise: fetchAllForCombination({
      orgName,
      offset: 0,
      limit: 1,
      sort: 'pullCount-desc',
    }).catch((error) => {
      // Evict on failure (only if still ours) so the next call retries instead of
      // reusing a rejected promise; the error still propagates to current callers.
      if (rawCatalogCache.get(cacheKey) === entry) {
        rawCatalogCache.delete(cacheKey);
      }
      throw error;
    }),
    timestamp: Date.now(),
  };
  rawCatalogCache.set(cacheKey, entry);
  return entry.promise;
}

/** Test-only: clears the in-memory raw-catalog cache so test cases don't leak state. */
export function __resetHiddenCountCacheForTests(): void {
  rawCatalogCache.clear();
}

/**
 * Exact hidden-package count per org scope, derived from the shared raw catalog.
 * The fast path in searchPackages below used to estimate this proportionally from
 * each page's own local sample, which gave a different (and visibly inconsistent)
 * total depending on which page happened to be requested — see
 * https://github.com/wso2/product-integrator/issues/2552.
 */
async function getTotalHiddenCount(orgName?: string): Promise<number> {
  const packages = await getRawCatalog(orgName);
  return packages.filter((pkg) => isHiddenPackage(pkg)).length;
}

/**
 * Session cache for the full-fetch path in searchPackages. Every page click, sort
 * change and re-render re-enters searchPackages with the same filters, and without
 * this each one re-ran the entire count + 500-item-batch fetch just to slice a
 * different page. The cached value is the merged/deduped/filtered catalog, keyed by
 * what actually changes Central's request (query, areas, vendors, types, orgName) --
 * deliberately NOT by sort/offset/limit, which are applied in memory per call.
 * In-flight promises are cached too so concurrent callers share one fetch, and a
 * failed fetch evicts its own entry so the next call retries.
 *
 * The cached array is shared: callers must treat it as read-only (copy before sorting).
 */
const FETCHED_CATALOG_TTL = 12 * 60 * 1000; // 12 minutes
interface FetchedCatalogEntry {
  promise: Promise<BallerinaPackage[]>;
  timestamp: number;
}
const fetchedCatalogCache = new Map<string, FetchedCatalogEntry>();

/** Test-only: clears the in-memory fetched-catalog cache so test cases don't leak state. */
export function __resetFetchedCatalogCacheForTests(): void {
  fetchedCatalogCache.clear();
  rawCatalogCache.clear();
}

function getFetchedCatalogCacheKey(params: SearchParams): string {
  const sortedCopy = (values?: string[]) => [...(values ?? [])].sort();
  return JSON.stringify([
    params.orgName ?? 'all',
    (params.query ?? '').trim(),
    sortedCopy(params.areas),
    sortedCopy(params.vendors),
    sortedCopy(params.types),
  ]);
}

async function fetchCatalog(params: SearchParams): Promise<BallerinaPackage[]> {
  // Sort is pinned for the fetch itself so the cached order (which breaks ties in
  // the per-call in-memory sort) doesn't depend on whichever sort happened to load first.
  const hasFilters = !!(
    params.query?.trim() ||
    params.areas?.length ||
    params.vendors?.length ||
    params.types?.length
  );
  // Unfiltered: reuse the shared raw download instead of fetching it again.
  const perComboPackages = hasFilters
    ? await Promise.all(
        generateFilterCombinations({ ...params, sort: 'pullCount-desc' }).map(
          fetchAllForCombination
        )
      )
    : [await getRawCatalog(params.orgName)];

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
  return filterByRelevance(exactMatches, params.query);
}

function getFetchedCatalog(params: SearchParams): Promise<BallerinaPackage[]> {
  const cacheKey = getFetchedCatalogCacheKey(params);
  const cached = fetchedCatalogCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < FETCHED_CATALOG_TTL) {
    return cached.promise;
  }

  const entry: FetchedCatalogEntry = {
    promise: fetchCatalog(params).catch((error) => {
      // Evict on failure (only if still ours) so the next call retries instead of
      // reusing a rejected promise; the error still propagates to current callers.
      if (fetchedCatalogCache.get(cacheKey) === entry) {
        fetchedCatalogCache.delete(cacheKey);
      }
      throw error;
    }),
    timestamp: Date.now(),
  };
  fetchedCatalogCache.set(cacheKey, entry);
  return entry.promise;
}

/**
 * The priority catalogue (built by scripts/generate-priority-catalogue.js) plus whatever Central
 * says was released or updated since that build.
 *
 * The list holds every visible package with its card data, so unfiltered views render
 * with no Central call. To still show packages released after the build, one live
 * request fetches the packages created or updated since the build (newest first, paged,
 * capped at RECENT_MAX_PACKAGES); any that the list doesn't know about are appended after
 * the ranked packages, and ones with a newer version replace their list entry. Releases
 * often land in bulk (hundreds of packages in one wave), which is why this follows the
 * build date instead of taking a fixed handful. That request never blocks a render: searchPackages uses
 * what has arrived so far, and refreshCatalog() lets the page re-render once it does.
 */
const RECENT_PAGE_SIZE = 100;
const RECENT_MAX_PACKAGES = 500;
// Central's `createdDate` is the newest version's release time; a day of slack covers
// clock and timezone differences between the build machine and Central.
const RECENT_BUILD_SLACK = 24 * 60 * 60 * 1000;
const RECENT_TTL = 10 * 60 * 1000; // 10 minutes

interface Catalog {
  packages: PriorityCatalogueCard[];
  /** Ranking lookup in the shape sortMergedPackages expects, derived from the list. */
  ranking: Record<string, RankingEntry>;
  /** Identifies which new/updated packages are merged in, to detect changes. */
  signature: string;
}

let recentPackages: BallerinaPackage[] = [];
let recentPromise: Promise<void> | null = null;
let recentInFlight = false;
let recentFetchedAt = 0;
/** Signature of the catalog the last searchPackages call served, to tell what a re-render adds. */
let servedSignature: string | null = null;
let catalogVersion = 0;
let catalogCache: { version: number; base: PriorityCatalogue; catalog: Catalog } | null = null;

/** Test-only: forgets the live "recent packages" state so test cases don't leak state. */
export function __resetCatalogForTests(): void {
  recentPackages = [];
  recentPromise = null;
  recentInFlight = false;
  recentFetchedAt = 0;
  servedSignature = null;
  catalogVersion = 0;
  catalogCache = null;
}

function packageKey(pkg: BallerinaPackage): string {
  const identity = extractConnectorIdentity(pkg);
  return identity ? `${identity.org}/${identity.packageName}` : `${pkg.organization}/${pkg.name}`;
}

function toMillis(value: unknown): number {
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : Date.parse(String(value));
}

/**
 * Packages created or updated since the list was built, newest first. Reads one page, and
 * only when that page is still entirely newer than the build reads the rest in parallel,
 * up to RECENT_MAX_PACKAGES. Without a usable build date it reads the first page only.
 */
async function fetchRecentPackages(base: PriorityCatalogue): Promise<BallerinaPackage[]> {
  const page = (offset: number) =>
    executeSingleSearch({ offset, limit: RECENT_PAGE_SIZE, sort: 'date-desc' });
  const since = toMillis(base.generatedAt) - RECENT_BUILD_SLACK;
  const reachesBuild = (packages: BallerinaPackage[]) => {
    const oldest = packages.length ? toMillis(packages[packages.length - 1].createdDate) : NaN;
    // An unreadable date counts as "reached the build": stop rather than page blindly.
    return !(oldest > since);
  };

  const first = await page(0);
  if (first.packages.length < RECENT_PAGE_SIZE || reachesBuild(first.packages)) {
    return first.packages;
  }

  const offsets: number[] = [];
  for (let offset = RECENT_PAGE_SIZE; offset < RECENT_MAX_PACKAGES; offset += RECENT_PAGE_SIZE) {
    offsets.push(offset);
  }
  const rest = await Promise.all(offsets.map(page));
  const packages = [first, ...rest].flatMap((response) => response.packages);
  if (!reachesBuild(packages)) {
    console.warn(
      `More than ${RECENT_MAX_PACKAGES} packages changed since the priority catalogue was built ` +
        `(${base.generatedAt}); some are not shown. Rebuild the store.`
    );
  }
  return packages;
}

/** Starts (or reuses) the live fetch of packages released since the build. Never rejects. */
function ensureRecent(base: PriorityCatalogue): Promise<void> {
  if (recentPromise && (recentInFlight || Date.now() - recentFetchedAt < RECENT_TTL)) {
    return recentPromise;
  }
  recentInFlight = true;
  recentPromise = fetchRecentPackages(base)
    .then((packages) => {
      recentPackages = packages;
      catalogVersion++;
    })
    .catch((error) => {
      // Keep whatever we had: the priority catalogue alone is still a correct catalog.
      console.warn('Could not check Ballerina Central for new packages:', error);
    })
    .finally(() => {
      recentInFlight = false;
      recentFetchedAt = Date.now();
    });
  return recentPromise;
}

function buildCatalog(base: PriorityCatalogue): Catalog {
  // Map insertion order is the display order: ranked list first, new packages last.
  // Replacing an existing key keeps its position.
  const byKey = new Map<string, PriorityCatalogueCard>();
  base.packages.forEach((pkg) => byKey.set(packageKey(pkg), pkg));

  const changes: string[] = [];
  recentPackages.forEach((pkg) => {
    if (isHiddenPackage(pkg)) return;
    const key = packageKey(pkg);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...pkg, ratePerDay: null });
      changes.push(`+${key}@${pkg.version}`);
    } else if (existing.version !== pkg.version) {
      byKey.set(key, { ...pkg, ratePerDay: existing.ratePerDay });
      changes.push(`~${key}@${pkg.version}`);
    }
  });

  // The bundled hidden list can be newer than the one the list was built with.
  const packages = [...byKey.values()].filter((pkg) => !isHiddenPackage(pkg));
  const ranking: Record<string, RankingEntry> = {};
  packages.forEach((pkg) => {
    if (pkg.ratePerDay === null) return;
    ranking[packageKey(pkg)] = {
      selectedVersion: pkg.version,
      selectedVersionCreatedDate: pkg.createdDate,
      selectedVersionPullCount: pkg.totalPullCount ?? 0,
      ratePerDay: pkg.ratePerDay,
      isMature: true,
    };
  });
  return { packages, ranking, signature: changes.join(',') };
}

function getCatalog(base: PriorityCatalogue): Catalog {
  if (!catalogCache || catalogCache.version !== catalogVersion || catalogCache.base !== base) {
    catalogCache = { version: catalogVersion, base, catalog: buildCatalog(base) };
  }
  return catalogCache.catalog;
}

/**
 * Waits for the live check for new packages and reports whether the catalog now holds
 * something the last searchPackages call did not serve (a package was added or got a
 * newer version). Comparing with what was served, not with the catalog as it stood when
 * this was called, means a live check that finished first is still reported. Resolves
 * false when there is no priority catalogue, or nothing changed, so callers only re-render
 * when they need to.
 */
export async function refreshCatalog(): Promise<boolean> {
  const base = await loadPriorityCatalogue();
  if (!base) return false;
  const served = servedSignature ?? getCatalog(base).signature;
  await ensureRecent(base);
  return getCatalog(base).signature !== served;
}

/** How many packages each filter option would leave, keyed by the bare option name. */
export interface FacetCounts {
  areas: Record<string, number>;
  vendors: Record<string, number>;
  types: Record<string, number>;
}

/**
 * Counts, for every Area/Vendor/Type option, how many packages the current view would
 * show if that option were selected. Each category is counted with its own selection
 * left out (selections inside a category are OR'd), and every other category plus the
 * text query applied, so an option is 0 exactly when picking it would give no results.
 *
 * Runs over the in-memory catalog (a few ms, no Central call). Resolves null when there
 * is no priority catalogue (or an org-scoped view), in which case the sidebar shows every
 * option as before. With a text query the counts use the same name/keyword match as the
 * result list but not Central's own matching, so they can differ by a package or two.
 */
export async function getFacetCounts(
  params: Pick<SearchParams, 'query' | 'areas' | 'vendors' | 'types' | 'orgName'>
): Promise<FacetCounts | null> {
  const base = params.orgName ? null : await loadPriorityCatalogue();
  if (!base) return null;

  const matching = filterByRelevance(getCatalog(base).packages, params.query);
  const countTags = (prefix: string, own: 'areas' | 'vendors' | 'types') => {
    const counts: Record<string, number> = {};
    filterByExactKeywords(matching, { ...params, [own]: undefined }).forEach((pkg) => {
      pkg.keywords.forEach((keyword) => {
        if (!keyword.startsWith(prefix)) return;
        const option = keyword.slice(prefix.length);
        counts[option] = (counts[option] ?? 0) + 1;
      });
    });
    return counts;
  };

  return {
    areas: countTags('Area/', 'areas'),
    vendors: countTags('Vendor/', 'vendors'),
    types: countTags('Type/', 'types'),
  };
}

/**
 * The packages the current search and filters would match, from the in-memory catalog only
 * (no Central call). Resolves null when there is no priority catalogue (or an org-scoped
 * view). Uses the same match as getFacetCounts, so with a text query it can differ from the
 * result list by a package or two.
 */
export async function getCatalogMatches(
  params: Pick<SearchParams, 'query' | 'areas' | 'vendors' | 'types' | 'orgName'>
): Promise<BallerinaPackage[] | null> {
  const base = params.orgName ? null : await loadPriorityCatalogue();
  if (!base) return null;
  const matching = filterByRelevance(getCatalog(base).packages, params.query);
  return filterByExactKeywords(matching, params);
}

/** Downloads per day of a package from the ranking data, for the interleave's popularity floor. */
function rateFromRanking(
  ranking: Record<string, RankingEntry>
): (pkg: BallerinaPackage) => number | null {
  return (pkg) => {
    const identity = extractConnectorIdentity(pkg);
    return identity
      ? (ranking[`${identity.org}/${identity.packageName}`]?.ratePerDay ?? null)
      : null;
  };
}

/**
 * The default "Most Popular" view: no search and no Area/Vendor/Type filter. Only this
 * view is spread across Areas (see interleaveByArea); filtered views keep the plain rate order.
 */
function isDefaultMostPopular(params: SearchParams): boolean {
  return (
    params.sort === 'pullCount-desc' &&
    !params.query &&
    !params.areas?.length &&
    !params.vendors?.length &&
    !params.types?.length
  );
}

/**
 * Serves views that need no Central call: every sort of the unfiltered catalog, plus a
 * Type-only filter. Type/Connector alone matches most of the catalog (about 600
 * packages, ~800 KB, ~9 s from Central), so it's cheaper to filter the in-memory list.
 */
function searchCatalog(catalog: Catalog, params: SearchParams): SearchResponse {
  const visible = filterByExactKeywords(catalog.packages, params);
  const rankingData = params.sort === 'pullCount-desc' ? catalog.ranking : {};
  const ranked = sortMergedPackages(visible, params.sort, undefined, rankingData);
  const sorted = isDefaultMostPopular(params)
    ? interleaveByArea(ranked, { rateOf: rateFromRanking(rankingData) })
    : ranked;
  return {
    packages: sorted.slice(params.offset, params.offset + params.limit),
    count: sorted.length,
    offset: params.offset,
    limit: params.limit,
  };
}

/**
 * Search packages with server-side filtering, sorting, and pagination.
 *
 * With a priority catalogue, unfiltered views and Type-only filters come straight from it.
 * Text search and Area/Vendor filters still query Central (the result sets are small),
 * then are re-checked exactly on the client. Without a priority catalogue everything goes
 * to Central as before.
 */
export async function searchPackages(params: SearchParams): Promise<SearchResponse> {
  const base = params.orgName ? null : await loadPriorityCatalogue();
  if (!base) return searchCentral(params);

  void ensureRecent(base);
  const catalog = getCatalog(base);
  servedSignature = catalog.signature;
  const hasAreaOrVendor = !!(params.areas?.length || params.vendors?.length);
  const typeOnly = !!params.types?.length && !hasAreaOrVendor;
  const unfiltered = !params.types?.length && !hasAreaOrVendor;

  if (!params.query && (unfiltered || typeOnly)) return searchCatalog(catalog, params);
  return searchCentral(params, catalog.ranking);
}

/**
 * Query Ballerina Central for the full matching set, then filter, sort and paginate it
 * on the client. Handles OR logic across multi-select filters by making multiple API calls.
 */
async function searchCentral(
  params: SearchParams,
  catalogRanking?: Record<string, RankingEntry>
): Promise<SearchResponse> {
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
    const filtered = await getFetchedCatalog(params);
    // Only pullCount-desc actually reads ranking data -- skip the fetch
    // entirely for every other sort to avoid an unnecessary network request.
    const rankingData =
      params.sort === 'pullCount-desc' ? (catalogRanking ?? (await loadRankingData())) : {};
    // Copy: the cached catalog is shared and must never be sorted/mutated in place.
    const ranked = sortMergedPackages([...filtered], params.sort, params.query, rankingData);
    // Same ordering as the catalogue path (searchCatalog), for the default view.
    const sorted = isDefaultMostPopular(params)
      ? interleaveByArea(ranked, { rateOf: rateFromRanking(rankingData) })
      : ranked;
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

  // Built from the shared raw catalog download (already in flight or cached when
  // fetchFiltersProgressively ran), not from a loop of 100-row searches.
  let allPackages: BallerinaPackage[] = [];
  try {
    allPackages = excludeHidden(await getRawCatalog(orgName));
  } catch (error) {
    console.error('Failed to fetch catalog for filters:', error);
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
  // With a priority catalogue the vendors come straight from its packages' tags: no
  // Central call and no localStorage. Vendors of packages released since the build
  // are added when the live check for new packages lands.
  const base = orgName ? null : await loadPriorityCatalogue();
  if (base) {
    void ensureRecent(base);
    if (onUpdate) {
      refreshCatalog().then((changed) => {
        if (changed) onUpdate(extractFilterOptions(getCatalog(base).packages));
      });
    }
    return extractFilterOptions(getCatalog(base).packages);
  }

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
  if (response.status === 404) {
    throw new PackageNotFoundError(`Package ${orgName}/${packageName} was not found`);
  }
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

    if (response.status === 404) {
      throw new PackageNotFoundError(
        `Package ${orgName}/${packageName} ${targetVersion} was not found`
      );
    }
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
