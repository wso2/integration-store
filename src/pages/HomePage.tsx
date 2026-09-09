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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useColorScheme } from '@wso2/oxygen-ui';
import {
  Box,
  Container,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Drawer,
  IconButton,
  Button,
} from '@wso2/oxygen-ui';
import { ChevronRight, Filter } from '@wso2/oxygen-ui-icons-react';
import { BallerinaPackage, FilterOptions } from '@/types/connector';
import { searchPackages, fetchFiltersProgressively, SortOption } from '@/lib/rest-client';
import Pagination from '@/components/Pagination';
import ConnectorCard from '@/components/ConnectorCard';
import WSO2Header from '@/components/WSO2Header';
import Hero from '@/components/Hero';
import FilterSidebar from '@/components/FilterSidebar';
import SearchBar from '@/components/SearchBar';
import Footer from '@/components/Footer';
import SelectedFilters from '@/components/SelectedFilters';

// WSO2 brand colors
const WSO2_ORANGE = '#FF7300';

// Valid sort options for validation
const VALID_SORT_OPTIONS: SortOption[] = [
  'name-asc',
  'name-desc',
  'pullCount-desc',
  'pullCount-asc',
  'date-desc',
  'date-asc',
];

// Default values
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 30;
const DEFAULT_SORT: SortOption = 'pullCount-desc';
const MAX_PAGE_SIZE = 100;

/**
 * Validate and parse page number from URL parameter
 */
function parsePageParam(value: string | null): number {
  if (!value) return DEFAULT_PAGE;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_PAGE;
  }
  return Math.floor(parsed);
}

/**
 * Validate and parse page size from URL parameter
 */
function parsePageSizeParam(value: string | null): number {
  if (!value) return DEFAULT_PAGE_SIZE;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.max(1, Math.floor(parsed)), MAX_PAGE_SIZE);
}

/**
 * Validate sort option from URL parameter
 */
