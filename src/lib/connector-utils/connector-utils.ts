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

import { BallerinaPackage, ConnectorMetadata, FilterOptions } from '@/types/connector';
import hiddenPackages from './hidden-packages.json';
import deprecatedPackages from './deprecated-packages.json';

/** Default metadata value for connectors missing Area/Vendor/Type keywords */
export const METADATA_FALLBACK = 'Other';

/**
 * Dictionary for proper brand/term capitalization
 * Maps lowercase to proper capitalization
 */
const CAPITALIZATION_DICTIONARY: Record<string, string> = {
  // AI/ML Services
  openai: 'OpenAI',
  ai: 'AI',
  ml: 'ML',

  // Cloud Providers & Services
  aws: 'AWS',
  gcp: 'GCP',
  azure: 'Azure',
  s3: 'S3',
  sqs: 'SQS',
  sns: 'SNS',
  dynamodb: 'DynamoDB',

  // Protocols & Standards
  api: 'API',
  http: 'HTTP',
  https: 'HTTPS',
  ftp: 'FTP',
  sftp: 'SFTP',
  ssh: 'SSH',
  sql: 'SQL',
  nosql: 'NoSQL',
  graphql: 'GraphQL',
  grpc: 'gRPC',
  rest: 'REST',
  soap: 'SOAP',
  smtp: 'SMTP',
  imap: 'IMAP',
  pop3: 'POP3',
  tcp: 'TCP',
  udp: 'UDP',
  ip: 'IP',
  dns: 'DNS',
  ldap: 'LDAP',
  scim: 'SCIM',
  fhir: 'FHIR',
  hl7: 'HL7',
  cdc: 'CDC',

  // Data Formats
  xml: 'XML',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  csv: 'CSV',
  yaml: 'YAML',
  toml: 'TOML',

  // Auth & Security
  jwt: 'JWT',
  oauth: 'OAuth',
  saml: 'SAML',
  openid: 'OpenID',

  // Messaging
  rss: 'RSS',
  sms: 'SMS',
  mms: 'MMS',
  mqtt: 'MQTT',
  amqp: 'AMQP',

  // Databases
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  mongodb: 'MongoDB',
  redis: 'Redis',
  mssql: 'MSSQL',
  mariadb: 'MariaDB',

  // Business
  crm: 'CRM',
  adp: 'ADP',
  nytimes: 'NYTimes',

  // Platforms & Companies (common ones)
  godaddy: 'GoDaddy',
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  salesforce: 'Salesforce',
  workday: 'Workday',
  servicenow: 'ServiceNow',
  shopify: 'Shopify',
  stripe: 'Stripe',
  paypal: 'PayPal',
  twilio: 'Twilio',
  sendgrid: 'SendGrid',
  hubspot: 'HubSpot',
  zendesk: 'Zendesk',
  jira: 'Jira',
  confluence: 'Confluence',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  twitter: 'Twitter',
  slack: 'Slack',
  discord: 'Discord',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
  googledrive: 'GoogleDrive',
  googleapis: 'GoogleAPIs',

  // Technologies
  iot: 'IoT',
  sdk: 'SDK',
  cli: 'CLI',
  ui: 'UI',
  ux: 'UX',
  url: 'URL',
  uri: 'URI',
  uuid: 'UUID',
  pdf: 'PDF',
  gif: 'GIF',
  png: 'PNG',
  jpg: 'JPG',
  jpeg: 'JPEG',
  svg: 'SVG',
};

/**
 * Packages to hide from the integration store.
 * These are excluded from all search results, pagination, and filter options.
 *
 * Entries are either a bare package name (hides that name under every org) or
 * "org/name" (hides only that org's package). The list lives in
 * hidden-packages.json (manual) and deprecated-packages.json (packages whose
 * newest version is deprecated in Ballerina Central) so
 * scripts/generate-sitemap.js can read the same data.
 */
export const HIDDEN_PACKAGES = new Set<string>([...hiddenPackages, ...deprecatedPackages]);

/**
 * True if the package is hidden, by bare name or by "org/name".
 * `organization` is optional: without it only bare-name entries can match.
 */
