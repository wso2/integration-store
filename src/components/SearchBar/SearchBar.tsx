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
import { TextField, InputAdornment } from '@wso2/oxygen-ui';
import { Search as SearchIcon } from '@wso2/oxygen-ui-icons-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Unused: colours now follow the theme. Kept so existing callers keep compiling. */
  effectiveMode?: 'light' | 'dark';
}

export default function SearchBar({
  value,
  onChange,
  placeholder = 'Search connectors...',
}: SearchBarProps) {
  return (
    <TextField
      fullWidth
      size="small"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputProps={{
        'aria-label': placeholder,
      }}
      sx={{
        '& .MuiOutlinedInput-root': {
          bgcolor: 'background.default',
          borderRadius: '8px',
          paddingY: '10px',
          paddingX: '12px',
          fontSize: '14px',
          '& fieldset': {
            border: '1px solid',
            borderColor: 'divider',
          },
          '&:hover fieldset': {
            borderColor: 'primary.main',
          },
          '&.Mui-focused fieldset': {
            borderColor: 'primary.main',
            borderWidth: '1px',
          },
          '& input': {
            padding: 0,
            color: 'text.primary',
            '&::placeholder': {
              color: 'text.secondary',
              opacity: 1,
            },
          },
        },
      }}
      InputProps={{
        startAdornment: (
          <InputAdornment
            position="start"
            sx={{
              marginRight: '8px',
              color: 'text.secondary',
            }}
          >
            <SearchIcon size={16} />
          </InputAdornment>
        ),
      }}
    />
  );
}