function parseSortParam(value: string | null): SortOption {
  if (!value) return DEFAULT_SORT;
  if (VALID_SORT_OPTIONS.includes(value as SortOption)) {
    return value as SortOption;
  }
  return DEFAULT_SORT;
}

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { mode } = useColorScheme();

  // Handle system mode by detecting actual system preference
  const [effectiveMode, setEffectiveMode] = useState<'light' | 'dark'>(() => {
    if (mode === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode as 'light' | 'dark';
  });

  // Update effectiveMode when mode changes and subscribe to OS theme changes if mode is 'system'
  useEffect(() => {
    let m: MediaQueryList | null = null;
    let handler: ((e: MediaQueryListEvent) => void) | null = null;
    if (mode === 'system') {
      m = window.matchMedia('(prefers-color-scheme: dark)');
      setEffectiveMode(m.matches ? 'dark' : 'light');
      handler = (e: MediaQueryListEvent) => {
        setEffectiveMode(e.matches ? 'dark' : 'light');
      };
      if (m.addEventListener) {
        m.addEventListener('change', handler);
      } else if (m.addListener) {
        m.addListener(handler);
      }
    } else {
      setEffectiveMode(mode as 'light' | 'dark');
    }
    return () => {
      if (m && handler) {
        if (m.removeEventListener) {
          m.removeEventListener('change', handler);
        } else if (m.removeListener) {
          m.removeListener(handler);
        }
      }
    };
  }, [mode]);

  const [connectors, setConnectors] = useState<BallerinaPackage[]>([]);
  const predefinedAreas = [
    'Built-in',
    'CRM & Sales',
    'Finance & Accounting',
    'AI & Machine Learning',
    'E-Commerce',
    'Database',
    'Communication',
    'ERP & Business Operations',
    'Productivity & Collaboration',
    'Marketing & Social Media',
    'Cloud & Infrastructure',
    'Security & Identity',
    'Developer Tools',
    'Storage & File Management',
    'Messaging',
    'HRMS',
    'Healthcare',
  ];
  const [filterOptions, setFilterOptionsState] = useState<FilterOptions>({
    areas: predefinedAreas,
    vendors: [],
    types: [],
  });
  const setFilterOptions = (filters: FilterOptions) => {
    setFilterOptionsState({ ...filters, areas: predefinedAreas });
  };
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Search input is immediate (for responsive typing), debouncedQuery drives API calls
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') || '');
  const [debouncedQuery, setDebouncedQuery] = useState(() => searchParams.get('search') || '');

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>(
    () => searchParams.get('areas')?.split(',').filter(Boolean) || []
  );
  const [selectedVendors, setSelectedVendors] = useState<string[]>(
    () => searchParams.get('vendors')?.split(',').filter(Boolean) || []
  );
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    () => searchParams.get('types')?.split(',').filter(Boolean) || []
  );
  const [currentPage, setCurrentPage] = useState(() => parsePageParam(searchParams.get('page')));
  const [pageSize, setPageSize] = useState(() => parsePageSizeParam(searchParams.get('size')));
  const [sortBy, setSortBy] = useState<SortOption>(() => parseSortParam(searchParams.get('sort')));

  // Ref to discard stale fetch responses
  const fetchIdRef = useRef(0);
  // Ref to track if initial fetch is done
  const initialFetchDoneRef = useRef(false);
  // Ref to track if component just mounted (to avoid resetting page on mount)
  const isMountedRef = useRef(false);
  // Ref to prevent URL->State sync from running (when URL changes from external source)
  const syncingFromUrlRef = useRef(false);
  // Ref to prevent State->URL updates from triggering URL->State sync
  const updatingUrlFromStateRef = useRef(false);
  // Ref to track previous URL params
  const prevSearchParamsRef = useRef<string>('');

  // Mobile filter drawer state
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Toggle filter selection
  const toggleAreaFilter = (area: string) => {
    setSelectedAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const toggleTypeFilter = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleVendorFilter = (vendor: string) => {
    setSelectedVendors((prev) =>
      prev.includes(vendor) ? prev.filter((v) => v !== vendor) : [...prev, vendor]
    );
  };

  const clearAllFilters = () => {
    setSelectedAreas([]);
    setSelectedTypes([]);
    setSelectedVendors([]);
    setSearchInput('');
  };

  // Fetch page data from REST API
  const fetchPageData = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    try {
      setLoading(true);
      setError(null);

      const response = await searchPackages({
        query: debouncedQuery,
        areas: selectedAreas,
        vendors: selectedVendors,
        types: selectedTypes,
        offset: (currentPage - 1) * pageSize,
        limit: pageSize,
        sort: sortBy,
      });

      // Discard stale responses
      if (fetchId !== fetchIdRef.current) return;

      setConnectors(response.packages);
      setTotalCount(response.count);
      setLoading(false);
    } catch (error) {
      if (fetchId !== fetchIdRef.current) return;
      console.error('Failed to fetch page data:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to load connectors. Please refresh the page or try again later.';
      setError(errorMessage);
      setLoading(false);
    }
  }, [
    debouncedQuery,
    selectedAreas,
    selectedVendors,
    selectedTypes,
    currentPage,
    pageSize,
    sortBy,
  ]);

  // Load filter options once on mount, then load first page
  useEffect(() => {
    const initialize = async () => {
      try {
        setInitialLoading(true);

        // Phase 1: Load first page immediately (fast)
        await fetchPageData();
        initialFetchDoneRef.current = true;

        // Phase 2: Get filter options (cached or progressive)
        const filters = await fetchFiltersProgressively(undefined, (updatedFilters) => {
          // Background update when complete filters are fetched
          setFilterOptions(updatedFilters);
        });
        setFilterOptions(filters);

        setInitialLoading(false);
      } catch (error) {
        console.error('Failed to initialize:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to load filters.';
        setError(errorMessage);
        setInitialLoading(false);
      }
    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trigger server-side fetch when filters/sort/page change (after initial loading)
  useEffect(() => {
    if (!initialLoading) {
      fetchPageData();
    }
  }, [initialLoading, fetchPageData]);

  // Sync URL params to state (URL -> State)
  useEffect(() => {
    // Skip if URL was just updated by state
    if (updatingUrlFromStateRef.current) {
      updatingUrlFromStateRef.current = false;
      prevSearchParamsRef.current = searchParams.toString();
      return;
    }

    const currentParamsString = searchParams.toString();

    // Only update if URL actually changed
    if (currentParamsString === prevSearchParamsRef.current) {
      return;
    }

    prevSearchParamsRef.current = currentParamsString;
    syncingFromUrlRef.current = true;

    const page = parsePageParam(searchParams.get('page'));
    const size = parsePageSizeParam(searchParams.get('size'));
    const sort = parseSortParam(searchParams.get('sort'));
    const search = searchParams.get('search') || '';
    const areas = searchParams.get('areas')?.split(',').filter(Boolean) || [];
    const vendors = searchParams.get('vendors')?.split(',').filter(Boolean) || [];
    const types = searchParams.get('types')?.split(',').filter(Boolean) || [];
    setCurrentPage(page);
    setPageSize(size);
    setSortBy(sort);
    setSearchInput(search);
    setDebouncedQuery(search);
    setSelectedAreas(areas);
    setSelectedVendors(vendors);
    setSelectedTypes(types);

    // Reset flag after React's state batching completes
    queueMicrotask(() => {
      syncingFromUrlRef.current = false;
    });
  }, [searchParams]);

  // Sync state to URL params (State -> URL)
  useEffect(() => {
    // Skip if we're currently syncing from URL to avoid infinite loop
    if (syncingFromUrlRef.current) {
      return;
    }

    const params = new URLSearchParams();

    if (currentPage > 1) params.set('page', currentPage.toString());
    if (pageSize !== 30) params.set('size', pageSize.toString());
    if (debouncedQuery) params.set('search', debouncedQuery);
    if (selectedAreas.length > 0) params.set('areas', selectedAreas.join(','));
    if (selectedVendors.length > 0) params.set('vendors', selectedVendors.join(','));
    if (selectedTypes.length > 0) params.set('types', selectedTypes.join(','));
    if (sortBy !== 'pullCount-desc') params.set('sort', sortBy);

    const newParamsString = params.toString();
    const currentParamsString = searchParams.toString();

    // Only update URL if params actually changed (prevents stuck flag on no-op updates)
    if (newParamsString !== currentParamsString) {
      // Mark that we're updating URL from state
      updatingUrlFromStateRef.current = true;
      setSearchParams(params, { replace: true });
    }
  }, [
    currentPage,
    pageSize,
    debouncedQuery,
    selectedAreas,
    selectedVendors,
    selectedTypes,
    sortBy,
    searchParams,
    setSearchParams,
  ]);

  // Reset to page 1 when filters change (but not on mount or when syncing from URL)
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    // Don't reset page when syncing from URL
    if (syncingFromUrlRef.current) {
      return;
    }
    setCurrentPage(1);
  }, [selectedAreas, selectedVendors, selectedTypes, debouncedQuery, pageSize]);

  // Scroll to top when page changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [currentPage]);

  // Update meta tags dynamically based on search/filters
  useEffect(() => {
    let pageTitle = 'WSO2 Integration Platform Connectors and Pre-built Integrations';
    let description =
      'Discover and integrate with 600+ pre-built Ballerina & MI connectors for popular services and platforms. Browse connectors for AWS, Azure, Google Cloud, Salesforce, Twilio, and more.';

    if (debouncedQuery) {
      pageTitle = `Search: "${debouncedQuery}" - WSO2 Integration Platform Connectors and Pre-built Integrations`;
      description = `Search results for "${debouncedQuery}" - Find Ballerina connectors matching your query.`;
    } else if (selectedAreas.length > 0 || selectedVendors.length > 0 || selectedTypes.length > 0) {
      const filters = [...selectedAreas, ...selectedVendors, ...selectedTypes];
      pageTitle = `${filters.join(', ')} Connectors - WSO2 Integration Platform Connectors and Pre-built Integrations`;
      description = `Browse ${filters.join(', ')} connectors for Ballerina integration.`;
    }

    document.title = pageTitle;

    const updateMetaTag = (selector: string, content: string) => {
      let tag = document.querySelector(selector);
      if (tag) {
        tag.setAttribute('content', content);
      } else {
        // Parse selector to create new tag (e.g., "meta[name="robots"]")
        const match = selector.match(/^(\w+)\[(\w+)=["']([^"']+)["']\]$/);
        if (match) {
          const [, tagName, attrName, attrValue] = match;
          tag = document.createElement(tagName);
          tag.setAttribute(attrName, attrValue);
          tag.setAttribute('content', content);
          document.head.appendChild(tag);
        }
      }
    };

    updateMetaTag('meta[name="description"]', description);
    updateMetaTag('meta[name="title"]', pageTitle);
    updateMetaTag('meta[property="og:title"]', pageTitle);
    updateMetaTag('meta[property="og:description"]', description);
    updateMetaTag('meta[name="twitter:title"]', pageTitle);
    updateMetaTag('meta[name="twitter:description"]', description);

    // Set robots meta tag based on hostname
    const robotsContent = window.location.hostname.includes('wso2.com')
      ? 'index, follow'
      : 'noindex';
    updateMetaTag('meta[name="robots"]', robotsContent);
  }, [debouncedQuery, selectedAreas, selectedVendors, selectedTypes]);

  return (
    <>
      {/* Header */}
      <WSO2Header effectiveMode={effectiveMode} />

      {/* Hero Banner */}
      <Hero effectiveMode={effectiveMode} />

      <Box sx={{ minHeight: '100vh' }}>
        {/* Initial Loading State */}
        {initialLoading && (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
            <CircularProgress />
          </Box>
        )}

        {/* Main Content */}
        {!initialLoading && (
          <Container maxWidth="xl" sx={{ py: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4 }}>
              {/* Sidebar Filters - Hidden on mobile */}
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                <FilterSidebar
                  filterOptions={filterOptions}
                  selectedAreas={selectedAreas}
                  selectedVendors={selectedVendors}
                  selectedTypes={selectedTypes}
                  searchQuery={searchInput}
                  onSearchChange={setSearchInput}
                  onAreaChange={toggleAreaFilter}
                  onVendorChange={toggleVendorFilter}
                  onTypeChange={toggleTypeFilter}
                  onClearAll={clearAllFilters}
                  effectiveMode={effectiveMode}
                />
              </Box>

              {/* Main Content Area */}
              <Box sx={{ flex: 1 }}>
                {/* Error State */}
                {error && (
                  <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                  </Alert>
                )}

                {/* Mobile Search and Filter Bar - Always visible on mobile */}
                <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 1, mb: 2.5 }}>
                  <Box sx={{ flex: 1 }}>
                    <SearchBar
                      value={searchInput}
                      onChange={setSearchInput}
                      effectiveMode={effectiveMode}
                    />
                  </Box>
                  <Button
                    variant="outlined"
                    startIcon={<Filter size={16} />}
                    onClick={() => setMobileFilterOpen(true)}
                    sx={{
                      minWidth: 'auto',
                      px: 2,
                      borderColor: effectiveMode === 'dark' ? '#ffffff33' : '#E5E7EB',
                      color: effectiveMode === 'dark' ? '#FFFFFF' : '#000000',
                      '&:hover': {
                        borderColor: '#FF7300',
                        bgcolor: 'transparent',
                      },
                    }}
                  >
                    Filter
                  </Button>
                </Box>

                {totalCount === 0 && !loading ? (
                  <>
                    {/* Selected Filters (always show if active) */}
                    <SelectedFilters
                      selectedAreas={selectedAreas}
                      selectedTypes={selectedTypes}
                      selectedVendors={selectedVendors}
                      onAreaDelete={toggleAreaFilter}
                      onTypeDelete={toggleTypeFilter}
                      onVendorDelete={toggleVendorFilter}
                      onClearAll={clearAllFilters}
                      WSO2_ORANGE={WSO2_ORANGE}
                      effectiveMode={effectiveMode}
                    />

                    <Box
                      display="flex"
                      flexDirection="column"
                      alignItems="center"
                      justifyContent="center"
                      minHeight={300}
                    >
                      <Typography variant="h6" gutterBottom>
                        No connectors found
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Try adjusting your search or filters
                      </Typography>
                    </Box>
                  </>
                ) : (
                  <>
                    {/* Top Pagination Bar */}
                    <Paper
                      sx={{
                        p: 1.5,
                        mb: 2.5,
                        bgcolor: effectiveMode === 'dark' ? '#18181B' : '#FFFFFF',
                        border: effectiveMode === 'dark' ? 'none' : '1px solid #E5E7EB',
                        boxShadow:
                          effectiveMode === 'dark' ? 'none' : '0 1px 2px 0 rgb(0 0 0 / 0.05)',
                      }}
                    >
                      <Pagination
                        currentPage={currentPage}
                        totalItems={totalCount}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={setPageSize}
                        sortBy={sortBy}
                        onSortChange={setSortBy}
                        pageSizeOptions={[10, 30, 50, 100]}
                      />
                    </Paper>

                    {/* Selected Filters (always show if active) */}
                    <SelectedFilters
                      selectedAreas={selectedAreas}
                      selectedTypes={selectedTypes}
                      selectedVendors={selectedVendors}
                      onAreaDelete={toggleAreaFilter}
                      onTypeDelete={toggleTypeFilter}
                      onVendorDelete={toggleVendorFilter}
                      onClearAll={clearAllFilters}
                      WSO2_ORANGE={WSO2_ORANGE}
                      effectiveMode={effectiveMode}
                    />

                    {/* Loading Overlay */}
                    {loading && (
                      <Box display="flex" justifyContent="center" alignItems="center" py={4}>
                        <CircularProgress />
                      </Box>
                    )}

                    {/* Cards Grid */}
                    {!loading && (
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: {
                            xs: '1fr',
                            sm: 'repeat(2, 1fr)',
                            lg: 'repeat(3, 1fr)',
                          },
                          gap: 2.5,
                        }}
                      >
                        {connectors.map((connector) => (
                          <ConnectorCard
                            key={`${connector.name}-${connector.version}`}
                            connector={connector}
                            effectiveMode={effectiveMode}
                          />
                        ))}
                      </Box>
                    )}

                    {/* Bottom Pagination Bar */}
                    <Paper
                      sx={{
                        p: 1.5,
                        mt: 3,
                        bgcolor: effectiveMode === 'dark' ? '#18181B' : '#FFFFFF',
                        border: effectiveMode === 'dark' ? 'none' : '1px solid #E5E7EB',
                        boxShadow:
                          effectiveMode === 'dark' ? 'none' : '0 1px 2px 0 rgb(0 0 0 / 0.05)',
                      }}
                    >
                      <Pagination
                        currentPage={currentPage}
                        totalItems={totalCount}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={setPageSize}
                        sortBy={sortBy}
                        onSortChange={setSortBy}
                        pageSizeOptions={[10, 30, 50, 100]}
                      />
                    </Paper>
                  </>
                )}
              </Box>
            </Box>
          </Container>
        )}
      </Box>

      {/* Mobile Filter Drawer */}
      <Drawer
        anchor="right"
        open={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            width: '85%',
            maxWidth: 360,
            bgcolor: effectiveMode === 'dark' ? '#18181B' : '#FFFFFF',
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}
          >
            <Typography variant="h6" fontWeight={600}>
              Filters
            </Typography>
            <IconButton onClick={() => setMobileFilterOpen(false)} size="small">
              <ChevronRight />
            </IconButton>
          </Box>

          <FilterSidebar
            filterOptions={filterOptions}
            selectedAreas={selectedAreas}
            selectedVendors={selectedVendors}
            selectedTypes={selectedTypes}
            searchQuery=""
            onSearchChange={() => {}}
            onAreaChange={toggleAreaFilter}
            onVendorChange={toggleVendorFilter}
            onTypeChange={toggleTypeFilter}
            onClearAll={clearAllFilters}
            effectiveMode={effectiveMode}
            hideSearch={true}
          />
        </Box>
      </Drawer>

      {/* Footer */}
      <Footer effectiveMode={effectiveMode} />
    </>
  );
}