export function isHiddenPackage(pkg: Pick<BallerinaPackage, 'name' | 'organization'>): boolean {
  return (
    HIDDEN_PACKAGES.has(pkg.name) ||
    (!!pkg.organization && HIDDEN_PACKAGES.has(`${pkg.organization}/${pkg.name}`))
  );
}

/** Orgs the store lists. A detail page for any other org is shown as not found. */
const STORE_ORGS: ReadonlySet<string> = new Set(['ballerina', 'ballerinax']);

export function isStoreOrg(org: string | undefined): boolean {
  return !!org && STORE_ORGS.has(org);
}

const DOCS_BASE = 'https://wso2.com/integration-platform/docs/connectors/catalog';

/**
 * Full package name to display name overrides.
 * These take highest priority and bypass all other name resolution.
 */
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  'aayu.mftg.as2': 'Aayu MFTG AS2',
  activecampaign: 'ActiveCampaign',
  'activemq.driver': 'ActiveMQ Driver',
  'adp.paystatements': 'ADP Pay Statements',
  'adp.workerpayrollinstructions': 'ADP Worker Payroll Instructions',
  'ai.deepseek': 'DeepSeek AI Connector',
  'ai.memory.mssql': 'AI Memory - MS SQL Server',
  'ai.openrouter': 'OpenRouter AI Gateway',
  'ai.pgvector': 'PostgreSQL Vectorstore',
  asb: 'Azure Service Bus',
  'asyncapi.native.handler': 'AsyncAPI Native Handler',
  'aws.dynamodbstreams': 'AWS DynamoDB Streams',
  'aws.marketplace.mpe': 'AWS Marketplace MPE',
  'aws.marketplace.mpm': 'AWS Marketplace MPM',
  'aws.redshiftdata': 'AWS Redshift Data',
  'aws.secretmanager': 'AWS Secret Manager',
  'aws.ses': 'AWS SES',
  'aws.simpledb': 'AWS SimpleDB',
  'azure.ad': 'Azure AD',
  'azure.anomalydetector': 'Azure Anomaly Detector',
  'azure.iothub': 'Azure IoT Hub',
  'azure.openai.finetunes': 'Azure OpenAI Fine-Tunes',
  'azure.qnamaker': 'Azure QnA Maker',
  'azure.sqldb': 'Azure SQL DB',
  azure_cosmosdb: 'Azure Cosmos DB',
  azure_eventhub: 'Azure Event Hub',
  azure_storage_service: 'Azure Storage Service',
  'beezup.merchant': 'BeezUP Merchant',
  bintable: 'BINTable',
  bisstats: 'BIS Stats',
  'bmc.truesightpresentationserver': 'BMC TrueSight Presentation Server',
  boxapi: 'Box API',
  bulksms: 'BulkSMS',
  capsulecrm: 'Capsule CRM',
  cdc: 'CDC',
  'cdata.connect': 'CData Connect',
  'cdata.connect.driver': 'CData Connect Driver',
  'cloudmersive.virusscan': 'Cloudmersive Virus Scan',
  'commercetools.cartsordershoppinglists': 'Commercetools Carts, Orders & Shopping Lists',
  'commercetools.customizebehavior': 'Commercetools Customize Behavior',
  'commercetools.customizedata': 'Commercetools Customize Data',
  'confluent.cavroserdes': 'Confluent Avro SerDes',
  'confluent.cregistry': 'Confluent Schema Registry',
  constantcontact: 'Constant Contact',
  covid19: 'COVID-19',
  'docusign.admin': 'DocuSign Admin',
  'docusign.click': 'DocuSign Click',
  'docusign.dsadmin': 'DocuSign Admin',
  'docusign.dsclick': 'DocuSign Click',
  'docusign.dsesign': 'DocuSign eSign',
  'docusign.monitor': 'DocuSign Monitor',
  'docusign.rooms': 'DocuSign Rooms',
  edocs: 'eDocs',
  'edifact.d03a.finance': 'EDIFACT D03A Finance',
  'edifact.d03a.logistics': 'EDIFACT D03A Logistics',
  'edifact.d03a.manufacturing': 'EDIFACT D03A Manufacturing',
  'edifact.d03a.retail': 'EDIFACT D03A Retail',
  'edifact.d03a.services': 'EDIFACT D03A Services',
  'edifact.d03a.shipping': 'EDIFACT D03A Shipping',
  'edifact.d03a.supplychain': 'EDIFACT D03A Supply Chain',
  'elastic.elasticcloud': 'Elastic Cloud',
  'ellucian.studentcharges': 'Ellucian Student Charges',
  exchangerates: 'Exchange Rates',
  'files.com': 'Files.com',
  'financial.iso20022': 'Financial ISO 20022',
  'financial.iso20022ToSwiftmt': 'Financial ISO 20022 to SWIFT MT',
  'financial.iso8583': 'Financial ISO 8583',
  'financial.swift.mt': 'Financial SWIFT MT',
  'financial.swiftmtToIso20022': 'Financial SWIFT MT to ISO 20022',
  flatapi: 'Flat API',
  'fraudlabspro.smsverification': 'FraudLabs Pro SMS Verification',
  freshbooks: 'FreshBooks',
  'gcloud.pubsub': 'Google Cloud Pub/Sub',
  'googleapis.appsscript': 'Google Apps Script',
  'googleapis.bigquery': 'Google BigQuery',
  'googleapis.bigquery.datatransfer': 'Google BigQuery Data Transfer',
  'googleapis.cloudbillingaccount': 'Google Cloud Billing Account',
  'googleapis.cloudbuild': 'Google Cloud Build',
  'googleapis.clouddatastore': 'Google Cloud Datastore',
  'googleapis.cloudfilestore': 'Google Cloud Filestore',
  'googleapis.cloudfunctions': 'Google Cloud Functions',
  'googleapis.cloudnaturallanguage': 'Google Cloud Natural Language',
  'googleapis.cloudpubsub': 'Google Cloud Pub/Sub',
  'googleapis.cloudscheduler': 'Google Cloud Scheduler',
  'googleapis.cloudtalentsolution': 'Google Cloud Talent Solution',
  'googleapis.cloudtranslation': 'Google Cloud Translation',
  'googleapis.gcalendar': 'Google Calendar',
  'googleapis.gmail': 'Gmail',
  'googleapis.manufacturercenter': 'Google Manufacturer Center',
  'googleapis.mybusiness': 'Google My Business',
  'googleapis.oauth2': 'Google OAuth 2.0',
  gotomeeting: 'GoToMeeting',
  gototraining: 'GoToTraining',
  gotowebinar: 'GoToWebinar',
  'health.hl7v2': 'HL7 v2',
  'health.hl7v2.utils.v2tofhirr4': 'HL7 v2 Utils v2 to FHIR R4',
  'health.hl7v22': 'HL7 v2.2',
  'health.hl7v23': 'HL7 v2.3',
  'health.hl7v23.utils.v2tofhirr4': 'HL7 v2.3 Utils v2 to FHIR R4',
  'health.hl7v231': 'HL7 v2.3.1',
  'health.hl7v24': 'HL7 v2.4',
  'health.hl7v25': 'HL7 v2.5',
  'health.hl7v251': 'HL7 v2.5.1',
  'health.hl7v26': 'HL7 v2.6',
  'health.hl7v27': 'HL7 v2.7',
  'health.hl7v271': 'HL7 v2.7.1',
  'health.hl7v28': 'HL7 v2.8',
  'health.hl7v2commons': 'HL7 v2 Commons',
  'ibm.ctg': 'IBM CTG',
  'ibm.ibmmq': 'IBM MQ',
  idetraceprovider: 'IDE Trace Provider',
  'interzoid.convertcurrency': 'Interzoid Convert Currency',
  'interzoid.currencyexchange': 'Interzoid Currency Exchange',
  'interzoid.currencyrate': 'Interzoid Currency Rate',
  'interzoid.globalnumberinfo': 'Interzoid Global Number Info',
  'interzoid.globaltime': 'Interzoid Global Time',
  'interzoid.statedata': 'Interzoid State Data',
  'interzoid.weatherzip': 'Interzoid Weather Zip',
  ip2whois: 'IP2WHOIS',
  ipgeolocation: 'IP Geolocation',
  iptwist: 'ipTwist',
  'iris.disputeresponder': 'IRIS Dispute Responder',
  'iris.esignature': 'IRIS eSignature',
  'iris.helpdesk': 'IRIS Helpdesk',
  'iris.merchants': 'IRIS Merchants',
  'iris.residuals': 'IRIS Residuals',
  'iris.subscriptions': 'IRIS Subscriptions',
  isbndb: 'ISBNdb',
  isendpro: 'iSendPro',
  'java.jdbc': 'Java JDBC',
  'java.jms': 'Java JMS',
  'jira.servicemanagement': 'Jira Service Management',
  launchdarkly: 'LaunchDarkly',
  mcp: 'MCP',
  'microsoft.dynamics365businesscentral': 'Microsoft Dynamics 365 Business Central',
  'mssql.cdc.driver': 'MSSQL CDC Driver',
  'mysql.cdc.driver': 'MySQL CDC Driver',
  namsor: 'NamSor',
  netsuite: 'NetSuite',
  newrelic: 'New Relic',
  newsapi: 'News API',
  nowpayments: 'NOWPayments',
  np: 'NP',
  'nytimes.articlesearch': 'NYTimes Article Search',
  'nytimes.moviereviews': 'NYTimes Movie Reviews',
  'nytimes.topstories': 'NYTimes Top Stories',
  odweather: 'OD Weather',
  onepassword: '1Password',
  'openai.finetunes': 'OpenAI Fine-Tunes',
  openair: 'OpenAir',
  openfigi: 'OpenFIGI',
  openweathermap: 'OpenWeatherMap',
  oracledb: 'Oracle DB',
  'oracledb.driver': 'OracleDB Driver',
  'oraclefusion.erp.integrations': 'Oracle Fusion ERP Integrations',
  orbitcrm: 'Orbit CRM',
  pagerduty: 'PagerDuty',
  pandadoc: 'PandaDoc',
  pdfbroker: 'PDF Broker',
  peoplehr: 'PeopleHR',
  'persist.googlesheets': 'Persist Google Sheets',
  'persist.inmemory': 'Persist In-Memory',
  pocketsmith: 'PocketSmith',
  'postgresql.cdc.driver': 'PostgreSQL CDC Driver',
  'power.bi': 'Power BI',
  'powertoolsdeveloper.data': 'Powertools Developer Data',
  'powertoolsdeveloper.files': 'Powertools Developer Files',
  'powertoolsdeveloper.math': 'Powertools Developer Math',
  'powertoolsdeveloper.weather': 'Powertools Developer Weather',
  'quickbooks.online': 'QuickBooks Online',
  ritekit: 'RiteKit',
  samcart: 'SamCart',
  sap: 'SAP',
  'sap.fieldglass.approval': 'SAP Fieldglass Approval',
  'sap.jco': 'SAP ECC (JCo)',
  'sap.s4hana.api_sales_inquiry_srv': 'SAP S/4HANA Sales Inquiry API',
  'sap.s4hana.api_sales_order_simulation_srv': 'SAP S/4HANA Sales Order Simulation API',
  'sap.s4hana.api_sales_order_srv': 'SAP S/4HANA Sales Order API',
  'sap.s4hana.api_sales_quotation_srv': 'SAP S/4HANA Sales Quotation API',
  'sap.s4hana.api_salesdistrict_srv': 'SAP S/4HANA Sales District API',
  'sap.s4hana.api_salesorganization_srv': 'SAP S/4HANA Sales Organization API',
  'sap.s4hana.api_sd_incoterms_srv': 'SAP S/4HANA SD Incoterms API',
  'sap.s4hana.api_sd_sa_soldtopartydetn': 'SAP S/4HANA SD Sold-to-Party Determination',
  'sap.s4hana.ce_salesorder_0001': 'SAP S/4HANA CE Sales Order',
  'sap.s4hana.salesarea_0001': 'SAP S/4HANA Sales Area',
  'sap.successfactors.litmos': 'SAP SuccessFactors Litmos',
  'saps4hana.externaltaxcalculation.taxquote': 'SAP S/4HANA External Tax Calculation',
  'saps4hana.itcm.agreement': 'SAP S/4HANA ITCM Agreement',
  'saps4hana.itcm.customer': 'SAP S/4HANA ITCM Customer',
  'saps4hana.itcm.product': 'SAP S/4HANA ITCM Product',
  'saps4hana.itcm.user': 'SAP S/4HANA ITCM User',
  'saps4hana.wls.screeninghits': 'SAP S/4HANA WLS Screening Hits',
  shipstation: 'ShipStation',
  'siemens.platformcore.identitymanagement': 'Siemens Platform Core Identity Management',
  'solace.jms': 'Solace JMS',
  soundcloud: 'SoundCloud',
  squareup: 'SquareUp',
  stabilityai: 'Stability AI',
  sugarcrm: 'SugarCRM',
  symantotextanalytics: 'Symanto Text Analytics',
  techport: 'TechPort',
  themoviedb: 'TheMovieDB',
  'trigger.aayu.mftg.as2': 'Trigger Aayu MFTG AS2',
  'trigger.asb': 'Trigger Azure Service Bus',
  'trigger.quickbooks': 'Trigger QuickBooks',
  visiblethread: 'VisibleThread',
  'vonage.numberinsight': 'Vonage Number Insight',
  'webscraping.ai': 'Web Scraping AI',
  'whatsapp.business': 'WhatsApp Business',
  whohoststhis: 'WhoHostsThis',
  'workday.absencemanagement': 'Workday Absence Management',
  'workday.businessprocess': 'Workday Business Process',
  'workday.coreaccounting': 'Workday Core Accounting',
  wordpress: 'WordPress',
  worldbank: 'World Bank',
  worldtimeapi: 'World Time API',
  'wso2.apim.catalog': 'WSO2 API Manager Catalog',
  'wso2.controlplane': 'WSO2 Control Plane',
  'wso2.icp': 'WSO2 ICP',
};

