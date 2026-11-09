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
  countBySeverity,
  countFixedByPatch,
  fetchSbomOrgs,
  fetchVulnerabilityReport,
  findLatestPatch,
  formatCheckedAgo,
  getCve,
  groupByDependency,
  isDirectVulnerability,
  parseLibrary,
  splitVulnerabilities,
} from './vulnerabilities';
import { Vulnerability } from '@/types/connector';

const vuln = (overrides: Partial<Vulnerability> = {}): Vulnerability => ({
  id: 'GHSA-aaaa',
  aliases: ['CVE-2026-1'],
  severity: 'high',
  summary: 'Something bad',
  purl: 'pkg:maven/com.google.guava/guava@32.0.1-jre',
  fixedIn: ['33.7.2'],
  introducedVia: ['kafka 4.6.2', 'guava 32.0.1-jre'],
  url: 'https://osv.dev/vulnerability/GHSA-aaaa',
  ...overrides,
});

describe('isDirectVulnerability', () => {
  it('treats a two-entry chain as direct and a longer chain as indirect', () => {
    expect(isDirectVulnerability(vuln())).toBe(true);
    expect(
      isDirectVulnerability(vuln({ introducedVia: ['kafka 4.6.2', 'crypto 2.9.2', 'bc 1.80'] }))
    ).toBe(false);
  });
});

describe('countBySeverity', () => {
  it('counts each severity and the total', () => {
    const counts = countBySeverity([
      vuln({ severity: 'critical' }),
      vuln({ severity: 'high' }),
      vuln({ severity: 'high' }),
    ]);
    expect(counts).toEqual({ critical: 1, high: 2, medium: 0, low: 0, unknown: 0, total: 3 });
  });
});

describe('splitVulnerabilities', () => {
  it('splits direct from indirect and sorts most severe first', () => {
    const indirectChain = ['kafka 4.6.2', 'crypto 2.9.2', 'bc 1.80'];
    const { direct, indirect } = splitVulnerabilities({
      scannedDate: '2026-11-06T00:00:00Z',
      vulnerabilities: [
        vuln({ id: 'medium-direct', severity: 'medium' }),
        vuln({ id: 'critical-indirect', severity: 'critical', introducedVia: indirectChain }),
        vuln({ id: 'high-direct', severity: 'high' }),
      ],
    });
    expect(direct.map((v) => v.id)).toEqual(['high-direct', 'medium-direct']);
    expect(indirect.map((v) => v.id)).toEqual(['critical-indirect']);
  });
});

describe('parseLibrary / getCve', () => {
  it('reads the library name and version from a maven purl', () => {
    expect(parseLibrary('pkg:maven/com.google.guava/guava@32.0.1-jre')).toEqual({
      name: 'guava',
      version: '32.0.1-jre',
    });
  });

  it('returns the CVE alias, if any', () => {
    expect(getCve(vuln())).toBe('CVE-2026-1');
    expect(getCve(vuln({ aliases: ['GHSA-x'] }))).toBeUndefined();
  });
});

describe('fetchVulnerabilityReport', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('calls the sbom/vulnerabilities endpoint and parses the report', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scannedDate: '2026-11-06T04:41:32.923Z',
        summary: { total: 1 },
        vulnerabilities: [{ id: 'GHSA-aaaa', severity: 'HIGH', introducedVia: ['a 1', 'b 2'] }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const report = await fetchVulnerabilityReport('ballerinax', 'kafka', '4.6.7');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.central.ballerina.io/2.0/registry/packages/ballerinax/kafka/4.6.7/sbom/vulnerabilities'
    );
    expect(report?.vulnerabilities).toHaveLength(1);
    expect(report?.vulnerabilities[0].severity).toBe('high');
  });

  it('only keeps http(s) links and falls back to the OSV page otherwise', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scannedDate: '2026-11-06T04:41:32.923Z',
        vulnerabilities: [
          { id: 'GHSA-ok', url: 'https://github.com/advisories/GHSA-ok' },
          { id: 'GHSA-js', url: 'javascript:alert(1)' },
          { id: 'GHSA-data', url: 'data:text/html,hello' },
          { id: 'GHSA-none' },
        ],
      }),
    }) as unknown as typeof fetch;

    const report = await fetchVulnerabilityReport('ballerinax', 'link-test', '1.0.0');

    expect(report?.vulnerabilities.map((v) => v.url)).toEqual([
      'https://github.com/advisories/GHSA-ok',
      'https://osv.dev/vulnerability/GHSA-js',
      'https://osv.dev/vulnerability/GHSA-data',
      'https://osv.dev/vulnerability/GHSA-none',
    ]);
  });

  it('encodes the package parts so they cannot change the request path', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchVulnerabilityReport('ballerinax', 'a/../b', '1.0.0');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.central.ballerina.io/2.0/registry/packages/ballerinax/a%2F..%2Fb/1.0.0/sbom/vulnerabilities'
    );
  });

  it('shares one request per package version', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ scannedDate: '2026-11-06T04:41:32.923Z', vulnerabilities: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await Promise.all([
      fetchVulnerabilityReport('ballerinax', 'cache-test', '1.0.0'),
      fetchVulnerabilityReport('ballerinax', 'cache-test', '1.0.0'),
    ]);
    await fetchVulnerabilityReport('ballerinax', 'cache-test', '1.0.0');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null on a non-OK response', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
    await expect(fetchVulnerabilityReport('ballerinax', 'kafka', '1.0.0')).resolves.toBeNull();
  });

  it('returns null when the request fails or the payload is malformed', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    await expect(fetchVulnerabilityReport('ballerinax', 'kafka', '1.0.0')).resolves.toBeNull();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ nope: true }),
    }) as unknown as typeof fetch;
    await expect(fetchVulnerabilityReport('ballerinax', 'kafka', '1.0.0')).resolves.toBeNull();
  });
});

