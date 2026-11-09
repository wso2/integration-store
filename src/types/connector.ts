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

export interface BallerinaPackage {
  name: string;
  organization?: string;
  version: string;
  URL: string;
  summary: string;
  keywords: string[];
  icon: string;
  createdDate: string;
  totalPullCount?: number;
}

export interface ConnectorMetadata {
  area: string[];
  vendor: string;
  type: string[];
}

export interface FilterOptions {
  areas: string[];
  vendors: string[];
  types: string[];
}

export interface ConnectorFilters {
  selectedAreas: string[];
  selectedVendors: string[];
  selectedTypes: string[];
  searchQuery: string;
}

export interface PackageModule {
  name: string;
  readme: string;
  apiDocURL: string;
  packageURL: string;
}

export interface PackageDetails {
  id: string;
  organization: string;
  name: string;
  version: string;
  platform: string;
  languageSpecificationVersion: string;
  isDeprecated: boolean;
  summary: string;
  readme: string;
  modules: PackageModule[];
  URL: string;
  balaURL: string;
  sourceCodeLocation: string;
  icon: string;
  pullCount: number;
  totalPullCount?: number;
  versions?: string[];
  authors: string[];
  licenses: string[];
  keywords: string[];
  createdDate: string;
}

export type VulnerabilitySeverity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

/** One finding from Ballerina Central's `/sbom/vulnerabilities` report (data comes from OSV.dev). */
export interface Vulnerability {
  id: string;
  aliases: string[];
  severity: VulnerabilitySeverity;
  summary: string;
  /** Package URL of the affected library, e.g. `pkg:maven/com.google.guava/guava@32.0.1-jre`. */
  purl: string;
  fixedIn: string[];
  /** Dependency chain, package first. Two entries means a direct dependency; more means indirect. */
  introducedVia: string[];
  url: string;
}

export interface VulnerabilityReport {
  scannedDate: string;
  vulnerabilities: Vulnerability[];
}
