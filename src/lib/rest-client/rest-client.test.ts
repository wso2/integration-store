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

import {
  searchPackages,
  fetchFiltersProgressively,
  fetchLatestConnectorEntries,
  fetchPackageVersions,
  fetchPackageVersionsNoRetry,
  fetchPackageDetails,
  SearchParams,
  __resetHiddenCountCacheForTests,
  __resetRankingDataCacheForTests,
  __resetFetchedCatalogCacheForTests,
  __resetCatalogForTests,
  refreshCatalog,
  getFacetCounts,
} from './rest-client';

import { isNotFoundError } from './errors';
import { loadPriorityCatalogue } from '../priority-catalogue';

// These tests exercise the Central-only path; the priority catalogue has its own describe below.
jest.mock('../priority-catalogue', () => ({ loadPriorityCatalogue: jest.fn() }));
const mockLoadCatalogue = loadPriorityCatalogue as jest.Mock;

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

const FILTER_CACHE_KEY = 'ballerina_connector_filters';
const getFilterCacheKey = (orgName?: string) => `${FILTER_CACHE_KEY}_${orgName ?? 'all'}`;

// Use a simple in-memory store to back localStorage mock
const storageStore: Record<string, string> = {};
const storageMock = {
  getItem: jest.fn((key: string) => storageStore[key] ?? null),
  setItem: jest.fn((key: string, value: string) => {
    storageStore[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete storageStore[key];
  }),
  clear: jest.fn(() => {
    Object.keys(storageStore).forEach((key) => delete storageStore[key]);
  }),
};
Object.defineProperty(window, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});
Object.defineProperty(global, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});

// Helper to create mock API response
const createMockApiResponse = (
  packages: Array<{
    name: string;
    version: string;
    keywords?: string[];
    organization?: string;
    pullCount?: number;
  }>,
  count: number,
  offset: number = 0,
  limit: number = 30
) => ({
  packages: packages.map((pkg) => ({
    name: pkg.name,
    ...(pkg.organization ? { organization: pkg.organization } : {}),
    version: pkg.version,
    URL: `https://example.com/${pkg.name}`,
    summary: `Summary for ${pkg.name}`,
    keywords: pkg.keywords || ['Area/Integration', 'Vendor/Test', 'Type/Connector'],
    icon: 'https://example.com/icon.png',
    createdDate: '2024-01-15T00:00:00Z',
    pullCount: pkg.pullCount ?? 1000,
  })),
  count,
  offset,
  limit,
});

