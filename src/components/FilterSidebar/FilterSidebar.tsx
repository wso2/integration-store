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

import React, { useState } from 'react';
import {
  Box,
  Typography,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Paper,
} from '@wso2/oxygen-ui';
import { ChevronRight } from '@wso2/oxygen-ui-icons-react';
import { FilterOptions } from '@/types/connector';
import type { FacetCounts } from '@/lib/rest-client';
import type { ProfileCounts, ProfileFilter } from '@/lib/mi-connector/profile-search';
import SearchBar from '@/components/SearchBar';

interface FilterSidebarProps {
  filterOptions: FilterOptions;
  /**
   * How many results each option would give. When present, options with none are hidden
   * (selected ones stay so they can be unticked), and a section with nothing left to
   * choose is hidden too. When null/undefined every option is listed, as before.
   */
  facetCounts?: FacetCounts | null;
  selectedAreas: string[];
  selectedVendors: string[];
  selectedTypes: string[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onAreaChange: (area: string) => void;
  onVendorChange: (vendor: string) => void;
  onTypeChange: (type: string) => void;
  onClearAll: () => void;
  effectiveMode: 'light' | 'dark';
  hideSearch?: boolean;
  /** Profile group at the top of the sidebar; shown when onProfileChange is given. */
  selectedProfiles?: ProfileFilter[];
  profileCounts?: ProfileCounts | null;
  onProfileChange?: (profile: ProfileFilter) => void;
}

interface FilterSectionProps {
  title: string;
  options: string[];
  counts?: Record<string, number>;
  selected: string[];
  onToggle: (option: string) => void;
  defaultExpanded: boolean;
  effectiveMode: 'light' | 'dark';
  /** Text shown for an option; defaults to the option itself. */
  labelOf?: (option: string) => string;
  /** Show each option's count next to it, and keep options whose count is 0. */
  showCounts?: boolean;
}

/**
 * Options to list: with counts, those that would leave results plus the selected ones
 * (so they can be unticked), in their usual order. Without counts, all of them.
 */
function visibleOptions(
  options: string[],
  selected: string[],
  counts?: Record<string, number>
): string[] {
  if (!counts) return options;
  return options.filter((option) => (counts[option] ?? 0) > 0 || selected.includes(option));
}

const PROFILE_OPTIONS: string[] = ['default', 'mi'];
const PROFILE_LABELS: Record<ProfileFilter, string> = {
  default: 'WSO2 Integrator',
  mi: 'WSO2 Integrator: MI',
};

function FilterSection({
  title,
  options,
  counts,
  selected,
  onToggle,
  defaultExpanded,
  effectiveMode,
  labelOf,
  showCounts = false,
}: FilterSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const visible = showCounts ? options : visibleOptions(options, selected, counts);
  // Nothing to choose from and nothing to untick. The section is hidden, not unmounted,
  // so it keeps its expanded/collapsed state for when options come back.
  const empty = !showCounts && !!counts && visible.length === 0;

  return (
    <Accordion
      expanded={expanded}
      onChange={() => setExpanded(!expanded)}
      disableGutters
      // A collapsed section keeps none of its options in the DOM. Vendor alone has ~200, and
      // every one is re-rendered (and restyled) on each theme switch otherwise.
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={{
        display: empty ? 'none' : undefined,
        bgcolor: effectiveMode === 'dark' ? 'rgba(39, 39, 46, 0.5)' : '#F9FAFB',
        borderRadius: '8px',
        boxShadow: 'none',
        border: 'none',
        '&:before': {
          display: 'none',
        },
      }}
    >
      <AccordionSummary
        expandIcon={<ChevronRight size={16} />}
        sx={{
          '& .MuiAccordionSummary-expandIconWrapper': {
            transition: 'transform 0.2s',
          },
          '& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': {
            transform: 'rotate(90deg)',
          },
        }}
      >
        <Typography variant="body2" fontSize={14} fontWeight={500}>
          {title}
          {selected.length > 0 && (
            <Typography
              component="span"
              variant="body2"
              fontSize={14}
              fontWeight={500}
              sx={{ color: '#FF7300', ml: 0.75 }}
            >
              ({selected.length})
            </Typography>
          )}
        </Typography>
      </AccordionSummary>
      <AccordionDetails
        sx={{
          pt: 0,
          maxHeight: '300px',
          overflowY: 'auto',
        }}
      >
        <FormGroup>
          {visible.map((option) => (
            <FormControlLabel
              key={option}
              control={
                <Checkbox
                  size="small"
                  checked={selected.includes(option)}
                  onChange={() => onToggle(option)}
                  sx={{
                    padding: 0,
                    color: '#52525B',
                    '&.Mui-checked': {
                      color: '#FF7300',
                    },
                    '& .MuiSvgIcon-root': {
                      fontSize: 16,
                    },
                  }}
                />
              }
              label={
                showCounts ? (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <Typography variant="body2" fontSize={14}>
                      {labelOf ? labelOf(option) : option}
                    </Typography>
                    <Typography variant="body2" fontSize={13} color="text.secondary">
                      {counts?.[option]}
                    </Typography>
                  </Box>
                ) : (
                  <Typography variant="body2" fontSize={14}>
                    {labelOf ? labelOf(option) : option}
                  </Typography>
                )
              }
              slotProps={
                showCounts ? { typography: { component: 'div', sx: { flex: 1 } } } : undefined
              }
              sx={{
                mx: 0,
                width: showCounts ? '100%' : undefined,
                px: 1,
                py: 0.75,
                borderRadius: '6px',
                gap: 1,
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                '&:hover': {
                  bgcolor: effectiveMode === 'dark' ? '#3F3F46' : '#E5E7EB',
                },
              }}
            />
          ))}
        </FormGroup>
      </AccordionDetails>
    </Accordion>
  );
}

export default function FilterSidebar({
  filterOptions,
  facetCounts,
  selectedAreas,
  selectedVendors,
  selectedTypes,
  searchQuery,
  onSearchChange,
  onAreaChange,
  onVendorChange,
  onTypeChange,
  effectiveMode,
  hideSearch = false,
  selectedProfiles = [],
  profileCounts,
  onProfileChange,
}: FilterSidebarProps) {
  return (
    <Paper
      sx={{
        width: { xs: '100%', md: 288 },
        flexShrink: 0,
        p: 2.5,
        height: 'fit-content',
        bgcolor: effectiveMode === 'dark' ? '#18181B' : '#FFFFFF',
        border: effectiveMode === 'dark' ? 'none' : '1px solid #E5E7EB',
        boxShadow: effectiveMode === 'dark' ? 'none' : '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      }}
    >
      {/* Search - conditionally rendered */}
      {!hideSearch && (
        <SearchBar value={searchQuery} onChange={onSearchChange} effectiveMode={effectiveMode} />
      )}

      {/* Filter Accordions */}
      <Box sx={{ mt: hideSearch ? 0 : 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {onProfileChange && (
          <FilterSection
            title="Profile"
            options={PROFILE_OPTIONS}
            selected={selectedProfiles}
            onToggle={(option) => onProfileChange(option as ProfileFilter)}
            defaultExpanded={true}
            effectiveMode={effectiveMode}
            labelOf={(option) => PROFILE_LABELS[option as ProfileFilter]}
            showCounts
            counts={
              profileCounts ? { default: profileCounts.default, mi: profileCounts.mi } : undefined
            }
          />
        )}
        <FilterSection
          title="Area"
          options={filterOptions.areas}
          counts={facetCounts?.areas}
          selected={selectedAreas}
          onToggle={onAreaChange}
          defaultExpanded={true}
          effectiveMode={effectiveMode}
        />
        <FilterSection
          title="Vendor"
          options={filterOptions.vendors}
          counts={facetCounts?.vendors}
          selected={selectedVendors}
          onToggle={onVendorChange}
          defaultExpanded={false}
          effectiveMode={effectiveMode}
        />
        <FilterSection
          title="Type"
          options={filterOptions.types}
          counts={facetCounts?.types}
          selected={selectedTypes}
          onToggle={onTypeChange}
          defaultExpanded={false}
          effectiveMode={effectiveMode}
        />
      </Box>
    </Paper>
  );
}
