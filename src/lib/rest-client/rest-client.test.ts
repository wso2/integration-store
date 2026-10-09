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
  fetchPackageVersionsNoRetry,
  SearchParams,
  __resetHiddenCountCacheForTests,
  __resetRankingDataCacheForTests,
  __resetFetchedCatalogCacheForTests,
} from './rest-client';

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
  packages: Array<{ name: string; version: string; keywords?: string[]; organization?: string }>,
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
    pullCount: 1000,
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
      // calls: a count probe (limit=1), then the real batch fetch.
      const countResponse = createMockApiResponse([], 1);
      const batchResponse = createMockApiResponse(
        [{ name: 'test-connector', version: '1.0.0' }],
        1
      );
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(countResponse) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batchResponse) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ packages: {} }) });

      const params: SearchParams = {
        offset: 0,
        limit: 30,
        sort: 'pullCount-desc',
      };

      const result = await searchPackages(params);

      // pullCount-desc takes the full-fetch path (count probe + batch), plus
      // a third call to fetch ranking-data.json for scoring -- 3 calls total.
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].name).toBe('test-connector');
      expect(result.packages[0].totalPullCount).toBe(1000);
    });

    it('should include search query in request', async () => {
      // With a search query, searchPackages fetches all results for client-side filtering.
      // First call: count check (limit=1), second call: full batch fetch.
      const countResponse = createMockApiResponse([], 1);
      const batchResponse = createMockApiResponse([{ name: 'stripe', version: '1.0.0' }], 1);
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(countResponse) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batchResponse) });

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
      const countResponse = createMockApiResponse([], 1);
      const batchResponse = createMockApiResponse(
        [{ name: 'sap.businessone', version: '1.0.0' }],
        1
      );
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(countResponse) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batchResponse) });

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
      const countResponse = createMockApiResponse([], 1);
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
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(countResponse) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batchResponse) });

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
      // A Vendor filter now always fetches the complete result set (count check +
      // batch), so the same response must back both calls.
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
      // Each of the 2 area combinations fetches its complete result set (a
      // count check, then a batch fetch), plus one shared ranking-data fetch
      // for scoring -- 5 calls total.
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('should exclude hidden packages from results', async () => {
      const { HIDDEN_PACKAGES } = await import('../connector-utils');
      HIDDEN_PACKAGES.add('internal-module');

      try {
        // Same full-fetch reasoning as above -- two calls needed, not one.
        const countResponse = createMockApiResponse([], 2);
        const batchResponse = createMockApiResponse(
          [
            { name: 'visible-connector', version: '1.0.0', keywords: ['Type/Connector'] },
            { name: 'internal-module', version: '1.0.0', keywords: [] },
          ],
          2
        );
        mockFetch
          .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(countResponse) })
          .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batchResponse) });

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
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockApiResponse([], catalog.length)),
          })
          .mockResolvedValueOnce({
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
        // (no cross-call caching), so each needs its own count probe + batch mock.
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockApiResponse([], fullCatalog.length)),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockApiResponse(fullCatalog, fullCatalog.length)),
          });

        const firstPage = await searchPackages({ offset: 0, limit: 2, sort: 'pullCount-desc' });

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockApiResponse([], fullCatalog.length)),
          })
          .mockResolvedValueOnce({
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
      // pullCount-desc takes the full-fetch path: a count probe, then a batch
      // fetch, then a ranking-data fetch for scoring. Here the count probe's
      // first attempt fails and retries successfully -- 4 calls total: failed
      // probe, retry, batch, ranking data.
      const countResponse = createMockApiResponse([], 1);
      const batchResponse = createMockApiResponse(
        [{ name: 'retried-connector', version: '1.0.0' }],
        1
      );
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(countResponse) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(batchResponse) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ packages: {} }) });

      const result = await searchPackages({ offset: 0, limit: 30, sort: 'pullCount-desc' });

      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].name).toBe('retried-connector');
    }, 10000);
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

      // 1 call for the batch itself + 2 for the fast path's hidden-count probe
      // (a count check, then one batch fetch — see #2552)
      expect(mockFetch).toHaveBeenCalledTimes(3);
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
      // One full fetch = 1 count probe + 1 batch request.
      expect(centralCalls()).toBe(2);

      const page2 = await searchPackages({ ...base, offset: 2 });
      expect(centralCalls()).toBe(2);
      expect(page1.packages.map((p) => p.name)).toEqual(['conn-a', 'conn-b']);
      expect(page2.packages.map((p) => p.name)).toEqual(['conn-c', 'conn-d']);
      expect(page2.count).toBe(5);
    });

    it('should not re-fetch from Central when only the sort changes, and sort in memory', async () => {
      serveCatalog();
      await searchPackages(base);
      expect(centralCalls()).toBe(2);

      const desc = await searchPackages({ ...base, sort: 'name-desc' });
      expect(centralCalls()).toBe(2);
      expect(desc.packages.map((p) => p.name)).toEqual(['conn-e', 'conn-d']);

      // The earlier sort must not have mutated the cached catalog.
      const asc = await searchPackages(base);
      expect(centralCalls()).toBe(2);
      expect(asc.packages.map((p) => p.name)).toEqual(['conn-a', 'conn-b']);
    });

    it('should share one fetch between concurrent calls', async () => {
      serveCatalog();
      await Promise.all([searchPackages(base), searchPackages({ ...base, offset: 2 })]);
      expect(centralCalls()).toBe(2);
    });

    it('should re-fetch when the query or a filter changes, but not for equivalent keys', async () => {
      serveCatalog();
      await searchPackages(base);
      expect(centralCalls()).toBe(2);

      await searchPackages({ ...base, query: 'conn-a' });
      expect(centralCalls()).toBe(4);

      await searchPackages({ ...base, areas: ['Integration'] });
      expect(centralCalls()).toBe(6);

      // Same key after normalisation: trimmed query, reordered multi-select values.
      await searchPackages({ ...base, query: ' conn ' });
      expect(centralCalls()).toBe(6);
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
});
