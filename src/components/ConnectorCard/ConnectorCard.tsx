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

import { memo, useMemo, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, Typography, Chip, Box, Divider, ButtonBase } from '@wso2/oxygen-ui';
import { Download, Clock } from '@wso2/oxygen-ui-icons-react';
import ReactMarkdown from 'react-markdown';
import { BallerinaPackage } from '@/types/connector';
import { parseConnectorMetadata, getDisplayName, METADATA_FALLBACK } from '@/lib/connector-utils';

interface ConnectorCardProps {
  connector: BallerinaPackage;
  effectiveMode: 'light' | 'dark';
}

/**
 * Format pull count to human-readable format
 */
function formatPullCount(count: number | undefined): string {
  if (!count) return '0';
  if (count < 1000) return count.toString();
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1000000).toFixed(1)}M`;
}

/**
 * Format date to relative time
 */
function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return '1 day ago';
    if (diffInDays < 30) return `${diffInDays} days ago`;
    if (diffInDays < 365) {
      const months = Math.floor(diffInDays / 30);
      return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    }
    const years = Math.floor(diffInDays / 365);
    return `${years} ${years === 1 ? 'year' : 'years'} ago`;
  } catch {
    return dateString;
  }
}

/**
 * Get icon letter from connector name
 */
function getIconLetter(name: string): string {
  const parts = name.split('.');
  return parts[parts.length - 1]?.charAt(0).toUpperCase() || 'C';
}

/**
 * Get icon background color based on name
 */
function getIconColor(name: string): string {
  const colors = ['#DC2626', '#2563EB', '#16A34A', '#9333EA', '#EA580C', '#52525B'];
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function ConnectorCard({ connector, effectiveMode }: ConnectorCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Memoize expensive computations
  const metadata = useMemo(() => parseConnectorMetadata(connector.keywords), [connector.keywords]);
  const iconLetter = useMemo(() => getIconLetter(connector.name), [connector.name]);
  const iconColor = useMemo(() => getIconColor(connector.name), [connector.name]);
  const displayName = useMemo(
    () => getDisplayName(connector.name, metadata.vendor, connector.keywords),
    [connector.name, metadata.vendor, connector.keywords]
  );

  // Parse org and package name from connector URL
  const detailUrl = useMemo(() => {
    // Parse URL path and extract org/package (e.g., "/ballerinax/twilio/5.0.1" -> "/connector/ballerinax/twilio/latest")
    const urlPath = connector.URL.replace(/^packages\//, '').replace(/^\//, ''); // Remove 'packages/' prefix and leading slash
    const urlParts = urlPath.split('/').filter(Boolean); // Filter out empty strings

    if (urlParts.length >= 2) {
      const [org, packageName] = urlParts;
      if (org && packageName) {
        return `/connector/${org}/${packageName}/latest`;
      }
    }

    console.error('Unable to parse connector URL properly:', {
      name: connector.name,
      URL: connector.URL,
      urlParts,
    });
    // Last resort fallback - use the original versioned URL
    return connector.URL.replace(/^packages\//, '/connector/').replace(/\/[\d.]+$/, '/latest');
  }, [connector.name, connector.URL]);

  const summaryRef = useRef<HTMLDivElement>(null);
  const [needsTruncation, setNeedsTruncation] = useState(false);

  useEffect(() => {
    const el = summaryRef.current;
    if (!el) return;

    const measure = () => {
      setNeedsTruncation(el.scrollHeight > el.clientHeight);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => observer.disconnect();
  }, [connector.summary]);

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: effectiveMode === 'dark' ? '#18181B' : '#FFFFFF',
        border: effectiveMode === 'dark' ? '1px solid #27272A' : '1px solid #E5E7EB',
        boxShadow: effectiveMode === 'dark' ? 'none' : '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        transition: 'border-color 0.2s ease-in-out',
        '&:hover': {
          borderColor: '#FF7300',
        },
      }}
    >
      <Link
        to={detailUrl}
        style={{
          textDecoration: 'none',
          color: 'inherit',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <CardContent
          sx={{ flexGrow: 1, width: '100%', p: 2.5, display: 'flex', flexDirection: 'column' }}
        >
          <Box sx={{ display: 'flex', gap: 2, flexGrow: 1 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                color: 'white',
                fontSize: 18,
                flexShrink: 0,
                bgcolor: connector.icon ? 'transparent' : iconColor,
                overflow: 'hidden',
              }}
            >
              {connector.icon ? (
                <img
                  src={connector.icon}
                  alt={connector.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
              ) : (
                iconLetter
              )}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Typography variant="subtitle2" fontWeight={600}>
                  {displayName}
                </Typography>
                <Chip
                  label={connector.version}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: 11,
                  }}
                />
              </Box>
              <Box
                sx={{
                  mt: 0.75,
                  minHeight: '40px',
                  fontSize: '0.8571428571428571rem',
                  lineHeight: 1.43,
                  color: 'text.secondary',
                  '& p, & span': {
                    margin: 0,
                    fontSize: '0.8571428571428571rem',
                    lineHeight: 1.43,
                    color: 'text.secondary',
                  },
                  '& code': {
                    backgroundColor: (theme) =>
                      theme.palette.mode === 'dark'
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'rgba(0, 0, 0, 0.05)',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    fontSize: '0.8571428571428571rem',
                    fontFamily: 'monospace',
                  },
                  '& strong': {
                    fontWeight: 600,
                  },
                  '& em': {
                    fontStyle: 'italic',
                  },
                  '& a': {
                    color: 'primary.main',
                    textDecoration: 'none',
                    '&:hover': {
                      textDecoration: 'underline',
                    },
                  },
                }}
              >
                <Box
                  ref={summaryRef}
                  sx={{
                    ...(!isExpanded && {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }),
                  }}
                >
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <span>{children}</span>,
                      // Don't render links - the whole card is already clickable
                      a: ({ children }) => <span>{children}</span>,
                    }}
                  >
                    {connector.summary}
                  </ReactMarkdown>
                </Box>
                {needsTruncation && (
                  <ButtonBase
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsExpanded(!isExpanded);
                    }}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? 'Show less description' : 'Show more description'}
                    sx={{
                      display: 'inline-block',
                      cursor: 'pointer',
                      color: '#FF7300 !important',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      mt: 0.5,
                      padding: '8px',
                      minHeight: '44px',
                      minWidth: '44px',
                      margin: '-8px',
                      border: 'none',
                      background: 'none',
                      textAlign: 'left',
                      '&:hover': {
                        textDecoration: 'underline',
                        background: 'none',
                      },
                      '&:focus-visible': {
                        outline: '2px solid #FF7300',
                        outlineOffset: '2px',
                        borderRadius: '2px',
                      },
                    }}
                  >
                    {isExpanded ? 'Show less' : 'Show more'}
                  </ButtonBase>
                )}
              </Box>
            </Box>
          </Box>

          {/* Tags */}
          <Box display="flex" gap={1} flexWrap="wrap" mb={2} mt={2}>
            {/* Type chip - always visible */}
            {metadata.types.map((t) => (
              <Chip
                key={t}
                label={t}
                size="small"
                color="default"
                sx={{
                  fontSize: '0.7rem',
                  height: '24px',
                  '& .MuiChip-label': {
                    textTransform: 'none',
                  },
                }}
              />
            ))}

            {metadata.vendor !== METADATA_FALLBACK && (
              <Chip
                label={metadata.vendor}
                size="small"
                color="primary"
                sx={{
                  fontSize: '0.7rem',
                  height: '24px',
                  '& .MuiChip-label': {
                    textTransform: 'none',
                  },
                }}
              />
            )}

            {metadata.areas
              .filter((a) => a !== METADATA_FALLBACK)
              .map((a) => (
                <Chip
                  key={a}
                  label={a}
                  size="small"
                  sx={{
                    fontSize: '0.7rem',
                    height: '24px',
                    bgcolor: effectiveMode === 'dark' ? '#FF730020' : 'transparent',
                    color: '#FF7300',
                    border: '1px solid #FF7300',
                    '& .MuiChip-label': {
                      textTransform: 'none',
                    },
                  }}
                />
              ))}
          </Box>

          {/* Bottom section - always at bottom */}
          <Box sx={{ mt: 'auto' }}>
            <Divider sx={{ my: 2 }} />

            {/* Footer */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  <Download size={14} /> {formatPullCount(connector.totalPullCount)}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  <Clock size={14} /> {formatRelativeTime(connector.createdDate)}
                </Typography>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Link>
    </Card>
  );
}

// Memoize to prevent unnecessary re-renders when parent re-renders
export default memo(ConnectorCard);
