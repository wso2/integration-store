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

import type { BallerinaPackage } from '@/types/connector';
import { getCatalogMatches, searchPackages } from '@/lib/rest-client';
import type { SearchParams, SearchResponse } from '@/lib/rest-client';
import { getDisplayName, parseConnectorMetadata } from '@/lib/connector-utils';
import { getMIComponentIds } from './mi-mapping';
import { MI_ONLY_CONNECTORS, MI_ONLY_ORG, miOnlyDetailPath } from './mi-only';
import type { MIOnlyConnector } from './mi-only';

/** Profile filter of the home page. */
export type ProfileFilter = 'default' | 'mi';

/** The search response with MI-only entries among the packages. */
export interface ProfileSearchResponse extends Omit<SearchResponse, 'packages'> {
  packages: ListedConnector[];
}

/** A home page card: a Ballerina package, or an MI-only connector (then `miOnly` is set). */
export type ListedConnector = BallerinaPackage & { miOnly?: MIOnlyConnector };

// Larger than the catalog; asks the search for every match instead of one page.
const ALL = 100000;

const PROFILES: readonly ProfileFilter[] = ['default', 'mi'];

/** Selected profiles from the URL (comma separated). Unknown values are dropped. */
export function parseProfiles(value: string | null): ProfileFilter[] {
  if (!value) return [];
  const found = value.split(',').filter((v): v is ProfileFilter => PROFILES.includes(v as never));
  return PROFILES.filter((p) => found.includes(p));
}

/**
 * The one profile that restricts the list, or null when everything is shown: nothing
 * selected and both selected mean the same.
 */
export function activeProfile(selected: readonly ProfileFilter[]): ProfileFilter | null {
  return selected.length === 1 ? selected[0] : null;
}

/** Value of the ?profile= URL parameter, or undefined when it should be left out. */
export function profileParam(selected: readonly ProfileFilter[]): string | undefined {
  return activeProfile(selected) ?? undefined;
}

/** "org/name" of a package, from its Central URL. */
function packageIdentity(pkg: BallerinaPackage): { org: string; name: string } | null {
  const parts = (pkg.URL ?? '')
    .replace(/^packages\//, '')
    .replace(/^\//, '')
    .split('/');
  if (parts[0] && parts[1]) return { org: parts[0], name: parts[1] };
  if (pkg.organization && pkg.name) return { org: pkg.organization, name: pkg.name };
  return null;
}

/** True if the Ballerina package also has an MI profile. */
export function hasMIProfile(pkg: BallerinaPackage): boolean {
  const identity = packageIdentity(pkg);
  return identity ? getMIComponentIds(identity.org, identity.name).length > 0 : false;
}

/** The card for an MI-only connector. It has no version, downloads or date. */
function toListed(connector: MIOnlyConnector): ListedConnector {
  return {
    name: connector.id,
    organization: MI_ONLY_ORG,
    version: '',
    URL: miOnlyDetailPath(connector),
    summary: connector.summary,
    keywords: [],
    icon: '',
    createdDate: '',
    miOnly: connector,
  };
}

/** MI-only connectors whose name or description contains every word of the query. */
function matchMIOnly(query: string | undefined): ListedConnector[] {
  const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return MI_ONLY_CONNECTORS.filter((c) => {
    const text = `${c.name} ${c.summary}`.toLowerCase();
    return words.every((w) => text.includes(w));
  })
    .map(toListed)
    .sort((a, b) => a.miOnly!.name.localeCompare(b.miOnly!.name));
}

const hasKeywordFilters = (params: Pick<SearchParams, 'areas' | 'vendors' | 'types'>) =>
  !!(params.areas?.length || params.vendors?.length || params.types?.length);

/** MI-only connectors have no Ballerina keywords, so any Area, Vendor or Type filter hides them. */
function miOnlyFor(params: SearchParams, profile: ProfileFilter | null): ListedConnector[] {
  if (profile === 'default' || hasKeywordFilters(params)) return [];
  return matchMIOnly(params.query);
}

const displayNameOf = (item: ListedConnector): string =>
  item.miOnly
    ? item.miOnly.name
    : getDisplayName(item.name, parseConnectorMetadata(item.keywords).vendor, item.keywords);

/**
 * Search the connector list with the Profile filter applied.
 *
 * - WSO2 Integrator: the Ballerina search, unchanged.
 * - WSO2 Integrator: MI: Ballerina packages that have an MI profile, plus the MI-only connectors.
 * - Nothing selected (or both): the Ballerina search plus the MI-only connectors.
 *
 * MI-only connectors have no downloads or dates, so every sort except the name sorts lists
 * them after the Ballerina connectors; the name sorts place them by name.
 */
export async function searchWithProfile(
  params: SearchParams,
  profile: ProfileFilter | null
): Promise<ProfileSearchResponse> {
  const miOnly = miOnlyFor(params, profile);
  const byName = params.sort === 'name-asc' || params.sort === 'name-desc';

  // Nothing to add or filter: the plain search.
  if (profile !== 'mi' && miOnly.length === 0) return searchPackages(params);

  const end = params.offset + params.limit;

  if (profile === null && !byName) {
    // The Ballerina order is untouched, so ask for the page and fill what is left with MI-only.
    const page = await searchPackages(params);
    const room = Math.max(0, params.limit - page.packages.length);
    const start = Math.max(0, params.offset - page.count);
    return {
      ...page,
      packages: [...page.packages, ...miOnly.slice(start, start + room)],
      count: page.count + miOnly.length,
    };
  }

  const all = await searchPackages({ ...params, offset: 0, limit: ALL });
  const ballerina: ListedConnector[] =
    profile === 'mi' ? all.packages.filter(hasMIProfile) : all.packages;
  let merged: ListedConnector[];
  if (byName) {
    const direction = params.sort === 'name-asc' ? 1 : -1;
    merged = [...ballerina, ...miOnly].sort(
      (a, b) => direction * displayNameOf(a).localeCompare(displayNameOf(b))
    );
  } else {
    merged = [...ballerina, ...miOnly];
  }
  return {
    packages: merged.slice(params.offset, end),
    count: merged.length,
    offset: params.offset,
    limit: params.limit,
  };
}

export interface ProfileCounts {
  /** Connectors in the WSO2 Integrator (Ballerina) profile. */
  default: number;
  /** Connectors with an MI profile: Ballerina packages that have one, plus MI-only connectors. */
  mi: number;
}

/**
 * How many connectors each Profile option would show with the current search and filters.
 * Counted over the in-memory catalogue, so it makes no Central request; resolves null while
 * there is no catalogue, and the counts are then left out.
 */
export async function getProfileCounts(
  params: Pick<SearchParams, 'query' | 'areas' | 'vendors' | 'types' | 'orgName'>
): Promise<ProfileCounts | null> {
  const matches = await getCatalogMatches(params);
  if (!matches) return null;
  const miOnly = hasKeywordFilters(params) ? 0 : matchMIOnly(params.query).length;
  return { default: matches.length, mi: matches.filter(hasMIProfile).length + miOnly };
}
