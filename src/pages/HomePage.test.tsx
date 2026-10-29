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
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router-dom';
import HomePage from './HomePage';
import {
  searchPackages,
  fetchFiltersProgressively,
  refreshCatalog,
  getFacetCounts,
} from '@/lib/rest-client';

// Isolate HomePage's own effect-scheduling logic: stub out every child
// component (their internals aren't what this test is about) and mock the
// network layer directly so call counts can be pinned exactly.
jest.mock('@/lib/rest-client', () => ({
  searchPackages: jest.fn(),
  fetchFiltersProgressively: jest.fn(),
  refreshCatalog: jest.fn(),
  getFacetCounts: jest.fn(),
}));
// The Profile filter layer is covered by profile-search.test.ts. Here it passes straight
// through to the mocked search, so the call counts below stay about HomePage's scheduling.
const mockProfilesAsked: unknown[] = [];
jest.mock('@/lib/mi-connector/profile-search', () => ({
  ...jest.requireActual('@/lib/mi-connector/profile-search'),
  searchWithProfile: (params: unknown, profile: unknown) => {
    mockProfilesAsked.push(profile);
    return (jest.requireMock('@/lib/rest-client').searchPackages as jest.Mock)(params);
  },
  getProfileCounts: () => Promise.resolve({ default: 0, mi: 0 }),
}));
jest.mock('@/components/Pagination', () => () => null);
jest.mock('@/components/ConnectorCard', () => () => null);
jest.mock('@/components/WSO2Header', () => () => null);
jest.mock('@/components/Hero', () => () => null);
// FilterSidebar is stubbed but records the props it receives, so a test can
// assert on the filter options HomePage hands to it.
const mockFilterSidebarProps = [] as unknown[];
jest.mock('@/components/FilterSidebar', () => (props: { filterOptions: unknown }) => {
  mockFilterSidebarProps.push(props);
  return null;
});
jest.mock('@/components/SearchBar', () => () => null);
jest.mock('@/components/Footer', () => () => null);
jest.mock('@/components/SelectedFilters', () => () => null);

const mockSearchPackages = searchPackages as jest.Mock;
const mockRefreshCatalog = refreshCatalog as jest.Mock;
const mockGetFacetCounts = getFacetCounts as jest.Mock;
const mockFetchFiltersProgressively = fetchFiltersProgressively as jest.Mock;

