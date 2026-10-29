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
import { Chip } from '@wso2/oxygen-ui';

interface MIBadgeProps {
  /** Solid: an MI-only connector. Light (default): a connector that also has an MI profile. */
  solid?: boolean;
  effectiveMode?: 'light' | 'dark';
}

const WSO2_ORANGE = '#FF7300';

/** Small "MI" marker for connectors that have a WSO2 Micro Integrator profile. */
export default function MIBadge({ solid = false, effectiveMode = 'light' }: MIBadgeProps) {
  return (
    <Chip
      label="MI"
      size="small"
      title={solid ? 'WSO2 Micro Integrator connector' : 'Also available for WSO2 Micro Integrator'}
      sx={{
        height: 20,
        fontSize: 11,
        fontWeight: 600,
        ...(solid
          ? { bgcolor: WSO2_ORANGE, color: '#FFFFFF' }
          : {
              bgcolor: effectiveMode === 'dark' ? `${WSO2_ORANGE}20` : '#FFF1E6',
              color: WSO2_ORANGE,
              border: `1px solid ${WSO2_ORANGE}55`,
            }),
        '& .MuiChip-label': { px: 1 },
      }}
    />
  );
}
