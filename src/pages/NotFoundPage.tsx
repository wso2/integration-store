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

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Container, Typography, useColorScheme } from '@wso2/oxygen-ui';
import WSO2Header from '@/components/WSO2Header';
import Footer from '@/components/Footer';
import { useNoIndexMeta } from '@/lib/seo/useNoIndexMeta';

/** Shown for any URL the app has no page for. */
export default function NotFoundPage() {
  const { mode } = useColorScheme();
  const navigate = useNavigate();
  useNoIndexMeta(true, 'Page not found - WSO2 Integration Platform Connectors');

  const effectiveMode = useMemo(() => {
    if (mode === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode as 'light' | 'dark';
  }, [mode]);

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: effectiveMode === 'dark' ? 'rgba(0, 0, 0, 0.27)' : '#F9FAFB',
      }}
    >
      <WSO2Header effectiveMode={effectiveMode} />
      <Container maxWidth="xl" sx={{ py: 5, flex: 1 }}>
        <Box
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          minHeight={400}
        >
          <Typography variant="h5" gutterBottom>
            Page not found
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            The page you are looking for does not exist.
          </Typography>
          <Button variant="contained" color="primary" onClick={() => navigate('/')}>
            Back to store
          </Button>
        </Box>
      </Container>
      <Footer effectiveMode={effectiveMode} />
    </Box>
  );
}
