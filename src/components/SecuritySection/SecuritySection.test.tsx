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
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SecuritySection from './SecuritySection';
import { fetchPatchInfo, fetchSbomOrgs, fetchVulnerabilityReport } from '@/lib/vulnerabilities';

jest.mock('@/lib/vulnerabilities', () => ({
  ...jest.requireActual('@/lib/vulnerabilities'),
  fetchVulnerabilityReport: jest.fn(),
  fetchSbomOrgs: jest.fn(),
  fetchPatchInfo: jest.fn(),
}));

const mockReport = fetchVulnerabilityReport as jest.Mock;
const mockOrgs = fetchSbomOrgs as jest.Mock;
const mockPatch = fetchPatchInfo as jest.Mock;

const report = {
  scannedDate: '2026-11-06T04:41:32.923Z',
  vulnerabilities: [
    {
      id: 'GHSA-direct',
      aliases: ['CVE-2026-1'],
      severity: 'high',
      summary: 'Direct problem',
      purl: 'pkg:maven/com.google.guava/guava@32.0.1-jre',
      fixedIn: ['33.7.2'],
      introducedVia: ['kafka 4.6.2', 'guava 32.0.1-jre'],
      url: 'https://osv.dev/vulnerability/GHSA-direct',
    },
    {
      id: 'GHSA-indirect',
      aliases: [],
      severity: 'critical',
      summary: 'Indirect problem',
      purl: 'pkg:maven/org.bouncycastle/bcprov-jdk18on@1.80',
      fixedIn: [],
      introducedVia: ['kafka 4.6.2', 'crypto 2.9.2', 'bcprov-jdk18on 1.80'],
      url: 'https://osv.dev/vulnerability/GHSA-indirect',
    },
  ],
};

const renderSection = () =>
  render(<SecuritySection org="ballerinax" name="kafka" version="4.6.2" versions={['4.6.2']} />);

describe('SecuritySection', () => {
  beforeEach(() => {
    mockReport.mockReset();
    mockOrgs.mockReset().mockResolvedValue(new Map([['crypto 2.9.2', 'ballerina']]));
    // kafka itself has no newer patch; crypto 2.9.4 no longer lists the indirect vulnerability.
    mockPatch
      .mockReset()
      .mockImplementation(async (_org: string, name: string) =>
        name === 'crypto'
          ? { known: true, latestPatch: '2.9.4', patchIds: [] }
          : { known: true, patchIds: null }
      );
  });

  it('renders nothing when there is no report', async () => {
    mockReport.mockResolvedValue(null);
    const { container } = renderSection();
    await waitFor(() => expect(mockReport).toHaveBeenCalledWith('ballerinax', 'kafka', '4.6.2'));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows direct and indirect counts as links with severity pills', async () => {
    mockReport.mockResolvedValue(report);
    renderSection();
    expect(await screen.findByText(/Direct vulnerabilities:/)).toBeInTheDocument();
    expect(screen.getByText(/Indirect vulnerabilities:/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '1' })).toHaveLength(2);
    expect(screen.getByText('High 1')).toBeInTheDocument();
    expect(screen.getByText('Critical 1')).toBeInTheDocument();
    expect(screen.getByText(/Checked .* via/)).toBeInTheDocument();
  });

  it('summarises patch status once the lookups finish', async () => {
    mockReport.mockResolvedValue(report);
    renderSection();
    expect(await screen.findByText('1 of them fixed in newer patches')).toBeInTheDocument();
    expect(screen.queryByText('No newer patch yet')).not.toBeInTheDocument();
  });

  it('shows a single "no known vulnerabilities" pill when the report has no findings', async () => {
    mockReport.mockResolvedValue({ ...report, vulnerabilities: [] });
    renderSection();
    expect(await screen.findByText('No known vulnerabilities in libraries')).toBeInTheDocument();
    expect(screen.queryByText(/Direct vulnerabilities:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Indirect vulnerabilities:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a "no known direct vulnerabilities" pill when only indirect ones exist', async () => {
    mockReport.mockResolvedValue({
      ...report,
      vulnerabilities: report.vulnerabilities.filter((v) => v.introducedVia.length > 2),
    });
    renderSection();
    expect(await screen.findByText('No known direct vulnerabilities')).toBeInTheDocument();
    expect(screen.getByText(/Indirect vulnerabilities:/)).toBeInTheDocument();
  });

  it('opens the direct list from the direct count', async () => {
    mockReport.mockResolvedValue(report);
    renderSection();
    const [directLink] = await screen.findAllByRole('button', { name: '1' });
    await userEvent.click(directLink);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Known vulnerabilities')).toBeInTheDocument();
    expect(within(dialog).getByText('Direct problem')).toBeInTheDocument();
    expect(within(dialog).getByText('Fixed in 33.7.2')).toBeInTheDocument();
  });

  it('opens the dialog filtered to a severity when its side-panel pill is clicked', async () => {
    mockReport.mockResolvedValue(report);
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'High 1' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Direct problem')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'High 1' })).toHaveClass(
      'MuiChip-colorPrimary'
    );
  });

  it('groups indirect vulnerabilities by dependency with a patch badge', async () => {
    mockReport.mockResolvedValue(report);
    renderSection();
    const links = await screen.findAllByRole('button', { name: '1' });
    await userEvent.click(links[1]);

    const dialog = await screen.findByRole('dialog');
    const group = await within(dialog).findByText('ballerina/crypto 2.9.2');
    expect(within(dialog).getByText('1 critical')).toBeInTheDocument();
    expect(await within(dialog).findByText('Fixed in 2.9.4')).toBeInTheDocument();
    expect(within(dialog).queryByText('Indirect problem')).not.toBeInTheDocument();

    await userEvent.click(group);
    expect(within(dialog).getByText('Indirect problem')).toBeInTheDocument();
  });
});
