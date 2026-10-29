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

import { getCatalogMatches, searchPackages } from '@/lib/rest-client';
import type { BallerinaPackage } from '@/types/connector';
import {
  activeProfile,
  getProfileCounts,
  hasMIProfile,
  parseProfiles,
  profileParam,
  searchWithProfile,
} from './profile-search';
import type { ListedConnector } from './profile-search';

jest.mock('@/lib/rest-client', () => ({ searchPackages: jest.fn(), getCatalogMatches: jest.fn() }));

const mockSearch = searchPackages as jest.Mock;
const mockMatches = getCatalogMatches as jest.Mock;

const pkg = (
  org: string,
  name: string,
  extra: Partial<BallerinaPackage> = {}
): BallerinaPackage => ({
  name,
  organization: org,
  version: '1.0.0',
  URL: `/${org}/${name}/1.0.0`,
  summary: `${name} connector`,
  keywords: [],
  icon: '',
  createdDate: '2026-01-01T00:00:00Z',
  ...extra,
});

// Already in "Most popular" order, as the real search returns them.
const BALLERINA = [
  pkg('ballerinax', 'kafka'),
  pkg('ballerinax', 'github'),
  pkg('ballerinax', 'salesforce'),
  pkg('ballerinax', 'slack'),
];

const MI_ONLY_NAMES = [
  'AS400 PCML',
  'CDC (Inbound)',
  'Creatio',
  'Google Ads',
  'Google Firebase',
  'Intelligent Document Processing',
  'ISO8583',
  'Pulsar',
  'Utility',
];

const names = (items: ListedConnector[]) => items.map((p) => p.miOnly?.name ?? p.name);

beforeEach(() => {
  // A search over the four packages: all of them for a big limit, a page otherwise.
  mockSearch.mockImplementation(async (params: { offset: number; limit: number }) => ({
    packages: BALLERINA.slice(params.offset, params.offset + params.limit),
    count: BALLERINA.length,
    offset: params.offset,
    limit: params.limit,
  }));
});

const base = { offset: 0, limit: 30, sort: 'pullCount-desc' as const };

describe('profile URL parameter', () => {
  it('reads known profiles and drops the rest', () => {
    expect(parseProfiles(null)).toEqual([]);
    expect(parseProfiles('mi')).toEqual(['mi']);
    expect(parseProfiles('default')).toEqual(['default']);
    expect(parseProfiles('mi,nonsense')).toEqual(['mi']);
    expect(parseProfiles('nonsense')).toEqual([]);
  });

  it('treats both profiles like none: nothing restricts the list and the URL drops it', () => {
    const both = parseProfiles('mi,default');
    expect(both).toHaveLength(2);
    expect(activeProfile(both)).toBeNull();
    expect(profileParam(both)).toBeUndefined();
    expect(activeProfile([])).toBeNull();
    expect(activeProfile(['mi'])).toBe('mi');
    expect(profileParam(['mi'])).toBe('mi');
    expect(profileParam(['default'])).toBe('default');
  });
});

describe('hasMIProfile', () => {
  it('is true for mapped packages and false for the rest', () => {
    expect(hasMIProfile(pkg('ballerinax', 'kafka'))).toBe(true);
    expect(hasMIProfile(pkg('ballerinax', 'github'))).toBe(false);
    // Same name in another org is a different package
    expect(hasMIProfile(pkg('ballerina', 'kafka'))).toBe(false);
  });

  it('reads the identity from the Central URL, with or without the packages/ prefix', () => {
    expect(hasMIProfile(pkg('x', 'y', { URL: 'packages/ballerinax/kafka/4.6.7' }))).toBe(true);
  });
});