// Bumped to v4 for the new docs site (new sitemap location, changed page slugs): earlier
// versions invalidated caches populated before the bare package-root URL fix (see
// pickOverviewUrl). Without a bump, users who visited recently would keep the old map
// for up to SITEMAP_CACHE_TTL.
const SITEMAP_CACHE_KEY = 'connector_docs_sitemap_v4';
const SITEMAP_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
// The new docs site publishes its sitemap under /connectors; the previous site published
// one at the docs root. Tried in this order so the store works on either side of the cutover.
const DOCS_SITEMAP_URLS = [
  `${DOCS_BASE.replace('/catalog', '')}/sitemap.xml`,
  `${DOCS_BASE.replace('/connectors/catalog', '')}/sitemap.xml`,
];

/**
 * Fetches the first docs sitemap that answers with a success status and lists at least one
 * connector catalog URL (a 200 page with none, e.g. an HTML fallback, is skipped); throws if
 * no location qualifies.
 */
async function fetchDocsSitemap(): Promise<string> {
  for (const url of DOCS_SITEMAP_URLS) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const xml = await response.text();
      if (/https:\/\/[^\s<]*\/connectors\/catalog\/[^/<]+\/[^/<\s]+/.test(xml)) return xml;
    } catch {
      /* try the next location */
    }
  }
  throw new Error('docs sitemap is unavailable');
}

