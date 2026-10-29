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
 * MI connectors that have no Ballerina counterpart. They get their own detail page at
 * /connector/wso2-mi/{id} and appear on the home page next to the Ballerina connectors.
 *
 * A connector can have several MI components (a connector and its inbound endpoint); `id`
 * is the first one and is what the URL uses, any component id also resolves to it.
 * The summaries are for the cards. The detail page shows the live description from the
 * WSO2 Store API.
 */
export const MI_ONLY_ORG = 'wso2-mi';

export interface MIOnlyConnector {
  /** Id of the first component; used in the URL. */
  id: string;
  /** Display name. */
  name: string;
  /** Short description for the connector card. */
  summary: string;
  /** All MI component ids, in display order. */
  componentIds: readonly string[];
}

export const MI_ONLY_CONNECTORS: readonly MIOnlyConnector[] = [
  {
    id: 'esb-connector-pcml',
    name: 'AS400 PCML',
    summary: 'Call RPG programs on AS400 (IBM iSeries) servers using Program Call Markup Language.',
    componentIds: ['esb-connector-pcml'],
  },
  {
    id: 'mi-inbound-cdc',
    name: 'CDC (Inbound)',
    summary:
      'Listen to changes in external databases with Change Data Capture, powered by Debezium.',
    componentIds: ['mi-inbound-cdc'],
  },
  {
    id: 'esb-connector-creatio',
    name: 'Creatio',
    summary: 'Work with Creatio CRM entities and functionality through its REST interface.',
    componentIds: ['esb-connector-creatio'],
  },
  {
    id: 'esb-connector-googleads',
    name: 'Google Ads',
    summary: 'Access the Google Ads API to create, update and delete ad campaigns and ads.',
    componentIds: ['esb-connector-googleads'],
  },
  {
    id: 'mi-connector-googlefirebase',
    name: 'Google Firebase',
    summary: 'Send messages and manage topic subscriptions with Firebase Cloud Messaging.',
    componentIds: ['mi-connector-googlefirebase'],
  },
  {
    id: 'esb-connector-iso8583',
    name: 'ISO8583',
    summary: 'Send and receive ISO8583 financial transaction messages.',
    componentIds: ['esb-connector-iso8583', 'esb-inbound-iso8583'],
  },
  {
    id: 'mi-connector-idp',
    name: 'Intelligent Document Processing',
    summary: 'Extract structured data from unstructured documents.',
    componentIds: ['mi-connector-idp'],
  },
  {
    id: 'mi-connector-pulsar',
    name: 'Pulsar',
    summary: 'Publish messages to, and consume messages from, Apache Pulsar topics.',
    componentIds: ['mi-connector-pulsar', 'mi-inbound-pulsar'],
  },
  {
    id: 'mediation-utility-module',
    name: 'Utility',
    summary: 'String, date, math and signature utility functions for mediation flows.',
    componentIds: ['mediation-utility-module'],
  },
];

/** The MI-only connector with this id, or one that has a component with this id. */
export function findMIOnlyConnector(id: string | undefined): MIOnlyConnector | undefined {
  if (!id) return undefined;
  return MI_ONLY_CONNECTORS.find((c) => c.id === id || c.componentIds.includes(id));
}

/** Detail page path of an MI-only connector. */
export function miOnlyDetailPath(connector: MIOnlyConnector): string {
  return `/connector/${MI_ONLY_ORG}/${encodeURIComponent(connector.id)}`;
}
