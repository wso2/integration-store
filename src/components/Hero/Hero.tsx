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
import { Box, Container, Typography } from '@wso2/oxygen-ui';

interface HeroProps {
  effectiveMode: 'light' | 'dark';
}

export default function Hero({ effectiveMode }: HeroProps) {
  return (
    <Box
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        background:
          effectiveMode === 'dark'
            ? 'linear-gradient(to right, #18181B, #18181B, rgba(255, 115, 0, 0.1))'
            : 'linear-gradient(to right, #F3F4F6, #FFFFFF, #FFF7ED)',
      }}
    >
      <Container maxWidth="xl" sx={{ py: 5 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'flex-start', md: 'center' },
            justifyContent: { xs: 'flex-start', md: 'space-between' },
            gap: 3,
          }}
        >
          <Box
            sx={{
              width: { xs: '100%', md: '50%' },
              mb: { xs: 3, md: 0 },
            }}
          >
            <Typography variant="h1" fontWeight="bold">
              Integration Store
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
              Discover connectors, libraries, and integration assets to accelerate development
              across SaaS, legacy systems, databases, messaging platforms, AI services, and cloud
              providers.
            </Typography>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