interface SitemapCache {
  entries: [string, string][];
  timestamp: number;
}

const STANDARD_SUBPAGES = new Set([
  'setup-guide',
  'example',
  'actions',
  'action-reference',
  'triggers',
  'trigger-reference',
]);

/**
 * Picks the canonical "overview" page URL out of every docs URL published for one
 * package folder (e.g. overview, example, setup-guide, action-reference). The final
 * slug isn't predictable (connector-overview, overview, or a fully custom name — see
 * CONNECTOR_DOCS for examples), so when there's more than one page we prefer whichever
 * slug contains "overview". Failing that, some catalog entries — notably Ballerina
 * standard-library "Built-in" modules like graphql/grpc/mqtt — publish their overview
 * content at the bare package-root URL itself (no further slug) instead of a page
 * named "overview", so we fall back to that when present. A lone page is assumed to
 * be the overview page itself. See https://github.com/wso2/product-integrator/issues/2554.
 */
export function pickOverviewUrl(urls: string[], packageName: string): string | undefined {
  if (urls.length === 1) return urls[0];
  const explicitOverview = urls.find((url) =>
    /overview/i.test(url.split('/').filter(Boolean).pop() ?? '')
  );
  if (explicitOverview) return explicitOverview;
  const byPackageName = urls.find((url) => url.split('/').filter(Boolean).pop() === packageName);
  if (byPackageName) return byPackageName;
  // Some connectors (e.g. hubspot.*) name their overview page after the connector. If exactly
  // one page is left once the standard sub-pages are set aside, that is the overview.
  const others = urls.filter(
    (url) => !STANDARD_SUBPAGES.has(url.split('/').filter(Boolean).pop() ?? '')
  );
  return others.length === 1 ? others[0] : undefined;
}

