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
import { getMIComponentIds } from './mi-mapping';

export { MI_MAPPING, getMIComponentIds } from './mi-mapping';
export { MI_ONLY_ORG, MI_ONLY_CONNECTORS, findMIOnlyConnector, miOnlyDetailPath } from './mi-only';
export type { MIOnlyConnector } from './mi-only';
export { fetchMILogo, useMILogo } from './mi-logo';

/**
 * MI Integration Store API
 */
const MI_CONNECTOR_API_BASE =
  'https://apis.wso2.com/qgpf/connector-store-backend/endpoint-9090-803/v1.0';

/**
 * documentationUrl values that are not a connector-specific page: the MI docs
 * home (host mi.docs.wso2.com with at most an /en/<version> path, e.g.
 * /en/4.4.0 or /en/latest), the Identity Server outbound-auth repos and the retired
 * docs.wso2.com Confluence pages.
 */
const MI_DOCS_HOST = 'mi.docs.wso2.com';
const MI_DOCS_HOME_PATH = /^(\/en(\/[^/]+)?)?$/;
const IGNORED_DOC_URL_PATTERNS = [
  /wso2-extensions\/identity-outbound-auth-/i,
  // Retired Confluence docs: these links now land on a generic spaces page.
  /^https?:\/\/docs\.wso2\.com\/display\//i,
];

/** True if the URL is the MI docs home (any version); query, hash and trailing slashes are ignored. */
function isMiDocsHome(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return (
      parsed.hostname.toLowerCase() === MI_DOCS_HOST &&
      MI_DOCS_HOME_PATH.test(parsed.pathname.replace(/\/+$/, '').toLowerCase())
    );
  } catch {
    return false;
  }
}

/** Returns the URL, or undefined if it is the MI docs home, an identity-outbound-auth repo or a retired docs page. */
export function usableDocumentationUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  if (isMiDocsHome(url)) return undefined;
  if (IGNORED_DOC_URL_PATTERNS.some((pattern) => pattern.test(url))) return undefined;
  return url;
}

export interface MIAsset {
  name: string;
  downloadUrl: string;
}

export interface MIRelease {
  tagName: string;
  releaseUrl?: string;
  /** Supported MI versions, e.g. "MI 4.7.0" */
  products: string[];
  assets: MIAsset[];
}

export interface MIComponent {
  id: string;
  name: string;
  description?: string;
  license?: string;
  licenseUrl?: string;
  labels: string[];
  repoUrl?: string;
  documentationUrl?: string;
  /** Newest first */
  releases: MIRelease[];
}

interface MIConnectorDetailsResponse {
  repoName?: string;
  repoUrl?: string;
  connectorName?: string;
  description?: string;
  documentationUrl?: string;
  license?: string;
  licenseUrl?: string;
  labels?: string[];
}

interface MIReleaseResponse {
  tagName?: string;
  name?: string;
  releaseUrl?: string;
  products?: string[];
  assets?: { name?: string; downloadUrl?: string }[];
}

/** Compare release tags such as "v3.3.11" newest first. Unparseable tags sort last. */
export function compareReleasesDesc(a: { tagName: string }, b: { tagName: string }): number {
  const va = semver.coerce(a.tagName);
  const vb = semver.coerce(b.tagName);
  if (va && vb) return semver.rcompare(va, vb);
  if (va) return -1;
  if (vb) return 1;
  return b.tagName.localeCompare(a.tagName);
}

/** Parse "MI 4.7.0" into a semver version, or null when it cannot be read. */
function parseMIVersion(product: string): semver.SemVer | null {
  return semver.coerce(product);
}

/**
 * Supported MI versions, newest first, de-duplicated. Only products named "MI ..." count (releases
 * of older ESB products list e.g. "ESB 5.0.0"); entries without a version are dropped.
 */
export function sortMIVersions(products: readonly string[]): string[] {
  const unique = Array.from(
    new Set(
      products
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => /^MI\s/i.test(p))
    )
  );
  return unique
    .map((p) => ({ label: p, version: parseMIVersion(p) }))
    .filter((p): p is { label: string; version: semver.SemVer } => p.version !== null)
    .sort((a, b) => semver.rcompare(a.version, b.version))
    .map((p) => p.label);
}

/** True when the versions share a major and cover every minor between the lowest and highest. */
function isContiguousRange(versions: semver.SemVer[]): boolean {
  if (versions.length < 3) return false;
  const major = versions[0].major;
  if (versions.some((v) => v.major !== major || v.patch !== 0)) return false;
  const minors = versions.map((v) => v.minor);
  return Math.max(...minors) - Math.min(...minors) + 1 === versions.length;
}

