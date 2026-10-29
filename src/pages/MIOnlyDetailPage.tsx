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

import React, { useEffect, useMemo, useState } from 'react';
import {
  useColorScheme,
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  useMediaQuery,
  Button,
  Skeleton,
} from '@wso2/oxygen-ui';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import WSO2Header from '@/components/WSO2Header';
import BreadcrumbsNav from '@/components/BreadcrumbsNav';
import MarkdownContent from '@/components/MarkdownContent';
import Footer from '@/components/Footer';
import MIBadge from '@/components/MIBadge';
import MIMetadataPanel, { MIProfileSwitch } from '@/components/MIMetadataPanel';
import {
  MIComponent,
  fetchMIComponentsByIds,
  findMIOnlyConnector,
  selectMIComponent,
  useMILogo,
} from '@/lib/mi-connector';
import { useNoIndexMeta } from '@/lib/seo/useNoIndexMeta';

const NO_BALLERINA_REASON = 'Not available: no Ballerina package for this connector';

/** Detail page of an MI connector that has no Ballerina package: /connector/wso2-mi/{MI id}. */
export default function MIOnlyDetailPage() {
  const { mode } = useColorScheme();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isMobile = useMediaQuery((theme: any) => theme.breakpoints.down('lg'));
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const connector = findMIOnlyConnector(id);
  const logo = useMILogo(connector?.id);

  const [components, setComponents] = useState<MIComponent[]>([]);
  const [loading, setLoading] = useState(true);

  const effectiveMode = useMemo(() => {
    if (mode === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode as 'light' | 'dark';
  }, [mode]);

  // These pages are not in the sitemap and only have the MI description, so they are not indexed.
  useNoIndexMeta(
    true,
    connector
      ? `${connector.name} - WSO2 Integration Platform Connectors`
      : 'Connector not found - WSO2 Integration Platform Connectors'
  );

  useEffect(() => {
    if (!connector) return;
    let cancelled = false;
    setLoading(true);
    setComponents([]);
    fetchMIComponentsByIds(connector.componentIds).then((loaded) => {
      if (cancelled) return;
      setComponents(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [connector]);

  // ?component= picks a component; so does a component id in the path (e.g. the inbound one).
  const selected = selectMIComponent(components, searchParams.get('component') ?? id);

  const selectComponent = (componentId: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('component', componentId);
        return next;
      },
      { replace: true }
    );

  const sidebar = connector && (
    <Box>
      <MIProfileSwitch
        value="mi"
        onChange={() => {}}
        disabledReasons={{ default: NO_BALLERINA_REASON }}
      />
      <MIMetadataPanel
        components={components}
        selected={selected}
        loading={loading}
        onSelectComponent={selectComponent}
      />
    </Box>
  );

  const overview = connector
    ? `## Overview\n\n${selected?.description?.trim() || connector.summary}`
    : '';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: effectiveMode === 'dark' ? 'rgba(0, 0, 0, 0.27)' : '#F9FAFB',
      }}
    >
      <WSO2Header effectiveMode={effectiveMode} />

      <Box
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: effectiveMode === 'dark' ? '#18181B' : '#FFFFFF',
        }}
      >
        <Container maxWidth="xl" sx={{ py: 1.5 }}>
          <BreadcrumbsNav connectorName={connector?.name ?? ''} />
        </Container>
      </Box>

      {!connector ? (
        <Container maxWidth="xl" sx={{ py: 5 }}>
          <Box
            display="flex"
            flexDirection="column"
            justifyContent="center"
            alignItems="center"
            minHeight={400}
          >
            <Typography variant="h5" color="error" gutterBottom>
              Connector not found
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              We could not find this connector. It may have been renamed or removed.
            </Typography>
            <Button variant="contained" color="primary" onClick={() => navigate('/')}>
              Back to store
            </Button>
          </Box>
        </Container>
      ) : (
        <Container maxWidth="xl" sx={{ py: 5 }}>
          <Box sx={{ display: 'flex', gap: 6 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mb: 5 }}>
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: 3,
                    bgcolor: logo ? 'transparent' : '#52525B',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 24,
                    flexShrink: 0,
                  }}
                >
                  {logo ? (
                    <img
                      src={logo}
                      alt={connector.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    connector.name.charAt(0).toUpperCase()
                  )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {connector.name}
                  </Typography>
                  <MIBadge solid />
                </Box>
              </Box>

              {isMobile && (
                <Card sx={{ mb: 4 }}>
                  <CardContent>{sidebar}</CardContent>
                </Card>
              )}

              {loading && !selected ? (
                <Box>
                  <Skeleton variant="text" width="90%" />
                  <Skeleton variant="text" width="70%" />
                </Box>
              ) : (
                <Box component="section" sx={{ mb: 6 }}>
                  <MarkdownContent content={overview} effectiveMode={effectiveMode} />
                </Box>
              )}
            </Box>

            {!isMobile && (
              <Box sx={{ width: 340, flexShrink: 0 }}>
                <Box sx={{ position: 'sticky', top: 100 }}>
                  <Card
                    sx={{
                      bgcolor: effectiveMode === 'dark' ? '#18181B' : '#FFFFFF',
                      border: effectiveMode === 'dark' ? 'none' : '1px solid #E5E7EB',
                      boxShadow:
                        effectiveMode === 'dark' ? 'none' : '0 1px 2px 0 rgb(0 0 0 / 0.05)',
                    }}
                  >
                    <CardContent sx={{ p: 3 }}>{sidebar}</CardContent>
                  </Card>
                </Box>
              </Box>
            )}
          </Box>
        </Container>
      )}

      <Footer effectiveMode={effectiveMode} />
    </Box>
  );
}