describe('findLatestPatch', () => {
  it('returns the newest stable release of the same minor line', () => {
    const versions = ['2.9.2', '2.9.4', '2.9.3', '2.9.5-beta.1', '2.10.0', '3.0.0', '2.8.9'];
    expect(findLatestPatch('2.9.2', versions)).toBe('2.9.4');
  });

  it('returns undefined when the current version is already the latest patch', () => {
    expect(findLatestPatch('4.6.2', ['4.6.2', '4.6.1', '4.7.0'])).toBeUndefined();
  });
});

describe('formatCheckedAgo', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  it('formats whole days', () => {
    expect(formatCheckedAgo('2026-10-28T07:15:50Z', now)).toBe('9 days ago');
    expect(formatCheckedAgo('2026-11-05T07:00:00Z', now)).toBe('1 day ago');
    expect(formatCheckedAgo('2026-11-06T04:00:00Z', now)).toBe('today');
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatCheckedAgo('nonsense', now)).toBe('');
  });
});

describe('groupByDependency', () => {
  const via = (dep: string) => ['kafka 4.6.2', dep, 'lib 1.0'];
  it('groups by the dependency that introduced the vulnerability and attaches its org', () => {
    const groups = groupByDependency(
      [
        vuln({ id: 'a', introducedVia: via('crypto 2.9.2') }),
        vuln({ id: 'b', introducedVia: via('avro 1.2.0') }),
        vuln({ id: 'c', introducedVia: via('crypto 2.9.2') }),
      ],
      new Map([['crypto 2.9.2', 'ballerina']])
    );
    expect(groups.map((g) => g.key)).toEqual(['crypto 2.9.2', 'avro 1.2.0']);
    expect(groups[0]).toMatchObject({ org: 'ballerina', name: 'crypto', version: '2.9.2' });
    expect(groups[0].vulnerabilities.map((v) => v.id)).toEqual(['a', 'c']);
    expect(groups[1].org).toBeUndefined();
  });
});

describe('countFixedByPatch', () => {
  it('counts vulnerabilities that the newer patch no longer lists', () => {
    const vulns = [vuln({ id: 'a' }), vuln({ id: 'b' })];
    expect(countFixedByPatch(vulns, { known: true, latestPatch: '1.0.1', patchIds: ['b'] })).toBe(
      1
    );
    expect(countFixedByPatch(vulns, { known: true, latestPatch: '1.0.1', patchIds: null })).toBe(0);
    expect(countFixedByPatch(vulns, undefined)).toBe(0);
  });
});

describe('fetchSbomOrgs', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('maps "<name> <version>" to the publishing org for Ballerina components only', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        components: [
          { purl: 'pkg:ballerina/ballerina/crypto@2.9.2' },
          { purl: 'pkg:ballerina/ballerinax/confluent.cregistry@0.4.2' },
          { purl: 'pkg:maven/com.google.guava/guava@32.0.1-jre' },
        ],
      }),
    }) as unknown as typeof fetch;

    const orgs = await fetchSbomOrgs('ballerinax', 'kafka', '4.6.2');

    expect(orgs.get('crypto 2.9.2')).toBe('ballerina');
    expect(orgs.get('confluent.cregistry 0.4.2')).toBe('ballerinax');
    expect(orgs.size).toBe(2);
  });

  it('returns an empty map when the SBOM is unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    expect((await fetchSbomOrgs('ballerinax', 'kafka', '4.6.2')).size).toBe(0);
  });
});
