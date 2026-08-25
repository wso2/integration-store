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

/**
 * MI Integration Store API
 */
const MI_CONNECTOR_API_BASE =
  'https://apis.wso2.com/qgpf/connector-store-backend/endpoint-9090-803/v1.0';

interface MIConnector {
  id: string;
  name: string;
}

interface MIConnectorDetails {
  id: string;
  name: string;
  documentationUrl?: string;
}

/**
 * Search for a matching MI connector by name
 * @param connectorName - The connector name to search for (e.g., "snowflake")
 * @returns The matching MI connector details with documentation URL, or null if not found
 */
export async function fetchMIConnector(connectorName: string): Promise<MIConnectorDetails | null> {
  try {
    // Step 1: Fetch all connector names
    const namesResponse = await fetch(`${MI_CONNECTOR_API_BASE}/connectors/names`);
    if (!namesResponse.ok) {
      console.warn('Failed to fetch MI connector names:', namesResponse.status);
      return null;
    }

    const connectors: MIConnector[] = await namesResponse.json();

    // Step 2: Search for matching connector with two-step lookup
    // First try exact match (trimmed, case-insensitive)
    const trimmedSearchName = connectorName.trim().toLowerCase();

    // Return early if search name is empty
    if (!trimmedSearchName) {
      return null;
    }

    let matchingConnector = connectors.find(
      (c) => c.name.trim().toLowerCase() === trimmedSearchName
    );

    // Fall back to id suffix match if exact name match fails
    if (!matchingConnector) {
      matchingConnector = connectors.find((c) =>
        c.id.toLowerCase().endsWith(`-${trimmedSearchName}`)
      );
    }

    // Last resort: broad substring search
    if (!matchingConnector) {
      matchingConnector = connectors.find((c) => c.name.toLowerCase().includes(trimmedSearchName));
    }

    if (!matchingConnector) {
      return null;
    }

    // Step 3: Fetch full connector details to get documentation URL
    const detailsResponse = await fetch(
      `${MI_CONNECTOR_API_BASE}/connectors/${encodeURIComponent(matchingConnector.id)}`
    );
    if (!detailsResponse.ok) {
      console.warn('Failed to fetch MI connector details:', detailsResponse.status);
      return null;
    }

    const details: MIConnectorDetails = await detailsResponse.json();
    return details;
  } catch (error) {
    console.error('Error fetching MI connector:', error);
    return null;
  }
}