describe('rest-client', () => {
  beforeEach(() => {
    // Reset fetch mock and provide safe default
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createMockApiResponse([], 0)),
    });

    // searchPackages' fast path caches the hidden-package count per org scope
    // across calls (see rest-client.ts); reset it so tests don't leak state.
    __resetHiddenCountCacheForTests();

    // pullCount-desc fetches and caches ranking data per module (see
    // rest-client.ts); reset it so each test's fetch-call-count assertions
    // stay accurate and independent of test order.
    __resetRankingDataCacheForTests();
    __resetCatalogForTests();
    mockLoadCatalogue.mockResolvedValue(null);

    // The full-fetch path caches the merged catalog per filter set (see
    // rest-client.ts); reset it so each test's request-count assertions stay
    // accurate and independent of test order.
    __resetFetchedCatalogCacheForTests();

    // Reset storage - clear store and restore implementations
    Object.keys(storageStore).forEach((key) => delete storageStore[key]);
    storageMock.getItem.mockImplementation((key: string) => storageStore[key] ?? null);
    storageMock.setItem.mockImplementation((key: string, value: string) => {
      storageStore[key] = value;
    });
    storageMock.removeItem.mockImplementation((key: string) => {
      delete storageStore[key];
    });
    storageMock.clear.mockImplementation(() => {
      Object.keys(storageStore).forEach((key) => delete storageStore[key]);
    });

    // Suppress console output during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('searchPackages', () => {
    it('should fetch packages with correct parameters', async () => {
      // pullCount-desc ("Most Popular") now takes the full-fetch path (see
      // needsFullFetch in rest-client.ts), since it's ranked using the
      // precomputed RANKING_DATA lookup, not raw totalPullCount -- two real
      // call: the real batch fetch (the first request already returns the count).
      const batchResponse = createMockApiResponse(
        [{ name: 'test-connector', version: '1.0.0' }],
        1
      );
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batchResponse) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ packages: {} }) });

      const params: SearchParams = {
        offset: 0,
        limit: 30,
        sort: 'pullCount-desc',
      };

      const result = await searchPackages(params);

      // pullCount-desc takes the full-fetch path (one batch), plus a second call
      // to fetch ranking-data.json for scoring -- 2 calls total.
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].name).toBe('test-connector');
      expect(result.packages[0].totalPullCount).toBe(1000);
    });

    it('should include search query in request', async () => {
      // With a search query, searchPackages fetches all results for client-side filtering.
      // One call: the full batch fetch.
      const batchResponse = createMockApiResponse([{ name: 'stripe', version: '1.0.0' }], 1);
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batchResponse) });

      await searchPackages({ query: 'stripe', offset: 0, limit: 30, sort: 'pullCount-desc' });
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('stripe');
    });

    it('should split a multi-word search query into separate ANDed wildcard terms', async () => {
      // Regression test for https://github.com/wso2/product-integrator/issues/1853.
      // Two things were found live against the API:
      // 1) an escaped space ("\ ") inside a *...* wildcard term never matches, since
      //    that wildcard is a literal pattern rather than an analyzed/tokenized one.
      // 2) even with the space left bare, one literal multi-word wildcard term
      //    (`*dynamics 365*`) can still return 0 results for some word pairs, while
      //    ANDing the words as separate wildcard terms (`*dynamics* AND *365*`)
      //    reliably works for every case tested. So words are always split and ANDed.
      const batchResponse = createMockApiResponse(
        [{ name: 'sap.businessone', version: '1.0.0' }],
        1
      );
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batchResponse) });

      await searchPackages({ query: 'sap business', offset: 0, limit: 30, sort: 'pullCount-desc' });
      const calledUrl = decodeURIComponent(mockFetch.mock.calls[0][0].replace(/\+/g, ' '));
      expect(calledUrl).toContain('*sap* AND *business*');
      expect(calledUrl).not.toContain('sap\\ business');
      expect(calledUrl).not.toContain('*sap business*');
    });

    it('should find connectors for a word+number query like "dynamics 365"', async () => {
      // Regression test: the API's literal *dynamics 365* wildcard term returns 0
      // results even though the connector's own name/keywords contain that phrase —
      // verified live. Splitting into `*dynamics* AND *365*` finds it instead.
      const batchResponse = createMockApiResponse(
        [
          {
            name: 'microsoft.dynamics365.finance.ledger',
            version: '1.0.0',
            keywords: ['Name/Microsoft Dynamics 365 Finance Ledger', 'Vendor/Microsoft'],
          },
        ],
        1
      );
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batchResponse) });

      const result = await searchPackages({
        query: 'dynamics 365',
        offset: 0,
        limit: 30,
        sort: 'pullCount-desc',
      });
      const calledUrl = decodeURIComponent(mockFetch.mock.calls[0][0].replace(/\+/g, ' '));
      expect(calledUrl).toContain('*dynamics* AND *365*');
      expect(result.packages.map((p) => p.name)).toEqual(['microsoft.dynamics365.finance.ledger']);
    });

    it('should find a dotted package name from a spaced query like "aws sns"', async () => {
      // The package is `aws.sns` and its only matching keyword is `sns`, so the exact
      // phrase "aws sns" appears in neither as written. Separators are normalised.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(
            createMockApiResponse(
              [
                {
                  name: 'aws.sns',
                  version: '1.0.0',
                  keywords: ['Area/Communication', 'Vendor/Amazon', 'Type/Connector', 'sns'],
                },
                {
                  name: 'aws.s3',
                  version: '1.0.0',
                  keywords: ['Area/Storage', 'Vendor/Amazon', 'Type/Connector', 'sns'],
                },
              ],
              2
            )
          ),
      });

      const result = await searchPackages({
        query: 'aws sns',
        offset: 0,
        limit: 30,
        sort: 'pullCount-desc',
      });
      expect(result.packages.map((p) => p.name)).toEqual(['aws.sns']);
    });

    it('should place the area filter after vendor/type filters in the query', async () => {
      // Regression test for a report attached to issue #1853: area names containing
      // "&" (e.g. "Finance & Accounting") make the search API return 0 results when
      // followed by another "AND keyword:..." clause — verified the same clauses in
      // the opposite order parse correctly, so area filters must be added last (after
      // both vendor AND type).
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            createMockApiResponse(
              [
                {
                  name: 'connector-1',
                  version: '1.0.0',
                  keywords: ['Area/Finance & Accounting', 'Vendor/Microsoft', 'Type/Connector'],
                },
              ],
              1
            )
          ),
      });
      await searchPackages({
        areas: ['Finance & Accounting'],
        vendors: ['Microsoft'],
        types: ['Connector'],
        offset: 0,
        limit: 30,
        sort: 'pullCount-desc',
      });
      const calledUrl = decodeURIComponent(mockFetch.mock.calls[0][0]);
      const vendorIndex = calledUrl.indexOf('keyword:Vendor/Microsoft');
      const typeIndex = calledUrl.indexOf('keyword:Type/Connector');
      const areaIndex = calledUrl.indexOf('keyword:Area/Finance');
      expect(vendorIndex).toBeGreaterThan(-1);
      expect(typeIndex).toBeGreaterThan(-1);
      expect(areaIndex).toBeGreaterThan(vendorIndex);
      expect(areaIndex).toBeGreaterThan(typeIndex);
    });

    it('should drop packages the API matched loosely but that lack the exact filter tag', async () => {
      // The search API's `keyword:` query isn't an exact match on one tag — it matches
      // loosely against the whole keyword list. E.g. `keyword:Vendor/OpenAI` also matches
      // a real "azure.openai.text" package (actual vendor: Microsoft) purely because it
      // carries an unrelated bare keyword "Azure OpenAI". filterByExactKeywords must strip
      // these false positives so the UI never shows a connector under the wrong filter.
      // A Vendor filter now always fetches the complete result set in a single
      // batch request.
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            createMockApiResponse(
              [
                {
                  name: 'azure.openai.text',
                  version: '1.0.0',
                  keywords: ['Vendor/Microsoft', 'Azure OpenAI', 'Type/Connector'],
                },
                {
                  name: 'openai',
                  version: '1.0.0',
                  keywords: ['Vendor/OpenAI', 'Type/Connector'],
                },
              ],
              2
            )
          ),
      });

      const result = await searchPackages({
        vendors: ['OpenAI'],
        offset: 0,
        limit: 30,
        sort: 'pullCount-desc',
      });

      expect(result.packages.map((p) => p.name)).toEqual(['openai']);
      // The reported count must reflect the exact post-filter set, not the API's
      // raw (loosely-matched) count of 2.
      expect(result.count).toBe(1);
    });

    it('should paginate on the exact filtered count, not a fixed-buffer estimate', async () => {
      // CodeRabbit review on PR #50: a fixed HIDDEN_PACKAGES-sized overfetch buffer
      // doesn't bound how many false-positive keyword matches (see the test above)
      // a filtered query can have, so a page could come up short or the reported
      // count could be a rough estimate. Any Area/Vendor/Type filter must fetch the
      // complete result set and paginate on the real post-filter length instead.
      const packages = [
        { name: 'real-match-1', version: '1.0.0', keywords: ['Vendor/Acme'] },
        { name: 'false-positive-1', version: '1.0.0', keywords: ['Vendor/AcmeCo'] },
        { name: 'real-match-2', version: '1.0.0', keywords: ['Vendor/Acme'] },
        { name: 'false-positive-2', version: '1.0.0', keywords: ['Vendor/Acmeworks'] },
        { name: 'real-match-3', version: '1.0.0', keywords: ['Vendor/Acme'] },
      ];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockApiResponse(packages, packages.length)),
      });

      const firstPage = await searchPackages({
        vendors: ['Acme'],
        offset: 0,
        limit: 2,
        sort: 'pullCount-desc',
      });
      expect(firstPage.count).toBe(3);
      expect(firstPage.packages.map((p) => p.name)).toEqual(['real-match-1', 'real-match-2']);

      const secondPage = await searchPackages({
        vendors: ['Acme'],
        offset: 2,
        limit: 2,
        sort: 'pullCount-desc',
      });
      expect(secondPage.packages.map((p) => p.name)).toEqual(['real-match-3']);
    });

    it('should handle multiple filter combinations by making parallel requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            createMockApiResponse(
              [{ name: 'connector-1', version: '1.0.0', keywords: ['Area/Finance'] }],
              1
            )
          ),
      });
      await searchPackages({
        areas: ['Finance', 'Communication'],
        offset: 0,
        limit: 30,
        sort: 'pullCount-desc',
      });
      // Each of the 2 area combinations fetches its complete result set in one
      // batch request, plus one shared ranking-data fetch for scoring -- 3 calls.
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should exclude hidden packages from results', async () => {
      const { HIDDEN_PACKAGES } = await import('../connector-utils');
      HIDDEN_PACKAGES.add('internal-module');

      try {
        // Same full-fetch reasoning as above -- two calls needed, not one.
        const batchResponse = createMockApiResponse(
          [
            { name: 'visible-connector', version: '1.0.0', keywords: ['Type/Connector'] },
            { name: 'internal-module', version: '1.0.0', keywords: [] },
          ],
          2
        );
        mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batchResponse) });

        const result = await searchPackages({ offset: 0, limit: 30, sort: 'pullCount-desc' });

        expect(result.packages).toHaveLength(1);
        expect(result.packages[0].name).toBe('visible-connector');
      } finally {
        HIDDEN_PACKAGES.delete('internal-module');
      }
    });

    it('should hide only the matching org when HIDDEN_PACKAGES has an "org/name" entry', async () => {
      const { HIDDEN_PACKAGES } = await import('../connector-utils');
      HIDDEN_PACKAGES.add('ballerina/dual-org');

      try {
        const catalog = [
          // Different versions on purpose: the full-fetch path dedupes on name-version
          // only (not org), so equal versions would collapse before the hide check runs.
          { name: 'dual-org', organization: 'ballerina', version: '1.0.0' },
          { name: 'dual-org', organization: 'ballerinax', version: '2.0.0' },
          { name: 'visible-connector', organization: 'ballerinax', version: '1.0.0' },
        ];
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockApiResponse(catalog, catalog.length)),
        });

        const result = await searchPackages({ offset: 0, limit: 30, sort: 'pullCount-desc' });

        // organization must survive the API -> app mapping for this to work at all
        expect(result.packages.map((p) => `${p.organization}/${p.name}`).sort()).toEqual([
          'ballerinax/dual-org',
          'ballerinax/visible-connector',
        ]);
        expect(result.count).toBe(2);
      } finally {
        HIDDEN_PACKAGES.delete('ballerina/dual-org');
      }
    });

    it('should report the same total count across pages regardless of where hidden packages happen to fall (see #2552)', async () => {
      const { HIDDEN_PACKAGES } = await import('../connector-utils');
      HIDDEN_PACKAGES.add('hidden-1');
      HIDDEN_PACKAGES.add('hidden-2');

      try {
        const fullCatalog = [
          { name: 'visible-1', version: '1.0.0' },
          { name: 'hidden-1', version: '1.0.0' },
          { name: 'visible-2', version: '1.0.0' },
          { name: 'hidden-2', version: '1.0.0' },
          { name: 'visible-3', version: '1.0.0' },
          { name: 'visible-4', version: '1.0.0' },
        ];

        // pullCount-desc now always takes the full-fetch path (it's ranked via
        // RANKING_DATA, not the fast path's server-side sort), so this scenario is
        // solved differently than #2552's original fast-path hidden-count probe:
        // the whole catalog is fetched, hidden packages filtered, THEN paginated in
        // memory -- so page count is inherently consistent regardless of where the
        // hidden packages happen to fall. Each page is its own searchPackages call
        // (no cross-call caching), so each needs its own batch mock.
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockApiResponse(fullCatalog, fullCatalog.length)),
        });

        const firstPage = await searchPackages({ offset: 0, limit: 2, sort: 'pullCount-desc' });

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockApiResponse(fullCatalog, fullCatalog.length)),
        });

        const secondPage = await searchPackages({ offset: 2, limit: 2, sort: 'pullCount-desc' });

        expect(firstPage.count).toBe(4);
        expect(secondPage.count).toBe(4);
      } finally {
        HIDDEN_PACKAGES.delete('hidden-1');
        HIDDEN_PACKAGES.delete('hidden-2');
      }
    });

    it('should handle API errors with retry', async () => {
      // pullCount-desc takes the full-fetch path: a batch fetch, then a ranking-data
      // fetch for scoring. Here the batch's first attempt fails and retries
      // successfully -- 3 calls total: failed attempt, retry, ranking data.
      const batchResponse = createMockApiResponse(
        [{ name: 'retried-connector', version: '1.0.0' }],
        1
      );
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batchResponse) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ packages: {} }) });

      const result = await searchPackages({ offset: 0, limit: 30, sort: 'pullCount-desc' });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].name).toBe('retried-connector');
    }, 10000);
  });

  describe('searchPackages full-catalog sorts (date-asc, date-desc, pullCount-asc)', () => {
    // 150 packages: more than the old fast-path buffer (limit 30 + 82 hidden = 112), with the
    // true oldest / lowest-pull items deliberately placed at the tail of the API's own
    // (unsorted) order, so a sort over only the first ~112 returned would get them wrong.
    const TOTAL = 150;
    const permute = (i: number, pivot: number) => ((((i - pivot) * 37) % TOTAL) + TOTAL) % TOTAL;
    const day = (n: number) => new Date(Date.UTC(2020, 0, 1 + n)).toISOString();
    const catalog = Array.from({ length: TOTAL }, (_, i) => ({
      name: `pkg-${String(i).padStart(3, '0')}`,
      version: '1.0.0',
      URL: `https://example.com/pkg-${i}`,
      summary: `Summary ${i}`,
      keywords: ['Area/Integration', 'Vendor/Test', 'Type/Connector'],
      icon: 'https://example.com/icon.png',
      createdDate: day(permute(i, 140)), // oldest (day 0) is pkg-140
      pullCount: [130, 145].includes(i) ? 0 : permute(i, 130) * 5 + 1, // lowest are pkg-130/145
    }));

    // Serves the catalog in its fixed order by offset/limit, like Central ignoring the sort
    // for our purposes; any other URL (e.g. ranking data) gets an empty payload.
    beforeEach(() => {
      mockFetch.mockImplementation(async (url: string) => {
        if (!url.includes('offset=')) {
          return { ok: true, json: () => Promise.resolve({ packages: {} }) };
        }
        const params = new URL(url, 'https://example.com').searchParams;
        const offset = Number(params.get('offset'));
        const limit = Number(params.get('limit'));
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              packages: catalog.slice(offset, offset + limit),
              count: TOTAL,
              offset,
              limit,
            }),
        };
      });
    });

    it('should put the true oldest package first for date-asc, not the oldest of a buffer', async () => {
      const result = await searchPackages({ offset: 0, limit: 30, sort: 'date-asc' });
      expect(result.count).toBe(TOTAL);
      expect(result.packages[0].name).toBe('pkg-140');
    });

    it('should put the true newest package first for date-desc', async () => {
      const newest = catalog.reduce((a, b) => (b.createdDate > a.createdDate ? b : a));
      const result = await searchPackages({ offset: 0, limit: 30, sort: 'date-desc' });
      expect(result.packages[0].name).toBe(newest.name);
    });

    it('should put a zero-pull package first for pullCount-asc, from across the whole catalog', async () => {
      const result = await searchPackages({ offset: 0, limit: 30, sort: 'pullCount-asc' });
      expect(result.packages[0].totalPullCount).toBe(0);
      expect(['pkg-130', 'pkg-145']).toContain(result.packages[0].name);
      expect(['pkg-130', 'pkg-145']).toContain(result.packages[1].name);
    });

    it('should paginate the full sorted array with no duplicates or gaps', async () => {
      const seen: string[] = [];
      for (let offset = 0; offset < TOTAL; offset += 30) {
        const page = await searchPackages({ offset, limit: 30, sort: 'date-asc' });
        expect(page.packages).toHaveLength(30);
        seen.push(...page.packages.map((p) => p.name));
      }
      expect(new Set(seen).size).toBe(TOTAL);
      expect([...seen].sort()).toEqual(catalog.map((p) => p.name));
      const dates = seen.map((name) => catalog.find((p) => p.name === name)!.createdDate);
      expect(dates).toEqual([...dates].sort());
    });
  });

  describe('fetchFiltersProgressively', () => {
    it('should return cached filters if available and not expired', async () => {
      const freshCache = {
        filters: { areas: ['CachedArea'], vendors: ['CachedVendor'], types: ['CachedType'] },
        timestamp: Date.now(),
      };
      storageMock.setItem(getFilterCacheKey(), JSON.stringify(freshCache));
      storageMock.setItem.mockClear();

      const result = await fetchFiltersProgressively();

      expect(result).toEqual(freshCache.filters);
      expect(storageMock.getItem).toHaveBeenCalledWith(getFilterCacheKey());
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch new filters if cache is expired', async () => {
      const expiredCache = {
        filters: { areas: [], vendors: [], types: [] },
        timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      };
      storageMock.setItem(getFilterCacheKey(), JSON.stringify(expiredCache));
      storageMock.removeItem.mockClear();

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockApiResponse([{ name: 'new', version: '1.0' }], 1)),
      });

      const result = await fetchFiltersProgressively();

      expect(mockFetch).toHaveBeenCalled();
      expect(result.areas).toContain('Integration');
      expect(storageMock.removeItem).toHaveBeenCalledWith(getFilterCacheKey());
    });

    it('should fetch and cache filters when cache is empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockApiResponse([], 50)), // count <= 100
      });

      await fetchFiltersProgressively();

      // 1 call for the batch itself + 1 for the fast path's hidden-count fetch
      // (a single full batch — see #2552)
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(storageMock.setItem).toHaveBeenCalledWith(getFilterCacheKey(), expect.any(String));
    });

    it('should trigger onUpdate for background fetch when count > 100', async () => {
      // Server-side path returns count from API. count=150 > 100 triggers background fetch.
      const packages = Array.from({ length: 100 }, (_, i) => ({
        name: `pkg-${i}`,
        version: '1.0.0',
      }));
      const response = createMockApiResponse(packages, 150);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const onUpdate = jest.fn();
      await fetchFiltersProgressively('ballerinax', onUpdate);

      // Flush microtasks to let the background promise chain resolve
      await new Promise(process.nextTick);

      expect(onUpdate).toHaveBeenCalled();
      expect(storageMock.setItem).toHaveBeenCalledWith(
        getFilterCacheKey('ballerinax'),
        expect.any(String)
      );
    });

    it('should not serve filters cached for a different org scope', async () => {
      // Simulate a pre-existing cache entry for org:ballerinax only.
      const ballerinaxCache = {
        filters: { areas: ['BallerinaxOnlyArea'], vendors: ['BallerinaxVendor'], types: [] },
        timestamp: Date.now(),
      };
      storageMock.setItem(getFilterCacheKey('ballerinax'), JSON.stringify(ballerinaxCache));

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockApiResponse([], 50)), // count <= 100
      });

      // Request filters for the default (both-orgs) scope — should not read the
      // ballerinax-scoped cache entry, and should fetch fresh instead.
      const result = await fetchFiltersProgressively();

      expect(mockFetch).toHaveBeenCalled();
      expect(result).not.toEqual(ballerinaxCache.filters);
      expect(storageMock.getItem).toHaveBeenCalledWith(getFilterCacheKey());
      expect(storageMock.getItem).not.toHaveBeenCalledWith(getFilterCacheKey('ballerinax'));
    });
  });

  describe('fetchLatestConnectorEntries', () => {
    it('should return one latest entry per connector URL', async () => {
      const countResponse = createMockApiResponse([], 3, 0, 1);
      const batchResponse = {
        packages: [
          {
            name: 'twilio',
            version: '2.0.0',
            URL: 'packages/ballerinax/twilio/2.0.0',
            summary: 'Summary for twilio',
            keywords: ['Type/Connector'],
            icon: 'https://example.com/icon.png',
            createdDate: '2026-01-15T00:00:00Z',
            pullCount: 1000,
          },
          {
            name: 'twilio',
            version: '1.0.0',
            URL: 'packages/ballerinax/twilio/1.0.0',
            summary: 'Summary for twilio',
            keywords: ['Type/Connector'],
            icon: 'https://example.com/icon.png',
            createdDate: '2025-01-15T00:00:00Z',
            pullCount: 900,
          },
          {
            name: 'slack',
            version: '3.0.0',
            URL: 'packages/ballerinax/slack/3.0.0',
            summary: 'Summary for slack',
            keywords: ['Type/Connector'],
            icon: 'https://example.com/icon.png',
            createdDate: '2026-02-01T00:00:00Z',
            pullCount: 1200,
          },
        ],
        count: 3,
        offset: 0,
        limit: 500,
      };

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(countResponse) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batchResponse) });

      const result = await fetchLatestConnectorEntries();

      expect(result).toEqual([
        { org: 'ballerinax', packageName: 'twilio', createdDate: '2026-01-15T00:00:00Z' },
        { org: 'ballerinax', packageName: 'slack', createdDate: '2026-02-01T00:00:00Z' },
      ]);
    });
  });

  describe('searchPackages fetched-catalog cache', () => {
    const catalog = ['conn-a', 'conn-b', 'conn-c', 'conn-d', 'conn-e'].map((name) => ({
      name,
      version: '1.0.0',
    }));

    // Serves the catalog by offset/limit like Central does; ranking-data and any
    // other non-search URL gets an empty payload.
    const serveCatalog = () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (!url.includes('offset=')) {
          return { ok: true, json: () => Promise.resolve({ packages: {} }) };
        }
        const params = new URL(url, 'https://example.com').searchParams;
        const offset = Number(params.get('offset'));
        const limit = Number(params.get('limit'));
        return {
          ok: true,
          json: () =>
            Promise.resolve(
              createMockApiResponse(
                catalog.slice(offset, offset + limit),
                catalog.length,
                offset,
                limit
              )
            ),
        };
      });
    };
    const centralCalls = () =>
      mockFetch.mock.calls.filter(([url]) => String(url).includes('offset=')).length;
    const base: SearchParams = { query: 'conn', offset: 0, limit: 2, sort: 'name-asc' };

    it('should not re-fetch from Central when only the page changes', async () => {
      serveCatalog();
      const page1 = await searchPackages(base);
      // One full fetch of a small result = one request (the first batch also carries the total).
      expect(centralCalls()).toBe(1);

      const page2 = await searchPackages({ ...base, offset: 2 });
      expect(centralCalls()).toBe(1);
      expect(page1.packages.map((p) => p.name)).toEqual(['conn-a', 'conn-b']);
      expect(page2.packages.map((p) => p.name)).toEqual(['conn-c', 'conn-d']);
      expect(page2.count).toBe(5);
    });

    it('should not re-fetch from Central when only the sort changes, and sort in memory', async () => {
      serveCatalog();
      await searchPackages(base);
      expect(centralCalls()).toBe(1);

      const desc = await searchPackages({ ...base, sort: 'name-desc' });
      expect(centralCalls()).toBe(1);
      expect(desc.packages.map((p) => p.name)).toEqual(['conn-e', 'conn-d']);

      // The earlier sort must not have mutated the cached catalog.
      const asc = await searchPackages(base);
      expect(centralCalls()).toBe(1);
      expect(asc.packages.map((p) => p.name)).toEqual(['conn-a', 'conn-b']);
    });

    it('should share one fetch between concurrent calls', async () => {
      serveCatalog();
      await Promise.all([searchPackages(base), searchPackages({ ...base, offset: 2 })]);
      expect(centralCalls()).toBe(1);
    });

    it('should re-fetch when the query or a filter changes, but not for equivalent keys', async () => {
      serveCatalog();
      await searchPackages(base);
      expect(centralCalls()).toBe(1);

      await searchPackages({ ...base, query: 'conn-a' });
      expect(centralCalls()).toBe(2);

      await searchPackages({ ...base, areas: ['Integration'] });
      expect(centralCalls()).toBe(3);

      // Same key after normalisation: trimmed query, reordered multi-select values.
      await searchPackages({ ...base, query: ' conn ' });
      expect(centralCalls()).toBe(3);
      await searchPackages({ ...base, query: undefined, areas: ['A', 'B'] });
      const afterFirst = centralCalls();
      await searchPackages({ ...base, query: undefined, areas: ['B', 'A'] });
      expect(centralCalls()).toBe(afterFirst);
    });

    it('should retry on the next call after a failed fetch instead of reusing the failure', async () => {
      // Real timers: withRetry's backoff is ~1s total (same as the existing retry test).
      mockFetch.mockRejectedValue(new Error('network down'));
      await expect(searchPackages(base)).rejects.toThrow();
      const callsAfterFailure = centralCalls();
      expect(callsAfterFailure).toBeGreaterThan(0);

      serveCatalog();
      const result = await searchPackages(base);
      expect(centralCalls()).toBeGreaterThan(callsAfterFailure);
      expect(result.count).toBe(5);
    });
  });

  describe('single catalogue download on cold load', () => {
    const CATALOG_SIZE = 1200; // 3 batches of 500
    const catalog = Array.from({ length: CATALOG_SIZE }, (_, i) => ({
      name: `pkg-${i}`,
      version: '1.0.0',
      keywords: [`Area/Area${i % 7}`, `Vendor/Vendor${i % 5}`, 'Type/Connector'],
    }));
    const HIDDEN_NAME = 'hidden-pkg-a';
    const hiddenPackage = {
      name: HIDDEN_NAME,
      version: '1.0.0',
      keywords: ['Area/HiddenArea', 'Vendor/HiddenVendor', 'Type/HiddenType'],
    };
    const fullCatalog = [...catalog, hiddenPackage];

    const serveCatalog = () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (!String(url).includes('offset=')) {
          return { ok: true, json: () => Promise.resolve({ packages: {} }) };
        }
        const params = new URL(url, 'https://example.com').searchParams;
        const offset = Number(params.get('offset'));
        const limit = Number(params.get('limit'));
        return {
          ok: true,
          json: () =>
            Promise.resolve(
              createMockApiResponse(
                fullCatalog.slice(offset, offset + limit),
                fullCatalog.length,
                offset,
                limit
              )
            ),
        };
      });
    };
    const centralLimits = () =>
      mockFetch.mock.calls
        .filter(([url]) => String(url).includes('offset='))
        .map(([url]) => Number(new URL(String(url)).searchParams.get('limit')));
    const countProbes = () => centralLimits().filter((limit) => limit === 1).length;
    const batchRequests = () => centralLimits().filter((limit) => limit === 500).length;
    const EXPECTED_BATCHES = Math.ceil(fullCatalog.length / 500);

    beforeEach(async () => {
      const { HIDDEN_PACKAGES } = await import('../connector-utils');
      HIDDEN_PACKAGES.add(HIDDEN_NAME);
    });

    afterEach(async () => {
      const { HIDDEN_PACKAGES } = await import('../connector-utils');
      HIDDEN_PACKAGES.delete(HIDDEN_NAME);
    });

    it('should download the catalogue once when search and filters load together', async () => {
      serveCatalog();
      let resolveUpdate: () => void = () => {};
      const updated = new Promise<void>((resolve) => {
        resolveUpdate = resolve;
      });

      await Promise.all([
        searchPackages({ offset: 0, limit: 30, sort: 'pullCount-desc' }),
        fetchFiltersProgressively(undefined, () => resolveUpdate()),
      ]);
      await updated;

      // One download = the 500-row batches; there is no separate count probe.
      expect(countProbes()).toBe(0);
      expect(batchRequests()).toBe(EXPECTED_BATCHES);
      // The only other Central request is the fast path's own first page
      // (limit + HIDDEN_PACKAGES.size rows) -- no 100-row filter loop.
      expect(centralLimits()).toHaveLength(EXPECTED_BATCHES + 1);
    });

    it('should share one download between getTotalHiddenCount and the catalogue', async () => {
      serveCatalog();

      // date-desc, no filters: fast path -> getTotalHiddenCount.
      const fast = await searchPackages({ offset: 0, limit: 30, sort: 'date-desc' });
      // pullCount-desc: full-fetch path -> fetchCatalog.
      const full = await searchPackages({ offset: 0, limit: 30, sort: 'pullCount-desc' });

      expect(countProbes()).toBe(0);
      expect(batchRequests()).toBe(EXPECTED_BATCHES);
      // Both paths agree on the visible total (hidden package excluded).
      expect(fast.count).toBe(CATALOG_SIZE);
      expect(full.count).toBe(CATALOG_SIZE);
    });

    it('should retry the download on the next call after a failure instead of caching it', async () => {
      mockFetch.mockRejectedValue(new Error('network down'));
      await expect(searchPackages({ offset: 0, limit: 30, sort: 'date-desc' })).rejects.toThrow();

      // The fast path rejects as soon as its own request fails; let the
      // hidden-count download's last retry settle before swapping the mock.
      await new Promise((resolve) => setTimeout(resolve, 0));

      serveCatalog();
      mockFetch.mockClear();
      const result = await searchPackages({ offset: 0, limit: 30, sort: 'date-desc' });

      expect(result.count).toBe(CATALOG_SIZE);
      expect(countProbes()).toBe(0);
      expect(batchRequests()).toBe(EXPECTED_BATCHES);
    }, 15000);

    it('should build filter options from the single download, excluding hidden packages', async () => {
      serveCatalog();
      const { extractFilterOptions } = await import('../connector-utils');
      const { fetchAllPackagesForFilters } = await import('./rest-client');

      const filters = await fetchAllPackagesForFilters();

      // What the old paginated loop produced: every visible package, fed to
      // extractFilterOptions.
      expect(filters).toEqual(
        extractFilterOptions(createMockApiResponse(catalog, catalog.length).packages)
      );
      expect(filters.vendors).not.toContain('HiddenVendor');
      expect(filters.areas).not.toContain('HiddenArea');
      expect(filters.vendors).toHaveLength(5);
      expect(filters.areas).toHaveLength(7);

      expect(countProbes()).toBe(0);
      expect(batchRequests()).toBe(EXPECTED_BATCHES);
      expect(centralLimits()).toHaveLength(EXPECTED_BATCHES);
      expect(storageMock.setItem).toHaveBeenCalledWith(getFilterCacheKey(), expect.any(String));
    });
  });

  describe('with a priority catalogue', () => {
    const listPackage = (
      name: string,
      keywords: string[],
      ratePerDay: number | null,
      version = '1.0.0'
    ) => ({
      organization: 'ballerinax',
      name,
      version,
      URL: `packages/ballerinax/${name}/${version}`,
      summary: `Summary for ${name}`,
      keywords,
      icon: 'https://example.com/icon.png',
      createdDate: '2025-01-01T00:00:00Z',
      totalPullCount: 10,
      ratePerDay,
    });
    const priorityList = {
      generatedAt: '2026-10-10T00:00:00Z',
      centralCount: 3,
      packages: [
        listPackage('alpha', ['Type/Connector', 'Vendor/Acme', 'Area/Finance'], 100),
        listPackage('bravo', ['Type/Connector', 'Vendor/Acme', 'Area/Finance'], 10),
        listPackage('charlie', ['Type/Library', 'Vendor/Other'], null),
      ],
    };
    const base: SearchParams = { offset: 0, limit: 30, sort: 'pullCount-desc' };
    const names = (r: { packages: Array<{ name: string }> }) => r.packages.map((p) => p.name);
    const urls = () => mockFetch.mock.calls.map(([url]) => decodeURIComponent(String(url)));
    const batchRequests = () => urls().filter((u) => u.includes('limit=500'));
    const serve = (recent: Parameters<typeof createMockApiResponse>[0] = []) =>
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockApiResponse(recent, recent.length)),
      });

    beforeEach(() => {
      mockLoadCatalogue.mockResolvedValue(priorityList);
      serve();
    });

    it('renders the default view from the list without fetching the catalog from Central', async () => {
      const result = await searchPackages(base);

      expect(names(result)).toEqual(['alpha', 'bravo', 'charlie']);
      expect(result.count).toBe(3);
      expect(batchRequests()).toHaveLength(0);
    });

    it('spreads the default Most Popular view across Areas, but not a Type-only filter', async () => {
      const area = (name: string, areaTag: string, rate: number) =>
        listPackage(name, ['Type/Connector', 'Vendor/Acme', `Area/${areaTag}`], rate);
      mockLoadCatalogue.mockResolvedValue({
        ...priorityList,
        packages: [
          area('crm-a', 'CRM & Sales', 100),
          area('crm-b', 'CRM & Sales', 90),
          area('erp-a', 'ERP & Business Operations', 50),
          area('misc-a', 'Analytics', 40),
        ],
      });

      const byDefault = await searchPackages(base);
      const typeOnly = await searchPackages({ ...base, types: ['Connector'] });

      expect(names(byDefault)).toEqual(['crm-a', 'erp-a', 'crm-b', 'misc-a']);
      expect(names(typeOnly)).toEqual(['crm-a', 'crm-b', 'erp-a', 'misc-a']);
    });

    it('pages and re-sorts the unfiltered catalog in memory', async () => {
      const page2 = await searchPackages({ ...base, offset: 1, limit: 1 });
      const byName = await searchPackages({ ...base, sort: 'name-desc' });

      expect(names(page2)).toEqual(['bravo']);
      expect(page2.count).toBe(3);
      expect(names(byName)).toEqual(['charlie', 'bravo', 'alpha']);
      expect(batchRequests()).toHaveLength(0);
    });

    it('answers a Type-only filter from the list, since it matches most of the catalog', async () => {
      const result = await searchPackages({ ...base, types: ['Library'] });

      expect(names(result)).toEqual(['charlie']);
      expect(batchRequests()).toHaveLength(0);
    });

    it('queries Central once for a vendor filter and keeps only exact tag matches', async () => {
      serve([
        { name: 'real', version: '1.0.0', keywords: ['Vendor/Acme'] },
        { name: 'loose', version: '1.0.0', keywords: ['Vendor/Other', 'Acme'] },
      ]);

      const result = await searchPackages({ ...base, vendors: ['Acme'] });

      expect(names(result)).toEqual(['real']);
      expect(result.count).toBe(1);
      expect(batchRequests()).toHaveLength(1);
      expect(urls().some((u) => u.includes('limit=1&'))).toBe(false);
    });

    describe('facet counts', () => {
      it('counts each option with the other filters applied and its own category left out', async () => {
        // Unfiltered: every option and how many packages carry it.
        await expect(getFacetCounts({})).resolves.toEqual({
          areas: { Finance: 2 },
          vendors: { Acme: 2, Other: 1 },
          types: { Connector: 2, Library: 1 },
        });

        // A Vendor filter prunes the other categories, but not its own options, so a
        // second vendor can still be added.
        await expect(getFacetCounts({ vendors: ['Other'] })).resolves.toEqual({
          areas: {},
          vendors: { Acme: 2, Other: 1 },
          types: { Library: 1 },
        });
      });

      it('ANDs categories: options that would leave nothing are absent', async () => {
        const counts = await getFacetCounts({ areas: ['Finance'], types: ['Connector'] });

        expect(counts?.vendors).toEqual({ Acme: 2 });
        // Ignoring its own selection, Type still offers what Area allows.
        expect(counts?.types).toEqual({ Connector: 2 });
      });

      it('applies the text query', async () => {
        await expect(getFacetCounts({ query: 'charlie' })).resolves.toEqual({
          areas: {},
          vendors: { Other: 1 },
          types: { Library: 1 },
        });
      });

      it('includes packages released since the build', async () => {
        serve([{ name: 'fresh', version: '0.1.0', keywords: ['Vendor/Newcomer', 'Type/Trigger'] }]);
        await refreshCatalog();

        const counts = await getFacetCounts({});

        expect(counts?.vendors.Newcomer).toBe(1);
        expect(counts?.types.Trigger).toBe(1);
      });

      it('makes no Central request', async () => {
        await getFacetCounts({ vendors: ['Acme'] });

        expect(batchRequests()).toHaveLength(0);
      });

      it('is null without a priority catalogue or for an org-scoped view', async () => {
        await expect(getFacetCounts({ orgName: 'ballerina' })).resolves.toBeNull();

        mockLoadCatalogue.mockResolvedValue(null);
        await expect(getFacetCounts({})).resolves.toBeNull();
      });
    });

    it('adds packages released since the build after the ranked ones', async () => {
      serve([
        { name: 'fresh', version: '0.1.0', pullCount: 0 },
        { name: 'alpha', version: '1.0.0' },
        { name: 'internal-module', version: '1.0.0' },
      ]);
      const { HIDDEN_PACKAGES } = await import('../connector-utils');
      HIDDEN_PACKAGES.add('internal-module');

      try {
        await expect(refreshCatalog()).resolves.toBe(true);
        const result = await searchPackages(base);

        expect(names(result)).toEqual(['alpha', 'bravo', 'charlie', 'fresh']);
        expect(result.count).toBe(4);
        // Nothing new the second time, so a page re-render isn't needed.
        await expect(refreshCatalog()).resolves.toBe(false);
      } finally {
        HIDDEN_PACKAGES.delete('internal-module');
      }
    });

    it('still reports new packages when the live check finishes before refreshCatalog is called', async () => {
      serve([{ name: 'fresh', version: '0.1.0' }]);

      // The grid renders from the list while the live check is still in flight...
      const first = await searchPackages(base);
      expect(names(first)).toEqual(['alpha', 'bravo', 'charlie']);
      // ...and the check lands before anyone asks about it.
      await new Promise((resolve) => setTimeout(resolve, 0));

      await expect(refreshCatalog()).resolves.toBe(true);
      expect(names(await searchPackages(base))).toContain('fresh');
      await expect(refreshCatalog()).resolves.toBe(false);
    });

    describe('packages changed since the build', () => {
      const AFTER_BUILD = '2026-10-11T00:00:00Z';
      const BEFORE_BUILD = '2026-09-01T00:00:00Z';
      const changedPackage = (name: string, createdDate: string) => ({
        ...createMockApiResponse([{ name, version: '2.0.0' }], 0).packages[0],
        createdDate,
      });
      // Serves `newer` packages newer than the build, then older ones, 100 per page.
      const serveHistory = (newer: number) => {
        mockFetch.mockImplementation((url: string) => {
          const offset = Number(/offset=(\d+)/.exec(String(url))?.[1] ?? 0);
          const limit = Number(/limit=(\d+)/.exec(String(url))?.[1] ?? 30);
          const packages = Array.from({ length: limit }, (_, i) => offset + i).map((i) =>
            changedPackage(`pkg${i}`, i < newer ? AFTER_BUILD : BEFORE_BUILD)
          );
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ packages, count: 900, offset, limit }),
          });
        });
      };
      const dateDescRequests = () => urls().filter((u) => u.includes('sort=createdDate,DESC'));

      it('stops after one page when that page already reaches back to the build', async () => {
        serveHistory(20);

        await refreshCatalog();

        expect(dateDescRequests()).toHaveLength(1);
        const result = await searchPackages(base);
        expect(result.count).toBe(3 + 100);
      });

      it('keeps paging, in parallel, while the newest packages are all newer than the build', async () => {
        serveHistory(250);

        await refreshCatalog();

        // First page, then the rest up to the 500-package cap.
        expect(dateDescRequests().map((u) => /offset=(\d+)/.exec(u)?.[1])).toEqual(
          expect.arrayContaining(['0', '100', '200', '300', '400'])
        );
        expect(dateDescRequests()).toHaveLength(5);
        const result = await searchPackages({ ...base, limit: 1000 });
        expect(result.count).toBe(3 + 500);
      });

      it('warns when more packages changed than it will read', async () => {
        serveHistory(900);
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await refreshCatalog();

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Rebuild the store'));
        warn.mockRestore();
      });
    });

    it('shows a newer version of a listed package without losing its rank', async () => {
      serve([{ name: 'bravo', version: '2.0.0' }]);

      await expect(refreshCatalog()).resolves.toBe(true);
      const result = await searchPackages(base);

      expect(names(result)).toEqual(['alpha', 'bravo', 'charlie']);
      expect(result.packages[1].version).toBe('2.0.0');
    });

    it('builds the vendor list from the list, then adds vendors of new packages', async () => {
      serve([{ name: 'fresh', version: '0.1.0', keywords: ['Vendor/Newcomer'] }]);
      const onUpdate = jest.fn();

      const filters = await fetchFiltersProgressively(undefined, onUpdate);

      expect(filters.vendors).toContain('Acme');
      expect(filters.vendors).not.toContain('Other');
      expect(filters.vendors).not.toContain('Newcomer');
      expect(storageMock.setItem).not.toHaveBeenCalled();
      expect(batchRequests()).toHaveLength(0);

      await refreshCatalog();
      await Promise.resolve();
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate.mock.calls[0][0].vendors).toContain('Newcomer');
    });

    it('keeps serving the list when the live check for new packages fails', async () => {
      mockFetch.mockRejectedValue(new Error('network down'));

      await expect(refreshCatalog()).resolves.toBe(false);
      const result = await searchPackages(base);

      expect(names(result)).toEqual(['alpha', 'bravo', 'charlie']);
    }, 10000);

    it('does not use the list for an org-scoped search', async () => {
      await searchPackages({ ...base, orgName: 'ballerinax' });

      expect(mockLoadCatalogue).not.toHaveBeenCalled();
    });
  });

  describe('fetchWithTimeout (via fetchPackageVersionsNoRetry)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should reject with a clear timeout error instead of hanging forever (see #2553)', async () => {
      // Simulate a hung request: fetch() never resolves on its own, only when
      // fetchWithTimeout's internal AbortController fires.
      mockFetch.mockImplementation(
        (_url: string, options?: RequestInit) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          })
      );

      const resultPromise = fetchPackageVersionsNoRetry('ballerina', 'http');
      const assertion = expect(resultPromise).rejects.toThrow(/timed out/i);

      jest.advanceTimersByTime(10000);
      await assertion;
    });
  });

  describe('a package Central does not have (404)', () => {
    const notFound = { ok: false, status: 404, json: () => Promise.resolve({}) };
    const versions = (list: string[]) => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve(list),
    });

    it('rejects with a not-found error and asks only once, instead of retrying', async () => {
      mockFetch.mockResolvedValue(notFound);

      const error = await fetchPackageVersions('ballerinax', 'doesnotexist').catch((e) => e);

      expect(isNotFoundError(error)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('treats a missing package in fetchPackageDetails as not found', async () => {
      mockFetch.mockResolvedValue(notFound);

      const error = await fetchPackageDetails('ballerinax', 'doesnotexist', 'latest').catch(
        (e) => e
      );

      expect(isNotFoundError(error)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('treats a missing version in fetchPackageDetails as not found', async () => {
      mockFetch.mockResolvedValueOnce(versions(['1.0.0'])).mockResolvedValueOnce(notFound);

      const error = await fetchPackageDetails('ballerinax', 'http', '9.9.9').catch((e) => e);

      expect(isNotFoundError(error)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('encodes the org, name and version in the request URL', async () => {
      mockFetch.mockResolvedValueOnce(versions(['1.0.0'])).mockResolvedValueOnce(notFound);

      await fetchPackageDetails('ballerinax', 'http', '../../graphql').catch((e) => e);

      const urls = mockFetch.mock.calls.map((call) => String(call[0]));
      expect(urls[0]).toMatch(/\/packages\/ballerinax\/http$/);
      expect(urls[1]).toMatch(/\/packages\/ballerinax\/http\/\.\.%2F\.\.%2Fgraphql$/);
    });

    it('sends the package values to GraphQL as variables, not in the query text', async () => {
      const details = { ok: true, status: 200, json: () => Promise.resolve({ pullCount: 5 }) };
      const graphql = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { package: { totalPullCount: 9 } } }),
      };
      mockFetch
        .mockResolvedValueOnce(versions(['1.0.0']))
        .mockResolvedValueOnce(details)
        .mockResolvedValueOnce(graphql);

      const result = await fetchPackageDetails('ballerinax', 'http', '1.0.0');

      expect(result.totalPullCount).toBe(9);
      const body = JSON.parse(mockFetch.mock.calls[2][1].body);
      expect(body.variables).toEqual({
        orgName: 'ballerinax',
        packageName: 'http',
        version: '1.0.0',
      });
      expect(body.query).not.toContain('ballerinax');
      expect(body.query).not.toContain('1.0.0');
    });

    it('still retries other failures', async () => {
      const realSetTimeout = global.setTimeout;
      // Skip the 1s/2s backoff between attempts; leave the 10s request timeout alone.
      jest
        .spyOn(global, 'setTimeout')
        .mockImplementation(((fn: () => void, ms?: number) =>
          ms === 1000 || ms === 2000 ? realSetTimeout(fn, 0) : realSetTimeout(fn, ms)) as never);
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockFetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });

      const error = await fetchPackageVersions('ballerinax', 'http').catch((e) => e);

      expect(isNotFoundError(error)).toBe(false);
      expect(error.message).toMatch(/500/);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      jest.restoreAllMocks();
    });
  });
});
