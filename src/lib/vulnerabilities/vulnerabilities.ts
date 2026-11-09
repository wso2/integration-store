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

import semver from 'semver';
import { Vulnerability, VulnerabilityReport, VulnerabilitySeverity } from '@/types/connector';

const PACKAGES_ENDPOINT = 'https://api.central.ballerina.io/2.0/registry/packages';
const FETCH_TIMEOUT_MS = 10000;

export const SEVERITY_ORDER: VulnerabilitySeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'unknown',
];

export type SeverityCounts = Record<VulnerabilitySeverity, number> & { total: number };

function normalizeSeverity(value: unknown): VulnerabilitySeverity {
  const lower = typeof value === 'string' ? value.toLowerCase() : '';
  return (SEVERITY_ORDER as string[]).includes(lower)
    ? (lower as VulnerabilitySeverity)
    : 'unknown';
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Defensive parse: Central owns this payload, so anything malformed is dropped, not thrown. */
function parseReport(data: unknown): VulnerabilityReport | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as { scannedDate?: unknown; vulnerabilities?: unknown };
  if (!Array.isArray(raw.vulnerabilities)) return null;

  const vulnerabilities: Vulnerability[] = [];
  for (const item of raw.vulnerabilities) {
    if (!item || typeof item !== 'object') continue;
    const v = item as Record<string, unknown>;
    if (typeof v.id !== 'string' || !v.id) continue;
    vulnerabilities.push({
      id: v.id,
      aliases: toStringArray(v.aliases),
      severity: normalizeSeverity(v.severity),
      summary: typeof v.summary === 'string' ? v.summary : v.id,
      purl: typeof v.purl === 'string' ? v.purl : '',
      fixedIn: toStringArray(v.fixedIn),
      introducedVia: toStringArray(v.introducedVia),
      url: typeof v.url === 'string' ? v.url : `https://osv.dev/vulnerability/${v.id}`,
    });
  }

  return {
    scannedDate: typeof raw.scannedDate === 'string' ? raw.scannedDate : '',
    vulnerabilities,
  };
}

/**
 * Fetches the vulnerability report for one package version from Ballerina Central.
 * Returns null whenever there is nothing to show (no report yet, 404, timeout, bad payload):
 * this is supplementary info, so it must never break or block the package page.
 */
