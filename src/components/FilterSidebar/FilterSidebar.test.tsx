/*
 Copyright (c) 2026 WSO2 LLC. (http://www.wso2.com).

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
import { render, screen, fireEvent, within } from '@testing-library/react';
import FilterSidebar from './FilterSidebar';

jest.mock('@/components/SearchBar', () => () => null);

const filterOptions = {
  areas: ['AI', 'Finance', 'Health'],
  vendors: ['Acme', 'Beta', 'Gamma'],
  types: ['Connector', 'Library'],
};

const renderSidebar = (props: Partial<React.ComponentProps<typeof FilterSidebar>> = {}) =>
  render(
    <FilterSidebar
      filterOptions={filterOptions}
      selectedAreas={[]}
      selectedVendors={[]}
      selectedTypes={[]}
      searchQuery=""
      onSearchChange={() => {}}
      onAreaChange={() => {}}
      onVendorChange={() => {}}
      onTypeChange={() => {}}
      onClearAll={() => {}}
      effectiveMode="light"
      {...props}
    />
  );

// Vendor and Type start collapsed and keep no options in the DOM until opened.
const expandAll = () => {
  ['Vendor', 'Type'].forEach((title) => {
    const header = screen.queryByText(title);
    if (header) fireEvent.click(header);
  });
};

const labels = () =>
  screen.getAllByRole('checkbox', { hidden: true }).map((c) => c.closest('label')!.textContent);

describe('FilterSidebar facet counts', () => {
  it('lists every option, without counts, when counts are unknown', () => {
    renderSidebar({ facetCounts: null });
    expandAll();

    expect(labels()).toEqual([
      'AI',
      'Finance',
      'Health',
      'Acme',
      'Beta',
      'Gamma',
      'Connector',
      'Library',
    ]);
  });

  it('hides options with no results and keeps the usual order', () => {
    renderSidebar({
      facetCounts: {
        areas: { AI: 1, Finance: 5 },
        vendors: { Acme: 2 },
        types: { Library: 3 },
      },
    });
    expandAll();

    expect(labels()).toEqual(['AI', 'Finance', 'Acme', 'Library']);
  });

  it('keeps no options in the DOM while Vendor and Type are collapsed', () => {
    renderSidebar({ facetCounts: null });

    // Only Area, which starts open.
    expect(labels()).toEqual(['AI', 'Finance', 'Health']);

    expandAll();
    expect(labels()).toHaveLength(3 + 3 + 2);
  });

  it('keeps a selected option that now has no results so it can be unticked', () => {
    renderSidebar({
      selectedAreas: ['Health'],
      facetCounts: { areas: { Finance: 2 }, vendors: { Acme: 1 }, types: { Library: 1 } },
    });

    expect(labels().slice(0, 2)).toEqual(['Finance', 'Health']);
  });

  it('hides a section with nothing to choose, but keeps it mounted', () => {
    const { container, rerender } = renderSidebar({
      facetCounts: { areas: { AI: 1 }, vendors: {}, types: {} },
    });

    const accordions = () => [...container.querySelectorAll('.MuiAccordion-root')] as HTMLElement[];
    const vendor = accordions().find((a) => a.textContent?.startsWith('Vendor'))!;
    expect(getComputedStyle(vendor).display).toBe('none');
    expect(getComputedStyle(accordions()[0]).display).not.toBe('none');

    // Options come back: the same section reappears, not a fresh one.
    rerender(
      <FilterSidebar
        filterOptions={filterOptions}
        facetCounts={{ areas: { AI: 1 }, vendors: { Acme: 1 }, types: {} }}
        selectedAreas={[]}
        selectedVendors={[]}
        selectedTypes={[]}
        searchQuery=""
        onSearchChange={() => {}}
        onAreaChange={() => {}}
        onVendorChange={() => {}}
        onTypeChange={() => {}}
        onClearAll={() => {}}
        effectiveMode="light"
      />
    );
    expect(accordions().find((a) => a.textContent?.startsWith('Vendor'))).toBe(vendor);
    expect(getComputedStyle(vendor).display).not.toBe('none');
  });

  it('shows how many options are selected in the section header', () => {
    renderSidebar({
      selectedVendors: ['Acme', 'Beta'],
      facetCounts: { areas: { AI: 1 }, vendors: { Acme: 1, Beta: 1 }, types: { Library: 1 } },
    });

    expect(screen.getByText('(2)')).toBeTruthy();
  });

  it('lists every option however long the list is, leaving scrolling to the section', () => {
    const vendors = Array.from({ length: 30 }, (_, i) => `Vendor${String(i).padStart(2, '0')}`);
    renderSidebar({
      filterOptions: { ...filterOptions, vendors },
      facetCounts: {
        areas: {},
        vendors: Object.fromEntries(vendors.map((v) => [v, 1])),
        types: {},
      },
    });
    expandAll();

    expect(labels()).toHaveLength(30);
    expect(screen.queryByText(/Show .*more/)).toBeNull();
  });

  it('reports the clicked option', () => {
    const onAreaChange = jest.fn();
    renderSidebar({
      onAreaChange,
      facetCounts: { areas: { Finance: 5 }, vendors: {}, types: {} },
    });

    fireEvent.click(
      within(screen.getByText('Finance').closest('label')!).getByRole('checkbox', { hidden: true })
    );

    expect(onAreaChange).toHaveBeenCalledWith('Finance');
  });
});

describe('FilterSidebar profile group', () => {
  it('is not shown unless a profile handler is given', () => {
    renderSidebar();
    expect(screen.queryByText('Profile')).not.toBeInTheDocument();
  });

  it('lists both profiles with their counts, unticked by default', () => {
    renderSidebar({
      onProfileChange: () => {},
      selectedProfiles: [],
      profileCounts: { default: 765, mi: 56 },
    });
    expect(screen.getByText('Profile')).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox', { hidden: true });
    expect(boxes[0].closest('label')!.textContent).toBe('WSO2 Integrator765');
    expect(boxes[1].closest('label')!.textContent).toBe('WSO2 Integrator: MI56');
    expect(boxes[0]).not.toBeChecked();
    expect(boxes[1]).not.toBeChecked();
  });

  it('is the first group, above Area', () => {
    renderSidebar({ onProfileChange: () => {}, profileCounts: { default: 1, mi: 1 } });
    const titles = ['Profile', 'Area'].map((t) => screen.getByText(t));
    expect(
      titles[0].compareDocumentPosition(titles[1]) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('keeps an option with a count of 0 listed, and shows the selected one ticked', () => {
    renderSidebar({
      onProfileChange: () => {},
      selectedProfiles: ['mi'],
      profileCounts: { default: 0, mi: 0 },
    });
    const boxes = screen.getAllByRole('checkbox', { hidden: true });
    expect(boxes).toHaveLength(2 + 3); // two profiles + the three Area options
    expect(boxes[1]).toBeChecked();
  });

  it('reports the profile that was clicked', () => {
    const onProfileChange = jest.fn();
    renderSidebar({ onProfileChange, profileCounts: { default: 5, mi: 2 } });
    fireEvent.click(screen.getAllByRole('checkbox', { hidden: true })[1]);
    expect(onProfileChange).toHaveBeenCalledWith('mi');
  });
});
