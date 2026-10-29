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

import { MI_ONLY_CONNECTORS, findMIOnlyConnector, miOnlyDetailPath } from './mi-only';
import { MI_MAPPING } from './mi-mapping';

describe('MI-only connectors', () => {
  it('covers the 11 MI artifacts without a Ballerina connector, as 9 connectors', () => {
    const components = MI_ONLY_CONNECTORS.flatMap((c) => c.componentIds);
    expect(components).toHaveLength(11);
    expect(new Set(components).size).toBe(11);
    expect(MI_ONLY_CONNECTORS).toHaveLength(9);
  });

  it('leaves out the SalesforceLeadsToSpreadsheet sample integration', () => {
    expect(findMIOnlyConnector('esb-connector-integrationbase')).toBeUndefined();
  });

  it('never repeats a component that a Ballerina connector already has', () => {
    const mapped = new Set(Object.values(MI_MAPPING).flat());
    MI_ONLY_CONNECTORS.flatMap((c) => c.componentIds).forEach((id) => {
      expect(mapped.has(id)).toBe(false);
    });
  });

  it('uses the first component as the id, and has a name and summary for every connector', () => {
    MI_ONLY_CONNECTORS.forEach((c) => {
      expect(c.id).toBe(c.componentIds[0]);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.summary.length).toBeGreaterThan(0);
    });
  });

  it('finds a connector by its id or by any of its components', () => {
    expect(findMIOnlyConnector('mi-connector-pulsar')?.name).toBe('Pulsar');
    expect(findMIOnlyConnector('mi-inbound-pulsar')?.name).toBe('Pulsar');
    expect(findMIOnlyConnector('esb-inbound-iso8583')?.name).toBe('ISO8583');
    expect(findMIOnlyConnector('esb-connector-kafka')).toBeUndefined();
    expect(findMIOnlyConnector(undefined)).toBeUndefined();
  });

  it('builds the detail path under /connector/wso2-mi/', () => {
    const pulsar = findMIOnlyConnector('mi-connector-pulsar')!;
    expect(miOnlyDetailPath(pulsar)).toBe('/connector/wso2-mi/mi-connector-pulsar');
  });
});
