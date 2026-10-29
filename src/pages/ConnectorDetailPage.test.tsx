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
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { OxygenUIThemeProvider } from '@wso2/oxygen-ui';
import { lightTheme } from '@/styles/theme';
import ConnectorDetailPage from './ConnectorDetailPage';
import { fetchPackageDetails } from '@/lib/rest-client';
import { didMILoadFail, fetchMIComponents, MIComponent } from '@/lib/mi-connector';
import { HIDDEN_PACKAGES } from '@/lib/connector-utils';
import { PackageNotFoundError } from '@/lib/rest-client/errors';

jest.mock('@/lib/rest-client', () => ({
  fetchPackageDetails: jest.fn(),
}));
jest.mock('@/lib/mi-connector', () => ({
  ...jest.requireActual('@/lib/mi-connector'),
  fetchMIComponents: jest.fn(),
  didMILoadFail: jest.fn(),
}));
jest.mock('@/components/WSO2Header', () => () => null);
jest.mock('@/components/Footer', () => () => null);
jest.mock('@/components/BreadcrumbsNav', () => () => null);
jest.mock(
  '@/components/MarkdownContent',
  () =>
    ({ content }: { content: string }) =>
      jest.requireActual('react').createElement('div', null, content)
);

const mockFetchPackageDetails = fetchPackageDetails as jest.Mock;
const mockFetchMIComponents = fetchMIComponents as jest.Mock;
const mockDidMILoadFail = didMILoadFail as jest.Mock;

const renderAt = (path: string) => {
  const router = createMemoryRouter(
    [
      { path: '/connector/:org/:name', element: <ConnectorDetailPage /> },
      { path: '/connector/:org/:name/:version', element: <ConnectorDetailPage /> },
    ],
    { initialEntries: [path] }
  );
  render(
    <OxygenUIThemeProvider theme={lightTheme}>
      <RouterProvider router={router} />
    </OxygenUIThemeProvider>
  );
  return router;
};

// CRA resets mock implementations between tests, which empties the matchMedia stub
// from setupTests.ts; the page and the theme provider both read `.matches` from it.
const stubMatchMedia = () =>
  (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  }));