async function requestVulnerabilityReport(
  org: string,
  name: string,
  version: string
): Promise<VulnerabilityReport | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${PACKAGES_ENDPOINT}/${encodeURIComponent(org)}/${encodeURIComponent(name)}/${encodeURIComponent(
        version
      )}/sbom/vulnerabilities`,
      { signal: controller.signal }
    );
    if (!response.ok) return null;
    return parseReport(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Central's rule: the chain is `[package, library]` for a direct dependency, longer otherwise. */
// Reports are cached per package version (the in-flight promise is shared), so a prefetch from the
// page and the Security section's own request only hit Central once. Failures are not cached.
const reportCache = new Map<string, Promise<VulnerabilityReport | null>>();

export function fetchVulnerabilityReport(
  org: string,
  name: string,
  version: string
): Promise<VulnerabilityReport | null> {
  const key = `${org}/${name}/${version}`;
  const cached = reportCache.get(key);
  if (cached) return cached;
  const request = requestVulnerabilityReport(org, name, version).then((report) => {
    if (!report) reportCache.delete(key);
    return report;
  });
  reportCache.set(key, request);
  return request;
}

/** Starts loading a report early so it is ready by the time the Security section renders. */
export function prefetchVulnerabilityReport(org: string, name: string, version: string): void {
  void fetchVulnerabilityReport(org, name, version);
}

export function isDirectVulnerability(v: Vulnerability): boolean {
  return v.introducedVia.length <= 2;
}

export function countBySeverity(vulnerabilities: Vulnerability[]): SeverityCounts {
  const counts: SeverityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
    total: vulnerabilities.length,
  };
  vulnerabilities.forEach((v) => {
    counts[v.severity] += 1;
  });
  return counts;
}

/** Most severe first; ties keep the report's own order. */
export function sortBySeverity(vulnerabilities: Vulnerability[]): Vulnerability[] {
  return [...vulnerabilities].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );
}

export function splitVulnerabilities(report: VulnerabilityReport): {
  direct: Vulnerability[];
  indirect: Vulnerability[];
} {
  const sorted = sortBySeverity(report.vulnerabilities);
  return {
    direct: sorted.filter(isDirectVulnerability),
    indirect: sorted.filter((v) => !isDirectVulnerability(v)),
  };
}

/** `pkg:maven/com.google.guava/guava@32.0.1-jre` → `{ name: 'guava', version: '32.0.1-jre' }`. */
export function parseLibrary(purl: string): { name: string; version: string } {
  const [path, version = ''] = purl
    .replace(/^pkg:[^/]+\//, '')
    .split(/[?#]/)[0]
    .split('@');
  return { name: path.substring(path.lastIndexOf('/') + 1), version };
}

export function getCve(v: Vulnerability): string | undefined {
  return v.aliases.find((alias) => alias.startsWith('CVE-'));
}

/** "N days ago" for the scan timestamp, e.g. `Checked 9 days ago via OSV.dev`. */
export function formatCheckedAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const days = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000));
  if (days === 0) return 'today';
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Maps `"<name> <version>"` (the format used in `introducedVia`) to the Ballerina org that
 * publishes it, read from the package's CycloneDX SBOM. Libraries that aren't Ballerina
 * packages (Maven jars) have no entry. Returns an empty map when the SBOM can't be read.
 */
export async function fetchSbomOrgs(
  org: string,
  name: string,
  version: string
): Promise<Map<string, string>> {
  const orgs = new Map<string, string>();
  const data = (await fetchJson(
    `${PACKAGES_ENDPOINT}/${encodeURIComponent(org)}/${encodeURIComponent(name)}/${encodeURIComponent(
      version
    )}/sbom`
  )) as { components?: Array<{ purl?: unknown }> } | null;
  if (!data || !Array.isArray(data.components)) return orgs;

  for (const component of data.components) {
    const match =
      typeof component.purl === 'string' &&
      component.purl.match(/^pkg:ballerina\/([^/]+)\/([^@]+)@(.+)$/);
    if (match) orgs.set(`${match[2]} ${match[3]}`, match[1]);
  }
  return orgs;
}

/** Newest stable release in the same major.minor line that is newer than `current`. */
export function findLatestPatch(current: string, versions: string[]): string | undefined {
  const cur = semver.parse(current);
  if (!cur) return undefined;
  let best: string | undefined;
  for (const candidate of versions) {
    const parsed = semver.parse(candidate);
    if (!parsed || parsed.prerelease.length > 0) continue;
    if (parsed.major !== cur.major || parsed.minor !== cur.minor || parsed.patch <= cur.patch) {
      continue;
    }
    if (!best || semver.gt(candidate, best)) best = candidate;
  }
  return best;
}

export interface PatchInfo {
  /** false when the version list couldn't be read, so nothing can be said about patches. */
  known: boolean;
  /** Newer patch of the same minor line, when one exists. */
  latestPatch?: string;
  /** Ids still reported on that patch; null when the patch hasn't been scanned. */
  patchIds: string[] | null;
}

async function fetchVersionList(org: string, name: string): Promise<string[] | null> {
  const data = await fetchJson(
    `${PACKAGES_ENDPOINT}/${encodeURIComponent(org)}/${encodeURIComponent(name)}`
  );
  const list = Array.isArray(data) ? data : (data as { versions?: unknown } | null)?.versions;
  return Array.isArray(list) && list.every((v) => typeof v === 'string')
    ? (list as string[])
    : null;
}

/**
 * Looks for a newer patch of `org/name@version` and, if there is one, which vulnerabilities
 * its own report still lists. Pass `knownVersions` when the caller already has them.
 */
export async function fetchPatchInfo(
  org: string,
  name: string,
  version: string,
  knownVersions?: string[]
): Promise<PatchInfo> {
  const versions = knownVersions ?? (await fetchVersionList(org, name));
  if (!versions) return { known: false, patchIds: null };

  const latestPatch = findLatestPatch(version, versions);
  if (!latestPatch) return { known: true, patchIds: null };

  const patchReport = await fetchVulnerabilityReport(org, name, latestPatch);
  return {
    known: true,
    latestPatch,
    patchIds: patchReport ? patchReport.vulnerabilities.map((v) => v.id) : null,
  };
}

/** How many of `vulnerabilities` no longer appear on the newer patch. */
export function countFixedByPatch(vulnerabilities: Vulnerability[], patch?: PatchInfo): number {
  const ids = patch?.patchIds;
  return ids ? vulnerabilities.filter((v) => !ids.includes(v.id)).length : 0;
}

export interface DependencyGroup {
  /** `"<name> <version>"`, as it appears in `introducedVia`. */
  key: string;
  org?: string;
  name: string;
  version: string;
  vulnerabilities: Vulnerability[];
}

/** Groups indirect vulnerabilities by the dependency of the package that pulled them in. */
export function groupByDependency(
  vulnerabilities: Vulnerability[],
  orgs: Map<string, string>
): DependencyGroup[] {
  const groups = new Map<string, DependencyGroup>();
  vulnerabilities.forEach((v) => {
    const key = v.introducedVia[1] ?? 'unknown';
    let group = groups.get(key);
    if (!group) {
      const split = key.lastIndexOf(' ');
      group = {
        key,
        org: orgs.get(key),
        name: split > 0 ? key.slice(0, split) : key,
        version: split > 0 ? key.slice(split + 1) : '',
        vulnerabilities: [],
      };
      groups.set(key, group);
    }
    group.vulnerabilities.push(v);
  });
  return [...groups.values()];
}
