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
 * Curated mapping from a Ballerina package ("org/name") to the WSO2 Micro Integrator (MI)
 * component ids that belong to it. The ids are the ids returned by the MI connector store
 * API (`/connectors/names`). The first id is the component selected by default.
 *
 * The mapping is explicit on purpose: guessing a match from the name linked unrelated
 * connectors (for example ballerinax/aws to an identity extension).
 *
 * Source: the connector mapping in wso2-enterprise/integration-product-management#1011.
 * A component can be shared by several packages (the three SharePoint packages share one).
 * MI components without a connector in the default profile are left out for now: AS400 PCML,
 * CDC (Inbound), Creatio, Google Ads, Google Firebase, ISO8583 and its inbound, Intelligent
 * Document Processing, Pulsar and its inbound, and Utility. The SalesforceLeadsToSpreadsheet
 * sample integration is not a connector and is left out entirely.
 */
export const MI_MAPPING: Readonly<Record<string, readonly string[]>> = {
  'ballerina/ai': ['mi-module-generative-ai'],
  'ballerina/crypto': ['mediation-cryptography-module'],
  'ballerina/data.csv': ['mediation-csv-module'],
  'ballerina/email': ['esb-connector-email'],
  'ballerina/file': ['esb-connector-file', 'mi-inbound-file'],
  'ballerina/http': ['mi-connector-http'],
  'ballerina/ldap': ['esb-connector-ldap'],
  'ballerina/mcp': ['mi-inbound-mcp'],
  'ballerina/smpp': ['esb-connector-smpp', 'esb-inbound-smpp'],
  'ballerinax/asb': ['mi-connector-asb', 'mi-inbound-asb'],
  'ballerinax/aws.dynamodb': ['esb-connector-amazondynamodb'],
  'ballerinax/aws.lambda': ['esb-connector-amazonlambda'],
  'ballerinax/aws.s3': ['esb-connector-amazons3'],
  'ballerinax/aws.sqs': ['esb-connector-amazonsqs', 'esb-inbound-amazonsqs'],
  'ballerinax/azure.datalake': ['mi-connector-msazuredatalakestorage'],
  'ballerinax/azure_storage_service': ['esb-connector-msazurestorage'],
  'ballerinax/dayforce': ['esb-connector-dayforce'],
  'ballerinax/facebook.ads': ['esb-connector-facebookads'],
  'ballerinax/gcloud.pubsub': ['mi-connector-googlepubsub', 'mi-inbound-googlepubsub'],
  'ballerinax/googleapis.bigquery': ['mi-connector-bigquery'],
  'ballerinax/googleapis.gmail': ['esb-connector-gmail'],
  'ballerinax/googleapis.sheets': ['esb-connector-googlespreadsheet'],
  'ballerinax/health.clients.fhir': ['esb-connector-fhirrepository', 'mediation-fhirbase-module'],
  'ballerinax/health.clients.fhir.epic': ['esb-connector-epic'],
  'ballerinax/health.clients.hl7': ['mediation-hl7v2tofhir-module'],
  'ballerinax/java.jdbc': ['mi-connector-db'],
  'ballerinax/jira': ['esb-connector-jira'],
  'ballerinax/kafka': ['esb-connector-kafka', 'esb-inbound-kafka'],
  'ballerinax/microsoft.sharepoint.lists': ['esb-connector-sharepoint'],
  'ballerinax/microsoft.sharepoint.pages': ['esb-connector-sharepoint'],
  'ballerinax/microsoft.sharepoint.sites': ['esb-connector-sharepoint'],
  'ballerinax/mongodb': ['esb-connector-mongodb'],
  'ballerinax/rabbitmq': ['mi-connector-rabbitmq', 'mi-inbound-rabbitmq'],
  'ballerinax/redis': ['mi-connector-redis'],
  'ballerinax/salesforce': [
    'esb-connector-salesforcerest',
    'esb-connector-salesforce',
    'esb-connector-salesforcebulk',
    'esb-inbound-salesforce',
  ],
  'ballerinax/salesforce.marketingcloud': ['mi-connector-salesforcemarketingcloud'],
  'ballerinax/salesforce.pubsub': ['mi-connector-salesforcepubsub', 'mi-inbound-salesforcepubsub'],
  'ballerinax/sap.jco': ['mi-connector-sap.jco'],
  'ballerinax/servicenow': ['esb-connector-servicenow'],
  'ballerinax/snowflake': ['esb-connector-snowflake'],
  'ballerinax/solace': ['mi-connector-solace', 'mi-inbound-solace'],
  'ballerinax/stripe': ['esb-connector-stripe'],
  'ballerinax/twilio': ['esb-connector-twilio'],
  'ballerinax/twitter': ['esb-connector-twitter', 'esb-inbound-twitter'],
};

/** MI component ids mapped to a Ballerina package, in display order (empty when unmapped). */
export function getMIComponentIds(org: string, name: string): readonly string[] {
  return MI_MAPPING[`${org}/${name}`] ?? [];
}