describe('ConnectorDetailPage hidden packages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stubMatchMedia();
    mockFetchPackageDetails.mockRejectedValue(new Error('unexpected fetch'));
    mockFetchMIComponents.mockResolvedValue([]);
  });

  it('shows "not found" for a hidden package and never fetches anything', async () => {
    renderAt('/connector/ballerina/sql/latest');

    expect(await screen.findByText('Connector not found')).toBeInTheDocument();
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
    expect(mockFetchPackageDetails).not.toHaveBeenCalled();
    expect(mockFetchMIComponents).not.toHaveBeenCalled();
  });

  it('says "not found" with a way back, and no Retry, when Central answers 404', async () => {
    mockFetchPackageDetails.mockRejectedValue(new PackageNotFoundError('missing'));

    renderAt('/connector/ballerinax/doesnotexist/latest');

    expect(await screen.findByText('Connector not found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to store' })).toBeInTheDocument();
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
    expect(screen.queryByText(/HTTP error/)).not.toBeInTheDocument();
  });

  it('still offers Retry for a failure that is not a 404', async () => {
    mockFetchPackageDetails.mockRejectedValue(new Error('HTTP error! status: 500'));

    renderAt('/connector/ballerinax/http/latest');

    expect(await screen.findByText('Failed to load connector details')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('Back to store')).not.toBeInTheDocument();
  });

  it('still fetches a package that is not hidden', async () => {
    renderAt('/connector/ballerinax/not-a-hidden-package/latest');

    await waitFor(() => {
      expect(mockFetchPackageDetails).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Connector not found')).not.toBeInTheDocument();
  });

  it('hides only the matching org for an "org/name" entry', async () => {
    HIDDEN_PACKAGES.add('ballerina/dual-org');
    try {
      renderAt('/connector/ballerina/dual-org/latest');
      expect(await screen.findByText('Connector not found')).toBeInTheDocument();
      expect(mockFetchPackageDetails).not.toHaveBeenCalled();
    } finally {
      HIDDEN_PACKAGES.delete('ballerina/dual-org');
    }
  });

  it('does not hide the other org for an "org/name" entry', async () => {
    HIDDEN_PACKAGES.add('ballerina/dual-org');
    try {
      renderAt('/connector/ballerinax/dual-org/latest');
      await waitFor(() => {
        expect(mockFetchPackageDetails).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByText('Connector not found')).not.toBeInTheDocument();
    } finally {
      HIDDEN_PACKAGES.delete('ballerina/dual-org');
    }
  });
});

const packageDetails = {
  id: '1',
  organization: 'ballerinax',
  name: 'kafka',
  version: '4.6.7',
  summary: 'Kafka connector',
  readme: '## Overview\nApache Kafka overview text.',
  URL: '/ballerinax/kafka/4.6.7',
  icon: '',
  keywords: ['Vendor/Apache', 'Area/Messaging', 'Type/Connector'],
  licenses: ['Apache-2.0'],
  versions: ['4.6.7', '4.6.6'],
  createdDate: '2026-01-01T00:00:00Z',
  totalPullCount: 1000,
};

const release = (tagName: string) => ({
  tagName,
  releaseUrl: `https://github.com/example/releases/tag/${tagName}`,
  products: ['MI 4.7.0', 'MI 4.6.0', 'MI 4.5.0'],
  assets: [{ name: `kafka-${tagName}.zip`, downloadUrl: `https://example.com/${tagName}.zip` }],
});

const miComponents: MIComponent[] = [
  {
    id: 'esb-connector-kafka',
    name: 'Kafka',
    labels: ['integration'],
    documentationUrl: 'https://mi.docs.wso2.com/kafka',
    releases: [release('v3.3.11'), release('v3.3.10')],
  },
  {
    id: 'esb-inbound-kafka',
    name: 'Kafka (Inbound)',
    labels: ['inbound-endpoint'],
    releases: [release('v2.1.0')],
  },
];

// Let the page finish loading the MI data before interacting with it.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('ConnectorDetailPage MI profile', () => {
  let router: ReturnType<typeof renderAt>;
  const location = () => router.state.location.search;
  const open = (path: string) => {
    router = renderAt(path);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    stubMatchMedia();
    mockFetchPackageDetails.mockImplementation(async (org: string, name: string) => ({
      ...packageDetails,
      organization: org,
      name,
    }));
    mockFetchMIComponents.mockImplementation(async (org: string, name: string) =>
      org === 'ballerinax' && name === 'kafka' ? miComponents : []
    );
  });

  it('shows the default profile with a switch, and no "View MI Connector" button', async () => {
    open('/connector/ballerinax/kafka/latest');

    expect(await screen.findByRole('button', { name: 'WSO2 Integrator: MI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'WSO2 Integrator' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Downloads')).toBeInTheDocument();
    expect(screen.queryByText('Supported MI versions')).not.toBeInTheDocument();
    expect(screen.queryByText('View MI Connector')).not.toBeInTheDocument();
  });

  it('opens the MI profile for ?profile=mi with the first component', async () => {
    open('/connector/ballerinax/kafka/latest?profile=mi');

    expect(await screen.findByText('Supported MI versions')).toBeInTheDocument();
    expect(screen.getByText('v3.3.11')).toBeInTheDocument();
    expect(screen.getByText('MI 4.7.0, MI 4.6.0, MI 4.5.0')).toBeInTheDocument();
    expect(screen.queryByText('Downloads')).not.toBeInTheDocument();
    // The overview is shared by both profiles.
    expect(screen.getByText(/Apache Kafka overview text\./)).toBeInTheDocument();
  });

  it('opens the requested component, and component alone opens the MI profile', async () => {
    open('/connector/ballerinax/kafka/latest?component=esb-inbound-kafka');

    expect(await screen.findByText('Supported MI versions')).toBeInTheDocument();
    expect(screen.getByText('v2.1.0')).toBeInTheDocument();
    expect(screen.queryByText('v3.3.11')).not.toBeInTheDocument();
  });

  it('falls back to the first component for an unknown component id', async () => {
    open('/connector/ballerinax/kafka/latest?profile=mi&component=unknown');

    expect(await screen.findByText('v3.3.11')).toBeInTheDocument();
  });

  it('removes both parameters when switching back to WSO2 Integrator', async () => {
    open('/connector/ballerinax/kafka/latest?profile=mi&component=esb-inbound-kafka');
    await screen.findByText('v2.1.0');

    await userEvent.click(screen.getByRole('button', { name: 'WSO2 Integrator' }));

    await waitFor(() => expect(screen.getByText('Downloads')).toBeInTheDocument());
    expect(location()).toBe('');
  });

  it('sets profile=mi in the URL when switching to the MI profile', async () => {
    open('/connector/ballerinax/kafka/latest');
    await screen.findByRole('button', { name: 'WSO2 Integrator: MI' });
    await settle();

    await userEvent.click(screen.getByRole('button', { name: 'WSO2 Integrator: MI' }));

    expect(await screen.findByText('Supported MI versions')).toBeInTheDocument();
    expect(location()).toContain('profile=mi');
  });

  it('picks another component from the dropdown and records it in the URL', async () => {
    open('/connector/ballerinax/kafka/latest?profile=mi');
    await screen.findByText('v3.3.11');
    await settle();

    await userEvent.click(screen.getByLabelText('MI component'));
    await userEvent.click(await screen.findByRole('option', { name: 'Kafka (Inbound)' }));

    expect(await screen.findByText('v2.1.0')).toBeInTheDocument();
    expect(location()).toContain('component=esb-inbound-kafka');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('keeps the dropdown open after clicking it, and closes it on a second click', async () => {
    open('/connector/ballerinax/kafka/latest?profile=mi');
    await screen.findByText('v3.3.11');
    await settle();

    await userEvent.click(screen.getByLabelText('MI component'));
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('MI component'));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('keeps the switch but disables MI, and ignores ?profile=mi, for a connector without MI', async () => {
    open('/connector/ballerinax/other/latest?profile=mi');

    expect(await screen.findByText('Downloads')).toBeInTheDocument();
    const mi = screen.getByRole('button', { name: 'WSO2 Integrator: MI' });
    expect(mi).toBeDisabled();
    expect(screen.getByRole('button', { name: 'WSO2 Integrator' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByText('Supported MI versions')).not.toBeInTheDocument();
    // The reason is available as a tooltip on hover.
    await userEvent.hover(mi.parentElement as HTMLElement);
    expect(
      await screen.findByText('Not available: no MI connector for this connector')
    ).toBeInTheDocument();
  });

  it('explains a failed MI load instead of saying there is no MI connector', async () => {
    mockFetchMIComponents.mockResolvedValue([]);
    mockDidMILoadFail.mockReturnValue(true);
    open('/connector/ballerinax/kafka/latest?profile=mi');

    await screen.findByText('Downloads');
    const mi = screen.getByRole('button', { name: 'WSO2 Integrator: MI' });
    await waitFor(() => expect(mi).toBeDisabled());
    await userEvent.hover(mi.parentElement as HTMLElement);
    expect(
      await screen.findByText('Could not load the MI details. Try again later.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Not available: no MI connector for this connector')
    ).not.toBeInTheDocument();
  });
});
