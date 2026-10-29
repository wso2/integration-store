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
  MI_MAPPING,
  compareReleasesDesc,
  didMILoadFail,
  fetchMIComponents,
  formatMIVersionRange,
  getAssetLabel,
  getMIComponentIds,
  selectMIComponent,
  sortMIVersions,
  usableDocumentationUrl,
  MIComponent,
} from './index';

const component = (id: string): MIComponent => ({ id, name: id, labels: [], releases: [] });

describe('compareReleasesDesc', () => {
  it('sorts by semver, not by string or API order', () => {
    const tags = ['v3.3.6', 'v3.3.11', 'v3.3.2', 'v3.3.10'].map((tagName) => ({ tagName }));
    expect(tags.sort(compareReleasesDesc).map((t) => t.tagName)).toEqual([
      'v3.3.11',
      'v3.3.10',
      'v3.3.6',
      'v3.3.2',
    ]);
  });

  it('puts unparseable tags last', () => {
    const tags = [{ tagName: 'nightly' }, { tagName: 'v1.0.0' }];
    expect(tags.sort(compareReleasesDesc).map((t) => t.tagName)).toEqual(['v1.0.0', 'nightly']);
  });
});

describe('sortMIVersions', () => {
  it('sorts newest first, removes duplicates and ignores blanks', () => {
    expect(sortMIVersions(['MI 4.0.0', 'MI 4.10.0', 'MI 4.7.0', 'MI 4.7.0', ' '])).toEqual([
      'MI 4.10.0',
      'MI 4.7.0',
      'MI 4.0.0',
    ]);
  });

  it('ignores products that are not MI, such as old ESB releases', () => {
    expect(sortMIVersions(['ESB 5.0.0', '"ESB 5.0.0"', 'MI 4.7.0', 'mi 4.6.0'])).toEqual([
      'MI 4.7.0',
      'mi 4.6.0',
    ]);
  });
});

describe('formatMIVersionRange', () => {
  it('shows a range for an unbroken run of minors', () => {
    const products = ['MI 4.0.0', 'MI 4.1.0', 'MI 4.2.0', 'MI 4.3.0'];
    expect(formatMIVersionRange(products)).toBe('MI 4.3.0 … MI 4.0.0');
  });

  it('lists every version when there is a gap or a different major', () => {
    expect(formatMIVersionRange(['MI 4.4.0', 'MI 4.0.0', 'MI 1.2.0'])).toBe(
      'MI 4.4.0, MI 4.0.0, MI 1.2.0'
    );
    expect(formatMIVersionRange(['MI 4.4.0', 'MI 4.2.0', 'MI 4.1.0'])).toBe(
      'MI 4.4.0, MI 4.2.0, MI 4.1.0'
    );
  });

  it('lists one or two versions as they are', () => {
    expect(formatMIVersionRange(['MI 4.7.0'])).toBe('MI 4.7.0');
    expect(formatMIVersionRange(['MI 4.6.0', 'MI 4.7.0'])).toBe('MI 4.7.0, MI 4.6.0');
    expect(formatMIVersionRange([])).toBe('');
  });
});

describe('getAssetLabel', () => {
  it('uses the file extension', () => {
    expect(getAssetLabel('kafkaTransport-connector-3.3.11.zip')).toBe('zip');
    expect(getAssetLabel('mi-inbound-kafka-1.2.6.JAR')).toBe('jar');
    expect(getAssetLabel('README')).toBe('file');
  });
});

describe('selectMIComponent', () => {
  const components = [component('esb-connector-kafka'), component('esb-inbound-kafka')];

  it('returns the requested component', () => {
    expect(selectMIComponent(components, 'esb-inbound-kafka')?.id).toBe('esb-inbound-kafka');
  });

  it('falls back to the first component for an unknown, empty or missing id', () => {
    expect(selectMIComponent(components, 'unknown')?.id).toBe('esb-connector-kafka');
    expect(selectMIComponent(components, '')?.id).toBe('esb-connector-kafka');
    expect(selectMIComponent(components, null)?.id).toBe('esb-connector-kafka');
  });

  it('returns undefined when there are no components', () => {
    expect(selectMIComponent([], 'esb-connector-kafka')).toBeUndefined();
  });
});

describe('MI mapping', () => {
  it('returns the ids in order, and nothing for unmapped packages', () => {
    expect(getMIComponentIds('ballerinax', 'kafka')).toEqual([
      'esb-connector-kafka',
      'esb-inbound-kafka',
    ]);
    expect(getMIComponentIds('ballerinax', 'stripe-not-mapped')).toEqual([]);
  });

  it('lists each component at most once per package, and maps 44 packages to 56 components', () => {
    const all = new Set<string>();
    Object.values(MI_MAPPING).forEach((ids) => {
      expect(new Set(ids).size).toBe(ids.length);
      ids.forEach((id) => all.add(id));
    });
    expect(Object.keys(MI_MAPPING)).toHaveLength(44);
    expect(all.size).toBe(56);
  });

  it('lets several packages share one MI component (SharePoint)', () => {
    expect(getMIComponentIds('ballerinax', 'microsoft.sharepoint.lists')).toEqual([
      'esb-connector-sharepoint',
    ]);
    expect(getMIComponentIds('ballerinax', 'microsoft.sharepoint.sites')).toEqual([
      'esb-connector-sharepoint',
    ]);
  });

  it('keeps the Salesforce components in the order of the proposal', () => {
    expect(getMIComponentIds('ballerinax', 'salesforce')).toEqual([
      'esb-connector-salesforcerest',
      'esb-connector-salesforce',
      'esb-connector-salesforcebulk',
      'esb-inbound-salesforce',
    ]);
  });

  it('maps ballerina/crypto to the cryptography module', () => {
    expect(getMIComponentIds('ballerina', 'crypto')).toEqual(['mediation-cryptography-module']);
  });
});