describe('searchWithProfile', () => {
  it('WSO2 Integrator: the plain search, no MI-only connectors', async () => {
    const result = await searchWithProfile(base, 'default');
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith(base);
    expect(names(result.packages)).toEqual(['kafka', 'github', 'salesforce', 'slack']);
    expect(result.count).toBe(4);
  });

  it('nothing selected: Ballerina first, then the MI-only connectors, in one count', async () => {
    const result = await searchWithProfile(base, null);
    expect(names(result.packages)).toEqual([
      'kafka',
      'github',
      'salesforce',
      'slack',
      ...MI_ONLY_NAMES,
    ]);
    expect(result.count).toBe(4 + MI_ONLY_NAMES.length);
    // Ballerina order is untouched, so the page is a single ordinary request
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith(base);
  });

  it('continues into the MI-only connectors across a page boundary', async () => {
    const page1 = await searchWithProfile({ ...base, limit: 6 }, null);
    expect(names(page1.packages)).toEqual([
      'kafka',
      'github',
      'salesforce',
      'slack',
      'AS400 PCML',
      'CDC (Inbound)',
    ]);

    const page2 = await searchWithProfile({ ...base, offset: 6, limit: 6 }, null);
    expect(names(page2.packages)).toEqual([
      'Creatio',
      'Google Ads',
      'Google Firebase',
      'Intelligent Document Processing',
      'ISO8583',
      'Pulsar',
    ]);

    const page3 = await searchWithProfile({ ...base, offset: 12, limit: 6 }, null);
    expect(names(page3.packages)).toEqual(['Utility']);
  });

  it('lists MI-only connectors after the Ballerina ones for the other non-name sorts too', async () => {
    for (const sort of ['pullCount-asc', 'date-desc', 'date-asc'] as const) {
      const result = await searchWithProfile({ ...base, sort }, null);
      expect(names(result.packages).slice(0, 4)).toEqual([
        'kafka',
        'github',
        'salesforce',
        'slack',
      ]);
      expect(result.packages).toHaveLength(4 + MI_ONLY_NAMES.length);
    }
  });

  it('places MI-only connectors by name for the name sorts', async () => {
    const asc = await searchWithProfile({ ...base, sort: 'name-asc' }, null);
    const ascNames = names(asc.packages);
    expect(ascNames).toEqual([...ascNames].sort((a, b) => a.localeCompare(b)));
    expect(ascNames).toContain('Pulsar');
    expect(ascNames.indexOf('Creatio')).toBeLessThan(ascNames.indexOf('Pulsar'));

    const desc = await searchWithProfile({ ...base, sort: 'name-desc' }, null);
    expect(names(desc.packages)).toEqual([...ascNames].reverse());
  });

  it('paginates the merged name-sorted list', async () => {
    const all = names((await searchWithProfile({ ...base, sort: 'name-asc' }, null)).packages);
    const page = await searchWithProfile({ ...base, sort: 'name-asc', offset: 3, limit: 4 }, null);
    expect(names(page.packages)).toEqual(all.slice(3, 7));
    expect(page.count).toBe(all.length);
  });

  it('hides MI-only connectors when an Area, Vendor or Type filter is used', async () => {
    for (const filter of [
      { areas: ['Messaging'] },
      { vendors: ['Apache'] },
      { types: ['Connector'] },
    ]) {
      const result = await searchWithProfile({ ...base, ...filter }, null);
      expect(names(result.packages)).toEqual(['kafka', 'github', 'salesforce', 'slack']);
      expect(result.count).toBe(4);
    }
  });

  it('searches MI-only connectors by name and description', async () => {
    mockSearch.mockResolvedValue({ packages: [], count: 0, offset: 0, limit: 30 });
    const byName = await searchWithProfile({ ...base, query: 'pulsar' }, null);
    expect(names(byName.packages)).toEqual(['Pulsar']);
    const byDescription = await searchWithProfile({ ...base, query: 'debezium' }, null);
    expect(names(byDescription.packages)).toEqual(['CDC (Inbound)']);
    const none = await searchWithProfile({ ...base, query: 'zzz-nothing' }, null);
    expect(none.packages).toEqual([]);
    expect(none.count).toBe(0);
  });

  it('WSO2 Integrator: MI: only packages with an MI profile, plus all MI-only connectors', async () => {
    const result = await searchWithProfile(base, 'mi');
    // kafka and salesforce have an MI profile; github and slack do not
    expect(names(result.packages)).toEqual(['kafka', 'salesforce', ...MI_ONLY_NAMES]);
    expect(result.count).toBe(2 + MI_ONLY_NAMES.length);
  });

  it('MI view keeps the Ballerina order and combines with search, and with filters hides MI-only', async () => {
    const filtered = await searchWithProfile({ ...base, areas: ['CRM & Sales'] }, 'mi');
    expect(names(filtered.packages)).toEqual(['kafka', 'salesforce']);
    expect(filtered.count).toBe(2);
  });

  it('MI view paginates', async () => {
    const page = await searchWithProfile({ ...base, offset: 1, limit: 3 }, 'mi');
    expect(names(page.packages)).toEqual(['salesforce', 'AS400 PCML', 'CDC (Inbound)']);
    expect(page.count).toBe(2 + MI_ONLY_NAMES.length);
  });

  it('marks MI-only entries with their connector and a Store detail link', async () => {
    const result = await searchWithProfile(base, 'mi');
    const pulsar = result.packages.find((p) => p.miOnly?.name === 'Pulsar');
    expect(pulsar?.URL).toBe('/connector/wso2-mi/mi-connector-pulsar');
    expect(pulsar?.miOnly?.componentIds).toEqual(['mi-connector-pulsar', 'mi-inbound-pulsar']);
    expect(result.packages.find((p) => p.name === 'kafka')?.miOnly).toBeUndefined();
  });
});

describe('getProfileCounts', () => {
  beforeEach(() => {
    mockMatches.mockResolvedValue(BALLERINA);
  });

  it('counts each profile with the current search and filters', async () => {
    expect(await getProfileCounts({})).toEqual({
      default: 4,
      mi: 2 + MI_ONLY_NAMES.length,
    });
  });

  it('leaves MI-only connectors out of the MI count when Area, Vendor or Type is used', async () => {
    expect(await getProfileCounts({ areas: ['Messaging'] })).toEqual({ default: 4, mi: 2 });
  });

  it('counts only the matching MI-only connectors for a search', async () => {
    expect(await getProfileCounts({ query: 'pulsar' })).toEqual({ default: 4, mi: 2 + 1 });
  });

  it('counts from the in-memory catalogue, without a search request', async () => {
    await getProfileCounts({ query: 'kafka', areas: ['Messaging'] });
    expect(mockMatches).toHaveBeenCalledWith({ query: 'kafka', areas: ['Messaging'] });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('gives no counts while there is no catalogue', async () => {
    mockMatches.mockResolvedValue(null);
    expect(await getProfileCounts({})).toBeNull();
  });
});