// Module-level promise deduplicates concurrent calls during the same page session
let sitemapPromise: Promise<Map<string, string>> | null = null;

/** Test-only: clears the in-memory sitemap cache so test cases don't leak state. */
export function __resetSitemapCacheForTests(): void {
  sitemapPromise = null;
}

/**
 * Returns a map of package name -> documentation URL, built by parsing every
 * .../connectors/catalog/{category}/{packageName}/{slug} URL in the docs sitemap.
 * The package-name folder is the stable, load-bearing part of the URL; the trailing
 * slug is whatever the docs team names the page and can change per-connector or over
 * time, so it's never assumed or pattern-matched — only read back from the sitemap
 * itself (see pickOverviewUrl). This means newly published connectors are picked up
 * automatically with no code change, even if the docs site's slug convention shifts.
 * Result is cached in localStorage for 6 hours. Falls back to an empty map on
 * network failure or CORS error.
 */
export function getConnectorDocsUrlMap(): Promise<Map<string, string>> {
  if (sitemapPromise) return sitemapPromise;

  const fetchPromise = (async (): Promise<Map<string, string>> => {
    try {
      const cached = localStorage.getItem(SITEMAP_CACHE_KEY);
      if (cached) {
        const { entries, timestamp }: SitemapCache = JSON.parse(cached);
        if (Date.now() - timestamp < SITEMAP_CACHE_TTL) {
          return new Map(entries);
        }
      }
    } catch {
      /* localStorage unavailable */
    }

    // Let network/parse errors propagate so the outer .catch() can reset
    // sitemapPromise and allow a retry on the next call.
    const xml = await fetchDocsSitemap();

    const urlsByPackage = new Map<string, string[]>();
    // The rest of the path after the package name is optional, so a bare
    // .../catalog/{category}/{packageName} URL is captured too — see pickOverviewUrl. It may
    // be more than one segment (e.g. twilio/4.0.x/overview), so the whole path is kept.
    const regex = /https:\/\/[^\s<]*\/connectors\/catalog\/[^/<]+\/([^/<]+)(?:\/[^<\s]+)?/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      const [url, packageName] = match;
      const urls = urlsByPackage.get(packageName) ?? [];
      urls.push(url);
      urlsByPackage.set(packageName, urls);
    }

    const docsUrlMap = new Map<string, string>();
    for (const [packageName, urls] of urlsByPackage) {
      const overviewUrl = pickOverviewUrl(urls, packageName);
      if (overviewUrl) docsUrlMap.set(packageName, overviewUrl);
    }

    try {
      localStorage.setItem(
        SITEMAP_CACHE_KEY,
        JSON.stringify({ entries: Array.from(docsUrlMap.entries()), timestamp: Date.now() })
      );
    } catch {
      /* localStorage unavailable or full */
    }

    return docsUrlMap;
  })();

  // Reset on failure so the next call retries; store the wrapped promise itself so
  // concurrent callers hitting the guard above also receive the empty-map fallback.
  sitemapPromise = fetchPromise.catch((_e) => {
    sitemapPromise = null;
    return new Map<string, string>();
  });
  return sitemapPromise;
}