describe('HomePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFilterSidebarProps.length = 0;
    mockProfilesAsked.length = 0;
    mockSearchPackages.mockResolvedValue({ packages: [], count: 0, offset: 0, limit: 30 });
    mockFetchFiltersProgressively.mockResolvedValue({ areas: [], vendors: [], types: [] });
    mockRefreshCatalog.mockResolvedValue(false);
    mockGetFacetCounts.mockResolvedValue(null);
  });

  it('fetches the initial page exactly once on mount, not twice', async () => {
    // Regression test for a pre-existing bug that predates the ranking-v2
    // branch entirely: the mount-only effect calls fetchPageData() directly,
    // then flips initialLoading to false -- which on its own satisfied the
    // separate "fetch when filters/sort/page change" effect's guard and
    // fired a second, fully redundant fetch for identical params on every
    // page load. This was invisible while the default sort ('pullCount-desc')
    // took a single cheap request; it became a real, visible problem once
    // that sort started requiring a multi-request full-fetch cycle (see
    // skipInitialLoadingFetchRef in HomePage.tsx). Pinning the exact call
    // count here (not "at least once" or "a reasonable number of times") is
    // the point -- a return of the duplicate must fail this test.
    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockFetchFiltersProgressively).toHaveBeenCalledTimes(1);
    });

    expect(mockSearchPackages).toHaveBeenCalledTimes(1);
  });

  it('re-fetches the page once when new packages arrive after the first render', async () => {
    // The priority list renders instantly; packages released since its build arrive
    // through a live check afterwards (refreshCatalog) and must appear without a reload.
    mockRefreshCatalog.mockResolvedValue(true);

    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockSearchPackages).toHaveBeenCalledTimes(2);
    });
  });

  it('does not re-fetch when the live check finds nothing new', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockRefreshCatalog).toHaveBeenCalledTimes(1);
    });
    await act(async () => {});

    expect(mockSearchPackages).toHaveBeenCalledTimes(1);
  });

  it('hands the sidebar the facet counts for the current filters', async () => {
    const counts = { areas: { Finance: 2 }, vendors: { Acme: 2 }, types: {} };
    mockGetFacetCounts.mockResolvedValue(counts);

    render(
      <MemoryRouter initialEntries={['/?vendors=Acme']}>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      const last = mockFilterSidebarProps[mockFilterSidebarProps.length - 1] as {
        facetCounts: unknown;
      };
      expect(last.facetCounts).toEqual(counts);
    });
    expect(mockGetFacetCounts).toHaveBeenCalledWith(
      expect.objectContaining({ vendors: ['Acme'], areas: [], types: [] })
    );
  });

  it('recounts the options when the live check adds new packages', async () => {
    // The live check lands after the first render, as it does in practice.
    let finishCheck: (changed: boolean) => void = () => {};
    mockRefreshCatalog.mockReturnValue(new Promise<boolean>((resolve) => (finishCheck = resolve)));

    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockGetFacetCounts).toHaveBeenCalledTimes(1);
    });
    await act(async () => finishCheck(true));

    await waitFor(() => {
      expect(mockGetFacetCounts).toHaveBeenCalledTimes(2);
    });
  });

  it('still fetches again on a real filter/sort/page change after mount', async () => {
    // Guards against a fix that's too aggressive: skipInitialLoadingFetchRef
    // must only suppress the one mount-caused duplicate, not any later
    // legitimate fetch. MemoryRouter's initialEntries only applies at
    // construction (a rerender with new initialEntries does NOT navigate),
    // so a real programmatic navigation is used here via createMemoryRouter,
    // to actually change the URL search params -- which changes
    // fetchPageData's dependencies (sortBy) and must trigger a new fetch.
    const router = createMemoryRouter([{ path: '*', element: <HomePage /> }], {
      initialEntries: ['/'],
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(mockSearchPackages).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await router.navigate('/?sort=date-desc');
    });

    await waitFor(() => {
      expect(mockSearchPackages.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('shows the predefined Type list, ignoring fetched types (e.g. Util)', async () => {
    mockFetchFiltersProgressively.mockResolvedValue({
      areas: [],
      vendors: ['Acme'],
      types: ['Util', 'Connector', 'Something New'],
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockFilterSidebarProps.length).toBeGreaterThan(0);
    });

    const { filterOptions } = mockFilterSidebarProps[mockFilterSidebarProps.length - 1] as {
      filterOptions: { types: string[]; vendors: string[] };
    };
    expect(filterOptions.types).toEqual([
      'Connector',
      'Data Loader',
      'Driver',
      'Embedding Provider',
      'Knowledge Base',
      'Library',
      'Model Provider',
      'Short Term Memory Store',
      'Trigger',
      'Vector Store',
    ]);
    expect(filterOptions.vendors).toEqual(['Acme']);
  });

  it('clamps an out-of-range ?page= to the last page on initial load', async () => {
    // /?page=999 against 753 results at the default page size of 30 has 26
    // pages. The first request (offset 29940) comes back empty; HomePage must
    // refetch the last page (offset 750) and write page 26 back to the URL.
    const total = 753;
    mockSearchPackages.mockImplementation(async ({ offset, limit }) => ({
      packages: offset >= total ? [] : [{ name: `pkg-${offset}` }],
      count: total,
      offset,
      limit,
    }));

    const router = createMemoryRouter([{ path: '*', element: <HomePage /> }], {
      initialEntries: ['/?page=999'],
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(router.state.location.search).toBe('?page=26');
    });

    const offsets = mockSearchPackages.mock.calls.map(([args]) => args.offset);
    expect(offsets).toEqual([29940, 750]);
  });

  it.each([
    ['/', null],
    ['/?profile=mi', 'mi'],
    ['/?profile=default', 'default'],
    ['/?profile=mi,default', null],
    ['/?profile=bogus', null],
  ])('searches with the profile from the URL: %s', async (url, expected) => {
    render(
      <MemoryRouter initialEntries={[url]}>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockSearchPackages).toHaveBeenCalled();
    });
    expect(mockProfilesAsked[0]).toBe(expected);
  });

  it('passes the profile choice and its counts to the sidebar', async () => {
    render(
      <MemoryRouter initialEntries={['/?profile=mi']}>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockFilterSidebarProps.length).toBeGreaterThan(0);
    });
    const last = mockFilterSidebarProps[mockFilterSidebarProps.length - 1] as {
      selectedProfiles: string[];
      onProfileChange: unknown;
    };
    expect(last.selectedProfiles).toEqual(['mi']);
    expect(typeof last.onProfileChange).toBe('function');
  });
});