/**
 * Compact label for a release's supported MI versions: "MI 4.7.0 … MI 4.0.0" when the
 * versions form an unbroken range, otherwise the full comma separated list.
 */
export function formatMIVersionRange(products: readonly string[]): string {
  const sorted = sortMIVersions(products);
  if (sorted.length === 0) return '';
  const parsed = sorted.map((p) => parseMIVersion(p) as semver.SemVer);
  if (isContiguousRange(parsed)) {
    return `${sorted[0]} … ${sorted[sorted.length - 1]}`;
  }
  return sorted.join(', ');
}

/** Download label from the file extension, e.g. "zip" or "jar". */
export function getAssetLabel(assetName: string): string {
  const match = assetName.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : 'file';
}

/** The component with this id, or the first component when the id is missing or unknown. */
export function selectMIComponent(
  components: readonly MIComponent[],
  componentId: string | null | undefined
): MIComponent | undefined {
  return components.find((c) => c.id === componentId) ?? components[0];
}

/** A request that takes longer than this counts as failed, so loading states always end. */
const MI_REQUEST_TIMEOUT_MS = 10_000;

/** Throws when the request fails, times out or returns an error status. */
async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MI_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`MI connector request failed: ${response.status} ${url}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function loadMIComponent(id: string): Promise<MIComponent | null> {
  const encodedId = encodeURIComponent(id);
  const [details, releases] = await Promise.all([
    fetchJson<MIConnectorDetailsResponse>(`${MI_CONNECTOR_API_BASE}/connectors/${encodedId}`),
    fetchJson<MIReleaseResponse[]>(`${MI_CONNECTOR_API_BASE}/connectors/${encodedId}/releases`),
  ]);

  // Only releases that support an MI version count; without one the component is not an MI profile.
  const mappedReleases: MIRelease[] = (Array.isArray(releases) ? releases : [])
    .filter((r): r is MIReleaseResponse & { tagName: string } => Boolean(r.tagName))
    .filter((r) => sortMIVersions(r.products ?? []).length > 0)
    .map((r) => ({
      tagName: r.tagName,
      releaseUrl: r.releaseUrl,
      products: r.products ?? [],
      assets: (r.assets ?? [])
        .filter((a): a is { name: string; downloadUrl: string } => Boolean(a.name && a.downloadUrl))
        .map((a) => ({ name: a.name, downloadUrl: a.downloadUrl })),
    }))
    .sort(compareReleasesDesc);
  if (mappedReleases.length === 0) return null;

  return {
    id,
    name: details.connectorName || id,
    description: details.description,
    license: details.license,
    licenseUrl: details.licenseUrl,
    labels: details.labels ?? [],
    repoUrl: details.repoUrl,
    documentationUrl: usableDocumentationUrl(details.documentationUrl) || undefined,
    releases: mappedReleases,
  };
}

const componentCache = new Map<string, Promise<MIComponent | null>>();
/** Ids whose last load failed (request error or timeout), as opposed to having no MI release. */
const failedLoads = new Set<string>();

/** True when the last load of any of these components failed instead of finding no MI release. */
export function didMILoadFail(ids: readonly string[]): boolean {
  return ids.some((id) => failedLoads.has(id));
}

function loadMIComponentCached(id: string): Promise<MIComponent | null> {
  let pending = componentCache.get(id);
  if (!pending) {
    pending = loadMIComponent(id)
      .then((component) => {
        failedLoads.delete(id);
        return component;
      })
      .catch((error) => {
        console.error('Error fetching MI component:', id, error);
        failedLoads.add(id);
        return null;
      });
    componentCache.set(id, pending);
    // Do not keep failures, so the next visit retries.
    pending.then((result) => {
      if (result === null) componentCache.delete(id);
    });
  }
  return pending;
}

/**
 * MI components with these ids, in the same order. Components that fail to load are skipped.
 */
export async function fetchMIComponentsByIds(ids: readonly string[]): Promise<MIComponent[]> {
  const components = await Promise.all(ids.map(loadMIComponentCached));
  return components.filter((c): c is MIComponent => c !== null);
}

/**
 * MI components for a Ballerina package, in the order of the curated mapping.
 * Returns an empty array when the package has no MI counterpart.
 */
export async function fetchMIComponents(org: string, name: string): Promise<MIComponent[]> {
  const ids = getMIComponentIds(org, name);
  return ids.length === 0 ? [] : fetchMIComponentsByIds(ids);
}