describe('fetchMIComponents', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('does not call the API for a package without an MI counterpart', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fetchMIComponents('ballerinax', 'not-mapped')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads components in mapping order with releases sorted newest first', async () => {
    const respond = (url: string) => {
      if (url.endsWith('/releases')) {
        return [
          {
            tagName: 'v1.0.0',
            products: ['MI 4.0.0'],
            assets: [{ name: 'a.zip', downloadUrl: 'u1' }],
          },
          {
            tagName: 'v1.10.0',
            products: ['MI 4.7.0'],
            assets: [{ name: 'b.zip', downloadUrl: 'u2' }],
          },
        ];
      }
      return {
        connectorName: url.includes('inbound') ? 'Kafka (Inbound)' : 'Kafka',
        labels: ['integration'],
      };
    };
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => respond(url),
    })) as unknown as typeof fetch;

    const result = await fetchMIComponents('ballerinax', 'kafka');
    expect(result.map((c) => c.name)).toEqual(['Kafka', 'Kafka (Inbound)']);
    expect(result[0].releases.map((r) => r.tagName)).toEqual(['v1.10.0', 'v1.0.0']);
  });

  it('drops an unusable documentation link from the component details', async () => {
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith('/releases')
          ? [{ tagName: 'v1.0.0', products: ['MI 4.7.0'] }]
          : { connectorName: 'Stripe', documentationUrl: 'https://mi.docs.wso2.com/en/latest/' },
    })) as unknown as typeof fetch;

    const result = await fetchMIComponents('ballerinax', 'stripe');
    expect(result).toHaveLength(1);
    expect(result[0].documentationUrl).toBeUndefined();
  });

  it('skips a component whose details fail to load', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn(async (url: string) => ({
      ok: !url.includes('esb-inbound-twitter'),
      status: url.includes('esb-inbound-twitter') ? 500 : 200,
      json: async () =>
        url.endsWith('/releases')
          ? [{ tagName: 'v1.0.0', products: ['MI 4.7.0'] }]
          : { connectorName: 'Twitter' },
    })) as unknown as typeof fetch;

    const result = await fetchMIComponents('ballerinax', 'twitter');
    expect(result.map((c) => c.id)).toEqual(['esb-connector-twitter']);
    expect(didMILoadFail(['esb-inbound-twitter'])).toBe(true);
    expect(didMILoadFail(['esb-connector-twitter'])).toBe(false);
    error.mockRestore();
  });

  it('treats a connector whose only release is for an old ESB product as having no MI profile', async () => {
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith('/releases')
          ? [{ tagName: 'v2.0.0', products: ['"ESB 5.0.0"'] }]
          : { connectorName: 'Snowflake' },
    })) as unknown as typeof fetch;

    await expect(fetchMIComponents('ballerinax', 'snowflake')).resolves.toEqual([]);
    expect(didMILoadFail(['esb-connector-snowflake'])).toBe(false);
  });

  it('drops releases without an MI version and keeps the others', async () => {
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith('/releases')
          ? [
              { tagName: 'v2.0.0', products: ['ESB 5.0.0'] },
              { tagName: 'v1.0.0', products: ['MI 4.7.0'] },
            ]
          : { connectorName: 'Solace' },
    })) as unknown as typeof fetch;

    const result = await fetchMIComponents('ballerinax', 'solace');
    expect(result[0].releases.map((r) => r.tagName)).toEqual(['v1.0.0']);
  });

  it('gives up after 10 seconds and reports the load as failed', async () => {
    jest.useFakeTimers();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    ) as unknown as typeof fetch;

    const pending = fetchMIComponents('ballerinax', 'servicenow');
    jest.advanceTimersByTime(10_000);
    await expect(pending).resolves.toEqual([]);
    expect(didMILoadFail(['esb-connector-servicenow'])).toBe(true);

    error.mockRestore();
    jest.useRealTimers();
  });
});

describe('usableDocumentationUrl', () => {
  it.each([
    ['https://mi.docs.wso2.com'],
    ['https://mi.docs.wso2.com/'],
    ['https://mi.docs.wso2.com/en/latest/'],
    ['https://mi.docs.wso2.com/en/4.4.0/'],
    ['https://mi.docs.wso2.com/en/4.4.0'],
    ['HTTPS://MI.DOCS.WSO2.COM/en/latest?x=1#top'],
    ['https://github.com/wso2-extensions/identity-outbound-auth-oidc'],
    [
      'https://github.com/wso2-extensions/identity-outbound-auth-linkedIn/blob/master/docs/README.md',
    ],
    ['https://github.com/wso2-extensions/identity-outbound-auth-sms-otp/blob/master/README.md'],
    ['https://docs.wso2.com/display/ESBCONNECTORS/Stripe+Connector'],
  ])('drops %s', (url) => {
    expect(usableDocumentationUrl(url)).toBeUndefined();
  });

  it.each([
    ['https://mi.docs.wso2.com/en/latest/reference/connectors/snowflake-connector/'],
    ['https://github.com/wso2-extensions/mediation-snowflake-connector'],
    ['https://mi.docs.wso2.com/en/latest/reference/connectors/salesforce-connectors/sf-overview/'],
    ['https://mi.docs.wso2.com/en/4.4.0/reference/connectors/snowflake-connector/'],
  ])('keeps %s', (url) => {
    expect(usableDocumentationUrl(url)).toBe(url);
  });

  it('passes through a missing value', () => {
    expect(usableDocumentationUrl(undefined)).toBeUndefined();
  });
});
