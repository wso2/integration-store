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
import SearchBar from '@/components/SearchBar';

interface FilterSidebarProps {
  filterOptions: FilterOptions;
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
}

export default function FilterSidebar({
  filterOptions,
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
}: FilterSidebarProps) {
  const [expandedArea, setExpandedArea] = useState(true);
  const [expandedType, setExpandedType] = useState(false);
  const [expandedVendor, setExpandedVendor] = useState(false);

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
        {/* Area Filter */}
        <Accordion
          expanded={expandedArea}
          onChange={() => setExpandedArea(!expandedArea)}
          disableGutters
          sx={{
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
              Area
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
              {filterOptions.areas.map((area) => (
                <FormControlLabel
                  key={area}
                  control={
                    <Checkbox
                      size="small"
                      checked={selectedAreas.includes(area)}
                      onChange={() => onAreaChange(area)}
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
                    <Typography variant="body2" fontSize={14}>
                      {area}
                    </Typography>
                  }
                  sx={{
                    mx: 0,
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

        {/* Vendor Filter */}
        <Accordion
          expanded={expandedVendor}
          onChange={() => setExpandedVendor(!expandedVendor)}
          disableGutters
          sx={{
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
              Vendor
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
              {filterOptions.vendors.map((vendor) => (
                <FormControlLabel
                  key={vendor}
                  control={
                    <Checkbox
                      size="small"
                      checked={selectedVendors.includes(vendor)}
                      onChange={() => onVendorChange(vendor)}
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
                    <Typography variant="body2" fontSize={14}>
                      {vendor}
                    </Typography>
                  }
                  sx={{
                    mx: 0,
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

        <Accordion
          expanded={expandedType}
          onChange={() => setExpandedType(!expandedType)}
          disableGutters
          sx={{
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
              Type
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
              {filterOptions.types.map((type) => (
                <FormControlLabel
                  key={type}
                  control={
                    <Checkbox
                      size="small"
                      checked={selectedTypes.includes(type)}
                      onChange={() => onTypeChange(type)}
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
                    <Typography variant="body2" fontSize={14}>
                      {type}
                    </Typography>
                  }
                  sx={{
                    mx: 0,
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
      </Box>
    </Paper>
  );
}
