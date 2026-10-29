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

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConnectorCard from './ConnectorCard';
import { BallerinaPackage } from '@/types/connector';

// Helper to create mock connector
const createMockConnector = (overrides: Partial<BallerinaPackage> = {}): BallerinaPackage => ({
  name: 'stripe',
  version: '1.0.0',
  URL: 'packages/ballerinax/stripe/1.0.0',
  summary: 'A connector for Stripe payment processing',
  keywords: ['Area/Finance', 'Vendor/Stripe', 'Type/Connector'],
  icon: 'https://example.com/stripe-icon.png',
  createdDate: new Date().toISOString(),
  totalPullCount: 15000,
  ...overrides,
});

const renderCard = (props: Parameters<typeof ConnectorCard>[0]) =>
  render(
    <MemoryRouter>
      <ConnectorCard {...props} />
    </MemoryRouter>
  );

describe('ConnectorCard', () => {
  it('should render connector name correctly', () => {
    const connector = createMockConnector({ name: 'github' });
    renderCard({ connector, effectiveMode: 'light' });

    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('should render connector version', () => {
    const connector = createMockConnector({ version: '2.5.1' });
    renderCard({ connector, effectiveMode: 'light' });

    expect(screen.getByText('2.5.1')).toBeInTheDocument();
  });

  it('should render connector summary', () => {
    const connector = createMockConnector({ summary: 'Test summary description' });
    renderCard({ connector, effectiveMode: 'light' });

    expect(screen.getByText('Test summary description')).toBeInTheDocument();
  });

  it('should render type chip', () => {
    const connector = createMockConnector({
      keywords: ['Area/Finance', 'Vendor/Stripe', 'Type/API'],
    });
    renderCard({ connector, effectiveMode: 'light' });

    expect(screen.getByText('API')).toBeInTheDocument();
  });

  it('should render vendor chip when not "Other"', () => {
    const connector = createMockConnector({
      keywords: ['Area/Finance', 'Vendor/Stripe', 'Type/Connector'],
    });
    renderCard({ connector, effectiveMode: 'light' });

    expect(screen.getAllByText('Stripe').length).toBeGreaterThan(0);
  });

  it('should not render vendor chip when "Other"', () => {
    const connector = createMockConnector({
      keywords: ['Area/Finance', 'Vendor/Other', 'Type/Connector'],
    });
    renderCard({ connector, effectiveMode: 'light' });

    expect(screen.getByText('Connector')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
  });

  it('should render area chip when not "Other"', () => {
    const connector = createMockConnector({
      keywords: ['Area/Communication', 'Vendor/Twilio', 'Type/Connector'],
    });
    renderCard({ connector, effectiveMode: 'light' });

    expect(screen.getByText('Communication')).toBeInTheDocument();
  });

  it('should format pull count correctly', () => {
    const connector = createMockConnector({ totalPullCount: 1500000 });
    renderCard({ connector, effectiveMode: 'light' });

    expect(screen.getByText('1.5M')).toBeInTheDocument();
  });

  it('should show "0" when pullCount is undefined', () => {
    const connector = createMockConnector({ totalPullCount: undefined });
    renderCard({ connector, effectiveMode: 'light' });

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('should render formatted relative date', () => {
    // Use a fixed system time for deterministic results
    const fixedNow = new Date('2026-01-28T12:00:00Z');
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);

    // Set date to yesterday relative to fixedNow
    const yesterday = new Date(fixedNow);
    yesterday.setDate(yesterday.getDate() - 1);
    const connector = createMockConnector({ createdDate: yesterday.toISOString() });
    renderCard({ connector, effectiveMode: 'light' });

    expect(screen.getByText('1 day ago')).toBeInTheDocument();

    jest.useRealTimers();
  });

  it('should have a link to connector detail page', () => {
    const connector = createMockConnector({ URL: 'packages/ballerinax/test/1.0.0' });
    renderCard({ connector, effectiveMode: 'light' });

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/connector/ballerinax/test/latest');
  });

  it('should navigate via internal router link', () => {
    const connector = createMockConnector();
    renderCard({ connector, effectiveMode: 'light' });

    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
  });

  it('should render avatar with first letter fallback', () => {
    const connector = createMockConnector({ name: 'testconnector', icon: '' });
    renderCard({ connector, effectiveMode: 'light' });

    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('should handle dot-separated names correctly', () => {
    const connector = createMockConnector({ name: 'aws.s3' });
    renderCard({ connector, effectiveMode: 'light' });

    expect(screen.getByText('AWS S3')).toBeInTheDocument();
  });
});

describe('ConnectorCard MI profile', () => {
  const linkOf = (container: HTMLElement) => container.querySelector('a')?.getAttribute('href');

  it('shows no MI badge by default', () => {
    renderCard({ connector: createMockConnector(), effectiveMode: 'light' });
    expect(screen.queryByText('MI')).not.toBeInTheDocument();
  });

  it('marks a Ballerina connector that also has an MI profile, and keeps its downloads', () => {
    renderCard({ connector: createMockConnector(), effectiveMode: 'light', miBadge: 'light' });
    expect(screen.getByText('MI')).toBeInTheDocument();
    expect(screen.getByText('15.0K')).toBeInTheDocument();
    expect(screen.getByText('1.0.0')).toBeInTheDocument();
  });

  it('can open the MI profile of the detail page', () => {
    const { container } = renderCard({
      connector: createMockConnector({ URL: 'packages/ballerinax/kafka/4.6.7' }),
      effectiveMode: 'light',
      miBadge: 'light',
      linkSearch: '?profile=mi',
    });
    expect(linkOf(container)).toBe('/connector/ballerinax/kafka/latest?profile=mi');
  });

  it('shows an MI-only connector with a solid badge, its own link, and no version or downloads', () => {
    const { container } = renderCard({
      connector: createMockConnector({
        name: 'mi-connector-pulsar',
        version: '',
        URL: '/connector/wso2-mi/mi-connector-pulsar',
        keywords: [],
        icon: '',
        totalPullCount: undefined,
        createdDate: '',
        summary: 'Publish and consume messages',
      }),
      effectiveMode: 'light',
      miBadge: 'solid',
      to: '/connector/wso2-mi/mi-connector-pulsar',
      title: 'Pulsar',
    });
    expect(screen.getByText('Pulsar')).toBeInTheDocument();
    expect(screen.queryByText('Mi-connector-pulsar')).not.toBeInTheDocument();
    expect(screen.getByText('MI')).toBeInTheDocument();
    expect(screen.getByText('Publish and consume messages')).toBeInTheDocument();
    expect(linkOf(container)).toBe('/connector/wso2-mi/mi-connector-pulsar');
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