/**
 * Lower-cases text and turns the separators used in package names (`.`, `_`, `-`) into
 * single spaces, so a search for "aws sns" matches the package `aws.sns` and a search for
 * "aws.sns" matches the keyword "aws sns". Apply it to both the query and the text searched.
 */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts a package name to a display name.
 *
 * Resolution order:
 * 1. DISPLAY_NAME_OVERRIDES dictionary (full package name match)
 * 2. Name/ keyword tag from Ballerina.toml
 * 3. Smart capitalization using CAPITALIZATION_DICTIONARY per word
 * 4. Vendor metadata match
 * 5. Default: capitalize first letter of each part
 */
export function getDisplayName(packageName: string, vendor?: string, keywords?: string[]): string {
  // 1. Check full name overrides first
  if (DISPLAY_NAME_OVERRIDES[packageName]) {
    return DISPLAY_NAME_OVERRIDES[packageName];
  }

  // 2. Check Name/ keyword tag
  if (keywords) {
    const nameTag = keywords.find((k) => k.startsWith('Name/'));
    if (nameTag) {
      const extracted = nameTag.slice('Name/'.length).trim();
      if (extracted) {
        return extracted;
      }
    }
  }

  // 3. Fall back to word-level capitalization
  const parts = packageName.split('.');

  const transformedParts = parts.map((part, index) => {
    const lowerPart = part.toLowerCase();

    // Check dictionary first
    if (CAPITALIZATION_DICTIONARY[lowerPart]) {
      return CAPITALIZATION_DICTIONARY[lowerPart];
    }

    // If we have vendor info and this is the first part, try to match with vendor
    if (index === 0 && vendor && vendor.toLowerCase() !== METADATA_FALLBACK.toLowerCase()) {
      const vendorLower = vendor.toLowerCase();
      if (
        lowerPart === vendorLower ||
        vendorLower.includes(lowerPart) ||
        lowerPart.includes(vendorLower)
      ) {
        return vendor;
      }
    }

    // Default: capitalize first letter
    return part.charAt(0).toUpperCase() + part.slice(1);
  });

  return transformedParts.join(' ');
}

