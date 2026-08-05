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
  SearchParams,
} from './rest-client';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

const FILTER_CACHE_KEY = 'ballerina_connector_filters';

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
  packages: Array<{ name: string; version: string; keywords?: string[] }>,
  count: number,
  offset: number = 0,
  limit: number = 30
) => ({
  packages: packages.map((pkg) => ({
    name: pkg.name,
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
      const mockResponse = createMockApiResponse([{ name: 'test-connector', version: '1.0.0' }], 1);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const params: SearchParams = {
        offset: 0,
        limit: 30,
        sort: 'pullCount-desc',
      };

      const result = await searchPackages(params);

      expect(mockFetch).toHaveBeenCalledTimes(1);
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
      // Each of the 2 area combinations now fetches its complete result set
      // (a count check, then a batch fetch) rather than one offset-limited page.
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should exclude hidden packages from results', async () => {
      const { HIDDEN_PACKAGES } = await import('../connector-utils');
      HIDDEN_PACKAGES.add('internal-module');

      try {
        const mockResponse = createMockApiResponse(
          [
            { name: 'visible-connector', version: '1.0.0', keywords: ['Type/Connector'] },
            { name: 'internal-module', version: '1.0.0', keywords: [] },
          ],
          2
        );
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await searchPackages({ offset: 0, limit: 30, sort: 'pullCount-desc' });

        expect(result.packages).toHaveLength(1);
        expect(result.packages[0].name).toBe('visible-connector');
      } finally {
        HIDDEN_PACKAGES.delete('internal-module');
      }
    });

    it('should handle API errors with retry', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockApiResponse([], 0)),
      });
      await searchPackages({ offset: 0, limit: 30, sort: 'pullCount-desc' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    }, 10000);
  });

  describe('fetchFiltersProgressively', () => {
    it('should return cached filters if available and not expired', async () => {
      const freshCache = {
        filters: { areas: ['CachedArea'], vendors: ['CachedVendor'], types: ['CachedType'] },
        timestamp: Date.now(),
      };
      storageMock.setItem(FILTER_CACHE_KEY, JSON.stringify(freshCache));
      storageMock.setItem.mockClear();

      const result = await fetchFiltersProgressively();

      expect(result).toEqual(freshCache.filters);
      expect(storageMock.getItem).toHaveBeenCalledWith(FILTER_CACHE_KEY);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch new filters if cache is expired', async () => {
      const expiredCache = {
        filters: { areas: [], vendors: [], types: [] },
        timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      };
      storageMock.setItem(FILTER_CACHE_KEY, JSON.stringify(expiredCache));
      storageMock.removeItem.mockClear();

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockApiResponse([{ name: 'new', version: '1.0' }], 1)),
      });

      const result = await fetchFiltersProgressively();

      expect(mockFetch).toHaveBeenCalled();
      expect(result.areas).toContain('Integration');
      expect(storageMock.removeItem).toHaveBeenCalledWith(FILTER_CACHE_KEY);
    });

    it('should fetch and cache filters when cache is empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockApiResponse([], 50)), // count <= 100
      });

      await fetchFiltersProgressively();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(storageMock.setItem).toHaveBeenCalledWith(FILTER_CACHE_KEY, expect.any(String));
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
      expect(storageMock.setItem).toHaveBeenCalledWith(FILTER_CACHE_KEY, expect.any(String));
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
});
