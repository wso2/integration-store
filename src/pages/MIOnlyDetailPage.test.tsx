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
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { OxygenUIThemeProvider } from '@wso2/oxygen-ui';
import { lightTheme } from '@/styles/theme';
import MIOnlyDetailPage from './MIOnlyDetailPage';
import { fetchMIComponentsByIds, MIComponent } from '@/lib/mi-connector';

jest.mock('@/lib/mi-connector', () => ({
  ...jest.requireActual('@/lib/mi-connector'),
  fetchMIComponentsByIds: jest.fn(),
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

const mockFetchComponents = fetchMIComponentsByIds as jest.Mock;

const release = (tagName: string) => ({
  tagName,
  releaseUrl: `https://github.com/example/releases/tag/${tagName}`,
  products: ['MI 4.7.0', 'MI 4.6.0'],
  assets: [{ name: `pulsar-${tagName}.zip`, downloadUrl: `https://example.com/${tagName}.zip` }],
});

const components: MIComponent[] = [
  {
    id: 'mi-connector-pulsar',
    name: 'Pulsar',
    description: 'Publish messages to Apache Pulsar topics.',
    labels: ['integration'],
    releases: [release('v1.0.4'), release('v1.0.3')],
  },
  {
    id: 'mi-inbound-pulsar',
    name: 'Pulsar (Inbound)',
    description: 'Consume messages from Apache Pulsar topics.',
    labels: ['inbound-endpoint'],
    releases: [release('v2.0.0')],
  },
];

const stubMatchMedia = () =>
  (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  }));

let router: ReturnType<typeof createMemoryRouter>;
const open = (path: string) => {
  router = createMemoryRouter(
    [
      { path: '/connector/wso2-mi/:id', element: <MIOnlyDetailPage /> },
      { path: '/', element: <div>store home</div> },
    ],
    { initialEntries: [path] }
  );
  render(
    <OxygenUIThemeProvider theme={lightTheme}>
      <RouterProvider router={router} />
    </OxygenUIThemeProvider>
  );
};
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  jest.clearAllMocks();
  stubMatchMedia();
  mockFetchComponents.mockResolvedValue(components);
});

describe('MIOnlyDetailPage', () => {
  it('marks a valid page noindex, with the connector title', async () => {
    open('/connector/wso2-mi/mi-connector-pulsar');
    await screen.findByText('Supported MI versions');

    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    expect(document.title).toBe('Pulsar - WSO2 Integration Platform Connectors');
  });

  it('shows the connector with an MI badge, the MI description and the MI panel', async () => {
    open('/connector/wso2-mi/mi-connector-pulsar');

    expect(await screen.findByText('Supported MI versions')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Pulsar/ })).toBeInTheDocument();
    expect(screen.getByText('MI')).toBeInTheDocument();
    expect(screen.getByText(/Publish messages to Apache Pulsar topics\./)).toBeInTheDocument();
    expect(screen.getByText('v1.0.4')).toBeInTheDocument();
    expect(mockFetchComponents).toHaveBeenCalledWith(['mi-connector-pulsar', 'mi-inbound-pulsar']);
  });

  it('keeps the switch, with WSO2 Integrator disabled and explained, and MI selected', async () => {
    open('/connector/wso2-mi/mi-connector-pulsar');
    await screen.findByText('Supported MI versions');

    const ballerina = screen.getByRole('button', { name: 'WSO2 Integrator' });
    expect(ballerina).toBeDisabled();
    expect(screen.getByRole('button', { name: 'WSO2 Integrator: MI' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await userEvent.hover(ballerina.parentElement as HTMLElement);
    expect(
      await screen.findByText('Not available: no Ballerina package for this connector')
    ).toBeInTheDocument();
  });

  it('opens the inbound component when its id is in the path, and changes it from the dropdown', async () => {
    open('/connector/wso2-mi/mi-inbound-pulsar');
    expect(await screen.findByText('v2.0.0')).toBeInTheDocument();
    expect(screen.getByText(/Consume messages from Apache Pulsar topics\./)).toBeInTheDocument();
    await settle();

    await userEvent.click(screen.getByLabelText('MI component'));
    await userEvent.click(await screen.findByRole('option', { name: 'Pulsar' }));

    expect(await screen.findByText('v1.0.4')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?component=mi-connector-pulsar');
  });

  it('selects the component from ?component=', async () => {
    open('/connector/wso2-mi/mi-connector-pulsar?component=mi-inbound-pulsar');
    expect(await screen.findByText('v2.0.0')).toBeInTheDocument();
  });

  it('shows "not found" with a way back for an unknown id, and loads nothing', async () => {
    open('/connector/wso2-mi/not-a-connector');

    expect(await screen.findByText('Connector not found')).toBeInTheDocument();
    expect(mockFetchComponents).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Back to store' }));
    expect(await screen.findByText('store home')).toBeInTheDocument();
  });

  it('says so when the MI service has no details for it', async () => {
    mockFetchComponents.mockResolvedValue([]);
    open('/connector/wso2-mi/mi-connector-pulsar');

    expect(
      await screen.findByText('No WSO2 Micro Integrator details are available for this connector.')
    ).toBeInTheDocument();
    // Falls back to the card summary for the overview
    expect(
      screen.getByText(/Publish messages to, and consume messages from, Apache Pulsar/)
    ).toBeInTheDocument();
  });
});
