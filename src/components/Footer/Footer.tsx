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
import { Box, Container, Link, Typography } from '@wso2/oxygen-ui';

interface FooterProps {
  effectiveMode: 'light' | 'dark';
}

export default function Footer({ effectiveMode }: FooterProps) {
  return (
    <>
      {/* Takes up the free space of a short page so the footer sits at the bottom of the
          window; at least the 48px gap above the footer on a tall page */}
      <Box aria-hidden sx={{ flexGrow: 1, minHeight: 48 }} />
      <Box
        component="footer"
        sx={{
          py: 3,
          borderTop: effectiveMode === 'dark' ? '1px solid #27272A' : '1px solid #E5E7EB',
          bgcolor: effectiveMode === 'dark' ? '#09090B' : '#F9FAFB',
        }}
      >
        <Container maxWidth="xl">
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 2,
            }}
          >
            <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <Link
                href="https://wso2.com/terms-of-use"
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: 'text.secondary',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  '&:hover': {
                    color: 'text.primary',
                    textDecoration: 'underline',
                  },
                }}
              >
                Terms of Use
              </Link>
              <Link
                href="https://wso2.com/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: 'text.secondary',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  '&:hover': {
                    color: 'text.primary',
                    textDecoration: 'underline',
                  },
                }}
              >
                Privacy Policy
              </Link>
              <Link
                href="https://wso2.com/contact"
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: 'text.secondary',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  '&:hover': {
                    color: 'text.primary',
                    textDecoration: 'underline',
                  },
                }}
              >
                Support
              </Link>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
              © 2026, WSO2 LLC.
            </Typography>
          </Box>
        </Container>
      </Box>
    </>
  );
}
