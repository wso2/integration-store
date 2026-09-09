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
  getDisplayName,
  parseConnectorMetadata,
  extractFilterOptions,
  filterConnectors,
  formatPullCount,
  formatDate,
  getDaysSinceUpdate,
  formatDaysSince,
  sortConnectors,
} from './connector-utils';
import { BallerinaPackage } from '@/types/connector';

// Helper to create mock packages
const createMockPackage = (overrides: Partial<BallerinaPackage> = {}): BallerinaPackage => ({
  name: 'test.connector',
  version: '1.0.0',
  URL: 'https://example.com',
  summary: 'A test connector',
  keywords: ['Area/Integration', 'Vendor/Test', 'Type/Connector'],
  icon: 'https://example.com/icon.png',
  createdDate: '2024-01-15T00:00:00Z',
  totalPullCount: 1000,
  ...overrides,
});

describe('connector-utils', () => {
  describe('getDisplayName', () => {
    it('should use capitalization dictionary for known brands', () => {
      expect(getDisplayName('openai')).toBe('OpenAI');
      expect(getDisplayName('github')).toBe('GitHub');
      expect(getDisplayName('aws')).toBe('AWS');
      expect(getDisplayName('graphql')).toBe('GraphQL');
    });

    it('should handle dot-separated names', () => {
      expect(getDisplayName('aws.s3')).toBe('AWS S3');
      expect(getDisplayName('github.connector')).toBe('GitHub Connector');
      expect(getDisplayName('salesforce.api')).toBe('Salesforce API');
    });

    it('should capitalize first letter for unknown terms', () => {
      expect(getDisplayName('myconnector')).toBe('Myconnector');
      expect(getDisplayName('custom.service')).toBe('Custom Service');
    });

    it('should use vendor capitalization when provided', () => {
      expect(getDisplayName('twilio', 'Twilio')).toBe('Twilio');
      expect(getDisplayName('custom', 'CustomVendor')).toBe('CustomVendor');
    });

    it('should handle empty string', () => {
      expect(getDisplayName('')).toBe('');
    });
  });

  describe('parseConnectorMetadata', () => {
    it('should extract area, vendor, and type from keywords', () => {
      const keywords = ['Area/Finance', 'Vendor/Stripe', 'Type/Connector'];
      const result = parseConnectorMetadata(keywords);

      expect(result).toEqual({
        area: 'Finance',
        areas: ['Finance'],
        vendor: 'Stripe',
        type: 'Connector',
      });
    });

    it('should return "Other" for missing metadata', () => {
      const keywords = ['some-other-keyword'];
      const result = parseConnectorMetadata(keywords);

      expect(result).toEqual({
        area: 'Other',
        areas: ['Other'],
        vendor: 'Other',
        type: 'Other',
      });
    });

    it('should handle empty keywords array', () => {
      const result = parseConnectorMetadata([]);

      expect(result).toEqual({
        area: 'Other',
        areas: ['Other'],
        vendor: 'Other',
        type: 'Other',
      });
    });

    it('should handle partial metadata', () => {
      const keywords = ['Area/Communication'];
      const result = parseConnectorMetadata(keywords);

      expect(result).toEqual({
        area: 'Communication',
        areas: ['Communication'],
        vendor: 'Other',
        type: 'Other',
      });
    });

    it('should extract multiple area tags', () => {
      const keywords = ['Area/Built-in', 'Area/Communication', 'Type/Connector'];
      const result = parseConnectorMetadata(keywords);
      expect(result.areas).toEqual(['Built-in', 'Communication']);
      expect(result.area).toBe('Built-in');
    });
  });

  describe('extractFilterOptions', () => {
    it('should extract unique filter options from connectors', () => {
      const connectors = [
        createMockPackage({ keywords: ['Area/Finance', 'Vendor/Stripe', 'Type/Connector'] }),
        createMockPackage({ keywords: ['Area/Finance', 'Vendor/PayPal', 'Type/Connector'] }),
        createMockPackage({ keywords: ['Area/Communication', 'Vendor/Twilio', 'Type/API'] }),
      ];

      const result = extractFilterOptions(connectors);

      expect(result.areas).toEqual(['Communication', 'Finance']);
      expect(result.vendors).toEqual(['PayPal', 'Stripe', 'Twilio']);
      expect(result.types).toEqual(['API', 'Connector']);
    });

    it('should handle empty connectors array', () => {
      const result = extractFilterOptions([]);

      expect(result).toEqual({
        areas: [],
        vendors: [],
        types: [],
      });
    });

    it('should sort filter options alphabetically', () => {
      const connectors = [
        createMockPackage({ keywords: ['Area/Zebra', 'Vendor/Alpha', 'Type/Beta'] }),
        createMockPackage({ keywords: ['Area/Alpha', 'Vendor/Zebra', 'Type/Alpha'] }),
      ];

      const result = extractFilterOptions(connectors);

      expect(result.areas).toEqual(['Alpha', 'Zebra']);
      expect(result.vendors).toEqual(['Alpha', 'Zebra']);
      expect(result.types).toEqual(['Alpha', 'Beta']);
    });
  });

  describe('filterConnectors', () => {
    const connectors = [
      createMockPackage({
        name: 'stripe',
        summary: 'Payment processing',
        keywords: ['Area/Finance', 'Vendor/Stripe', 'Type/Connector'],
      }),
      createMockPackage({
        name: 'twilio',
        summary: 'SMS and voice',
        keywords: ['Area/Communication', 'Vendor/Twilio', 'Type/API'],
      }),
      createMockPackage({
        name: 'paypal',
        summary: 'Payment gateway',
        keywords: ['Area/Finance', 'Vendor/PayPal', 'Type/Connector'],
      }),
    ];

    it('should filter by area', () => {
      const result = filterConnectors(connectors, {
        selectedAreas: ['Finance'],
        selectedVendors: [],
        searchQuery: '',
      });

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.name)).toEqual(['stripe', 'paypal']);
    });

    it('should filter by vendor', () => {
      const result = filterConnectors(connectors, {
        selectedAreas: [],
        selectedVendors: ['Twilio'],
        searchQuery: '',
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('twilio');
    });

    it('should filter by search query', () => {
      const result = filterConnectors(connectors, {
        selectedAreas: [],
        selectedVendors: [],
        searchQuery: 'payment',
      });

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.name)).toEqual(['stripe', 'paypal']);
    });

    it('should combine multiple filters', () => {
      const result = filterConnectors(connectors, {
        selectedAreas: ['Finance'],
        selectedVendors: ['Stripe'],
        searchQuery: '',
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('stripe');
    });

    it('should return all connectors when no filters applied', () => {
      const result = filterConnectors(connectors, {
        selectedAreas: [],
        selectedVendors: [],
        searchQuery: '',
      });

      expect(result).toHaveLength(3);
    });

    it('should handle case-insensitive search', () => {
      const result = filterConnectors(connectors, {
        selectedAreas: [],
        selectedVendors: [],
        searchQuery: 'PAYMENT',
      });

      expect(result).toHaveLength(2);
    });
  });

  describe('formatPullCount', () => {
    it('should format millions', () => {
      expect(formatPullCount(1000000)).toBe('1.0M');
      expect(formatPullCount(1500000)).toBe('1.5M');
      expect(formatPullCount(10000000)).toBe('10.0M');
    });

    it('should format thousands', () => {
      expect(formatPullCount(1000)).toBe('1.0K');
      expect(formatPullCount(1500)).toBe('1.5K');
      expect(formatPullCount(999999)).toBe('1000.0K');
    });

    it('should return raw number for small counts', () => {
      expect(formatPullCount(0)).toBe('0');
      expect(formatPullCount(1)).toBe('1');
      expect(formatPullCount(999)).toBe('999');
    });
  });

  describe('formatDate', () => {
    it('should format date in US format', () => {
      const result = formatDate('2024-01-15T00:00:00Z');
      expect(result).toBe('Jan 15, 2024');
    });

    it('should handle different date formats', () => {
      const result = formatDate('2023-12-25');
      expect(result).toBe('Dec 25, 2023');
    });
  });

  describe('getDaysSinceUpdate', () => {
    it('should return 0 for today', () => {
      const today = new Date().toISOString();
      expect(getDaysSinceUpdate(today)).toBe(0);
    });

    it('should calculate days correctly', () => {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - 5);
      expect(getDaysSinceUpdate(daysAgo.toISOString())).toBe(5);
    });
  });

  describe('formatDaysSince', () => {
    it('should return "Today" for today', () => {
      const today = new Date().toISOString();
      expect(formatDaysSince(today)).toBe('Today');
    });

    it('should return "Yesterday" for 1 day ago', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatDaysSince(yesterday.toISOString())).toBe('Yesterday');
    });

    it('should return days for less than a week', () => {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - 5);
      expect(formatDaysSince(daysAgo.toISOString())).toBe('5 days ago');
    });

    it('should return weeks for less than a month', () => {
      const weeksAgo = new Date();
      weeksAgo.setDate(weeksAgo.getDate() - 14);
      expect(formatDaysSince(weeksAgo.toISOString())).toBe('2 weeks ago');
    });

    it('should return months for less than a year', () => {
      const monthsAgo = new Date();
      monthsAgo.setDate(monthsAgo.getDate() - 60);
      expect(formatDaysSince(monthsAgo.toISOString())).toBe('2 months ago');
    });

    it('should return years for more than a year', () => {
      const yearsAgo = new Date();
      yearsAgo.setDate(yearsAgo.getDate() - 400);
      expect(formatDaysSince(yearsAgo.toISOString())).toBe('1 years ago');
    });
  });

  describe('sortConnectors', () => {
    const connectors = [
      createMockPackage({
        name: 'beta',
        totalPullCount: 500,
        createdDate: '2024-01-15T00:00:00Z',
        keywords: ['Area/Test', 'Vendor/Other', 'Type/Connector'],
      }),
      createMockPackage({
        name: 'alpha',
        totalPullCount: 1000,
        createdDate: '2024-02-15T00:00:00Z',
        keywords: ['Area/Test', 'Vendor/Other', 'Type/Connector'],
      }),
      createMockPackage({
        name: 'gamma',
        totalPullCount: 750,
        createdDate: '2024-01-01T00:00:00Z',
        keywords: ['Area/Test', 'Vendor/Other', 'Type/Connector'],
      }),
    ];

    it('should sort by name ascending', () => {
      const result = sortConnectors(connectors, 'name-asc');
      expect(result.map((c) => c.name)).toEqual(['alpha', 'beta', 'gamma']);
    });

    it('should sort by name descending', () => {
      const result = sortConnectors(connectors, 'name-desc');
      expect(result.map((c) => c.name)).toEqual(['gamma', 'beta', 'alpha']);
    });

    it('should sort by pull count descending', () => {
      const result = sortConnectors(connectors, 'pullCount-desc');
      expect(result.map((c) => c.totalPullCount)).toEqual([1000, 750, 500]);
    });

    it('should sort by pull count ascending', () => {
      const result = sortConnectors(connectors, 'pullCount-asc');
      expect(result.map((c) => c.totalPullCount)).toEqual([500, 750, 1000]);
    });

    it('should sort by date descending (newest first)', () => {
      const result = sortConnectors(connectors, 'date-desc');
      expect(result.map((c) => c.name)).toEqual(['alpha', 'beta', 'gamma']);
    });

    it('should sort by date ascending (oldest first)', () => {
      const result = sortConnectors(connectors, 'date-asc');
      expect(result.map((c) => c.name)).toEqual(['gamma', 'beta', 'alpha']);
    });

    it('should not mutate the original array', () => {
      const original = [...connectors];
      sortConnectors(connectors, 'name-asc');
      expect(connectors).toEqual(original);
    });

    it('should handle connectors with undefined pullCount', () => {
      const connectorsWithUndefined = [
        createMockPackage({ name: 'a', totalPullCount: undefined }),
        createMockPackage({ name: 'b', totalPullCount: 100 }),
      ];

      const result = sortConnectors(connectorsWithUndefined, 'pullCount-desc');
      expect(result.map((c) => c.totalPullCount)).toEqual([100, undefined]);
    });
  });
});
