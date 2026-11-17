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

export default function Hero(_props: HeroProps) {
  return (
    <Box
      sx={{
        // Solid Midnight Ink in both light and dark mode, so the text below is always light.
        bgcolor: '#0B1633',
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
            <Typography variant="h1" fontWeight={600} sx={{ color: '#FFFFFF' }}>
              Integration Store
            </Typography>
            <Typography variant="body1" sx={{ mt: 1, color: 'rgba(255, 255, 255, 0.75)' }}>
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