/**
 * Extracts metadata from connector keywords
 */
export function parseConnectorMetadata(keywords: string[]): ConnectorMetadata {
  const areaKeywords = keywords
    .filter((k) => k.startsWith('Area/'))
    .map((k) => k.replace('Area/', ''))
    // "Built-in" is no longer a user-facing area (standard-library marker only).
    .filter((a) => a !== 'Built-in');
  const area = areaKeywords.length > 0 ? areaKeywords : [METADATA_FALLBACK];
  const vendor =
    keywords.find((k) => k.startsWith('Vendor/'))?.replace('Vendor/', '') || METADATA_FALLBACK;
  const typeKeywords = keywords
    .filter((k) => k.startsWith('Type/'))
    .map((k) => k.replace('Type/', ''));
  const type = typeKeywords.length > 0 ? typeKeywords : [METADATA_FALLBACK];
  return { area, vendor, type };
}

/**
 * Case-insensitive A to Z order for filter options. The default `.sort()` compares raw
 * character codes, which puts every lowercase-leading name (e.g. "dataflowkit") after "Z".
 */
function compareOptions(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Extracts all unique filter options from connectors
 * Includes all connector types to populate filter dropdowns
 */
export function extractFilterOptions(connectors: BallerinaPackage[]): FilterOptions {
  const areas = new Set<string>();
  const vendors = new Set<string>();
  const types = new Set<string>();

  connectors.forEach((connector) => {
    const metadata = parseConnectorMetadata(connector.keywords);
    metadata.area.forEach((a) => areas.add(a));
    vendors.add(metadata.vendor);
    metadata.type.forEach((t) => types.add(t));
  });

  // Hide "Other" from the Type and Vendor filters — connectors with Type/Other, Vendor/Other
  // or no such tag should still appear in results but not be filterable by it
  types.delete(METADATA_FALLBACK);
  vendors.delete(METADATA_FALLBACK);

  return {
    areas: Array.from(areas).sort(compareOptions),
    vendors: Array.from(vendors).sort(compareOptions),
    types: Array.from(types).sort(compareOptions),
  };
}

/**
 * Filters connectors based on selected criteria
 * Note: Automatically filters to only show connectors with type "connector"
 */
export function filterConnectors(
  connectors: BallerinaPackage[],
  filters: {
    selectedAreas: string[];
    selectedVendors: string[];
    searchQuery: string;
  }
): BallerinaPackage[] {
  return connectors.filter((connector) => {
    const metadata = parseConnectorMetadata(connector.keywords);

    // Area filter
    if (
      filters.selectedAreas.length > 0 &&
      !metadata.area.some((a) => filters.selectedAreas.includes(a))
    ) {
      return false;
    }

    // Vendor filter
    if (filters.selectedVendors.length > 0 && !filters.selectedVendors.includes(metadata.vendor)) {
      return false;
    }

    // Search query
    if (filters.searchQuery) {
      const query = normalizeForSearch(filters.searchQuery);
      const displayName = getDisplayName(connector.name, metadata.vendor);
      const searchableText = [
        connector.name,
        displayName,
        connector.summary,
        ...connector.keywords,
        ...metadata.area,
        ...metadata.type,
        metadata.vendor,
      ].join(' ');

      if (!normalizeForSearch(searchableText).includes(query)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Formats pull count for display
 */
export function formatPullCount(count: number): string {
  // 999,950+ would round to "1000.0K", so it rolls over to M at the rounding boundary.
  if (count >= 999950) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

// HTML elements that can show up in package summaries. Only these are removed: a general
// "anything in angle brackets" rule would also eat real text such as `map<json>`.
const HTML_BLOCK_TAGS = 'p|div|br|hr|ul|ol|li|pre|blockquote|table|thead|tbody|tr|td|th|h[1-6]';
const HTML_INLINE_TAGS = 'a|abbr|b|code|em|i|img|small|span|strong|sub|sup|u';
// Opening, closing and self-closing forms, with or without attributes.
const htmlTag = (names: string) => new RegExp(`</?(?:${names})(?:\\s[^<>]*)?/?>`, 'gi');
const HTML_BLOCK_TAG_RE = htmlTag(HTML_BLOCK_TAGS);
const HTML_INLINE_TAG_RE = htmlTag(HTML_INLINE_TAGS);

/**
 * Reduces a markdown summary to plain text (links keep their label, code and emphasis
 * markers are dropped, known HTML tags are removed) so it can go into meta description tags.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(HTML_BLOCK_TAG_RE, ' ')
    .replace(HTML_INLINE_TAG_RE, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formats a date for display
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Calculates days since a date
 */
export function getDaysSinceUpdate(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Formats time since update in a human-readable way
 */
export function formatDaysSince(dateString: string): string {
  // A date slightly in the future (clock skew) counts as today, not "N days ago".
  if (new Date(dateString).getTime() > Date.now()) return 'Today';
  const days = getDaysSinceUpdate(dateString);

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  }
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

/**
 * Sort options
 */
export type SortOption =
  | 'name-asc'
  | 'name-desc'
  | 'pullCount-desc'
  | 'pullCount-asc'
  | 'date-desc'
  | 'date-asc';

/**
 * Sorts connectors based on selected option
 */
export function sortConnectors(
  connectors: BallerinaPackage[],
  sortBy: SortOption
): BallerinaPackage[] {
  const sorted = [...connectors];

  switch (sortBy) {
    case 'name-asc':
      return sorted.sort((a, b) => {
        const vendorA = parseConnectorMetadata(a.keywords).vendor;
        const vendorB = parseConnectorMetadata(b.keywords).vendor;
        return getDisplayName(a.name, vendorA).localeCompare(getDisplayName(b.name, vendorB));
      });

    case 'name-desc':
      return sorted.sort((a, b) => {
        const vendorA = parseConnectorMetadata(a.keywords).vendor;
        const vendorB = parseConnectorMetadata(b.keywords).vendor;
        return getDisplayName(b.name, vendorB).localeCompare(getDisplayName(a.name, vendorA));
      });

    case 'pullCount-desc':
      return sorted.sort((a, b) => (b.totalPullCount || 0) - (a.totalPullCount || 0));

    case 'pullCount-asc':
      return sorted.sort((a, b) => (a.totalPullCount || 0) - (b.totalPullCount || 0));

    case 'date-desc':
      return sorted.sort(
        (a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime()
      );

    case 'date-asc':
      return sorted.sort(
        (a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime()
      );

    default:
      return sorted;
  }
}
