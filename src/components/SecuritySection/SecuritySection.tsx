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
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from '@wso2/oxygen-ui';
import { ChevronDown } from '@wso2/oxygen-ui-icons-react';
import { Close, InfoOutlined } from '@mui/icons-material';
import { keyframes } from '@mui/material/styles';
import { Vulnerability, VulnerabilityReport, VulnerabilitySeverity } from '@/types/connector';
import {
  DependencyGroup,
  PatchInfo,
  SEVERITY_ORDER,
  countBySeverity,
  countFixedByPatch,
  fetchPatchInfo,
  fetchSbomOrgs,
  fetchVulnerabilityReport,
  formatCheckedAgo,
  getCve,
  groupByDependency,
  parseLibrary,
  splitVulnerabilities,
} from '@/lib/vulnerabilities';

// The dialog slides down from the top as it fades in; the Dialog's own Fade covers the backdrop.
const slideDownIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-32px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

interface SecuritySectionProps {
  org: string;
  name: string;
  version: string;
  /** Versions of this package, when the caller already has them (saves a request). */
  versions?: string[];
  effectiveMode?: 'light' | 'dark';
}

type Scope = 'direct' | 'indirect';

/** Patch lookups for the package itself and for each indirect dependency. */
interface PatchState {
  self?: PatchInfo;
  groups: Record<string, PatchInfo>;
  orgs: Map<string, string>;
}

const SEVERITY_LABELS: Record<VulnerabilitySeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unknown: 'Unknown',
};

const SEVERITY_COLORS: Record<VulnerabilitySeverity, string> = {
  critical: '#DC2626',
  high: '#F59E0B',
  medium: '#EAB308',
  low: '#3B82F6',
  unknown: '#6B7280',
};

const PATCH_RED = '#DC2626';
const PATCH_GREEN = '#0F9D8A';

/** Grey pill with a coloured dot: `● High 4` (or just `● High` without a count). */
function SeverityPill({
  severity,
  count,
  effectiveMode,
  onClick,
}: {
  severity: VulnerabilitySeverity;
  count?: number;
  effectiveMode: 'light' | 'dark';
  /** When set, the pill is a button (used in the side panel to open the details dialog). */
  onClick?: () => void;
}) {
  const bg = effectiveMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#EDEDF0';
  const hoverBg = effectiveMode === 'dark' ? 'rgba(255, 255, 255, 0.18)' : '#E0E0E6';
  const sx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.75,
    px: 1.25,
    py: 0.25,
    borderRadius: 999,
    fontSize: 12,
    lineHeight: 1.6,
    color: 'text.primary',
    bgcolor: bg,
    whiteSpace: 'nowrap',
  } as const;
  const content = (
    <>
      <Box
        component="span"
        sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: SEVERITY_COLORS[severity] }}
      />
      {SEVERITY_LABELS[severity]}
      {count !== undefined ? ` ${count}` : ''}
    </>
  );

  if (!onClick) {
    return (
      <Box component="span" sx={sx}>
        {content}
      </Box>
    );
  }
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        ...sx,
        border: 'none',
        fontFamily: 'inherit',
        cursor: 'pointer',
        '&:hover': { bgcolor: hoverBg },
      }}
    >
      {content}
    </Box>
  );
}

/** Grey pill without a dot, used for the "nothing found" states. */
function PlainPill({ text, effectiveMode }: { text: string; effectiveMode: 'light' | 'dark' }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          px: 1.25,
          py: 0.25,
          borderRadius: 999,
          fontSize: 12,
          lineHeight: 1.6,
          color: 'text.primary',
          bgcolor: effectiveMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#EDEDF0',
        }}
      >
        {text}
      </Box>
    </Box>
  );
}

function CountLink({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count === 0) return <>0</>;
  return (
    <Link
      component="button"
      type="button"
      onClick={onOpen}
      sx={{ font: 'inherit', fontWeight: 700, verticalAlign: 'baseline' }}
    >
      {count}
    </Link>
  );
}

/** "2 critical, 2 high, 2 medium" */
function describeCounts(vulnerabilities: Vulnerability[]): string {
  const counts = countBySeverity(vulnerabilities);
  return SEVERITY_ORDER.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}`)
    .join(', ');
}

function patchBadge(
  group: DependencyGroup,
  patch?: PatchInfo
): { label: string; color: string; hint: string } | null {
  if (!patch || !patch.known) return null;
  const total = group.vulnerabilities.length;
  if (!patch.latestPatch) {
    return {
      label: 'No newer patch',
      color: PATCH_RED,
      hint: `${group.name} ${group.version} is already the latest patch, so these can't be fixed by updating it.`,
    };
  }
  if (!patch.patchIds) {
    return {
      label: `Patch ${patch.latestPatch} not scanned`,
      color: '#6B7280',
      hint: `A newer patch (${patch.latestPatch}) exists but hasn't been scanned yet.`,
    };
  }
  return countFixedByPatch(group.vulnerabilities, patch) === total
    ? {
        label: `Fixed in ${patch.latestPatch}`,
        color: PATCH_GREEN,
        hint: `Updating to ${patch.latestPatch} resolves all of these.`,
      }
    : {
        label: `Not fixed in ${patch.latestPatch}`,
        color: PATCH_RED,
        hint: `Some of these are still reported on the newer patch ${patch.latestPatch}.`,
      };
}

function VulnerabilityTable({
  rows,
  effectiveMode,
}: {
  rows: Vulnerability[];
  effectiveMode: 'light' | 'dark';
}) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Severity</TableCell>
          <TableCell>Vulnerability</TableCell>
          <TableCell>Library</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((v, index) => {
          const library = parseLibrary(v.purl);
          const cve = getCve(v);
          return (
            <TableRow key={`${v.id}-${v.purl}-${index}`}>
              <TableCell sx={{ verticalAlign: 'top', py: 1.5 }}>
                <SeverityPill severity={v.severity} effectiveMode={effectiveMode} />
              </TableCell>
              <TableCell sx={{ verticalAlign: 'top', py: 1.5 }}>
                <Typography variant="body2">{v.summary}</Typography>
                <Typography variant="caption" color="text.secondary">
                  <Link href={v.url} target="_blank" rel="noopener noreferrer">
                    {v.id}
                  </Link>
                  {cve ? ` · ${cve}` : ''}
                </Typography>
              </TableCell>
              <TableCell sx={{ verticalAlign: 'top', py: 1.5 }}>
                <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                  {library.name} {library.version}
                </Typography>
                {v.fixedIn.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    Fixed in {v.fixedIn.join(', ')}
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * "Security" block for the package side panel plus its "Known vulnerabilities" dialog, backed by
 * Ballerina Central's vulnerability report. Renders nothing until a report is available, so a
 * package Central hasn't scanned yet (or a failed request) simply has no Security section.
 */
export default function SecuritySection({
  org,
  name,
  version,
  versions,
  effectiveMode = 'light',
}: SecuritySectionProps) {
  const [report, setReport] = useState<VulnerabilityReport | null>(null);
  const [patches, setPatches] = useState<PatchState | null>(null);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>('direct');
  const [severityFilter, setSeverityFilter] = useState<VulnerabilitySeverity | 'all'>('all');

  // The page's global CSS sets `overflow-x: hidden` on both <html> and <body>, which makes <html>
  // the scroller, so the dialog's built-in scroll lock (which only touches <body>) does nothing
  // and is turned off below. Lock <html> ourselves, and keep the width of the page scrollbar
  // reserved so the content doesn't jump sideways when the scrollbar disappears.
  useEffect(() => {
    if (!open) return undefined;
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    const previousPadding = html.style.paddingRight;
    const previousGutter = html.style.getPropertyValue('scrollbar-gutter');
    const scrollbarWidth = window.innerWidth - html.clientWidth;
    html.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      if (typeof CSS !== 'undefined' && CSS.supports?.('scrollbar-gutter', 'stable')) {
        html.style.setProperty('scrollbar-gutter', 'stable');
      } else {
        html.style.paddingRight = `${scrollbarWidth}px`;
      }
    }
    return () => {
      html.style.overflow = previousOverflow;
      html.style.paddingRight = previousPadding;
      if (previousGutter) html.style.setProperty('scrollbar-gutter', previousGutter);
      else html.style.removeProperty('scrollbar-gutter');
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setPatches(null);
    fetchVulnerabilityReport(org, name, version).then((result) => {
      if (!cancelled) setReport(result);
    });
    return () => {
      cancelled = true;
    };
  }, [org, name, version]);

  const { direct, indirect } = useMemo(
    () => (report ? splitVulnerabilities(report) : { direct: [], indirect: [] }),
    [report]
  );

  // "Is it fixed in a newer patch?" needs a few extra lookups; the counts above don't wait for
  // them, and any lookup that fails just leaves that piece of patch info out.
  useEffect(() => {
    if (!report) return undefined;
    let cancelled = false;
    (async () => {
      const orgs = await fetchSbomOrgs(org, name, version);
      const groups = groupByDependency(indirect, orgs).filter((g) => g.org);
      const [self, ...rest] = await Promise.all([
        direct.length > 0 ? fetchPatchInfo(org, name, version, versions) : undefined,
        ...groups.map((g) => fetchPatchInfo(g.org as string, g.name, g.version)),
      ]);
      if (cancelled) return;
      const byGroup: Record<string, PatchInfo> = {};
      groups.forEach((g, i) => {
        byGroup[g.key] = rest[i] as PatchInfo;
      });
      setPatches({ self, groups: byGroup, orgs });
    })();
    return () => {
      cancelled = true;
    };
  }, [report, direct, indirect, org, name, version, versions]);

  if (!report) return null;

  const checked = formatCheckedAgo(report.scannedDate);
  const directCounts = countBySeverity(direct);
  const indirectCounts = countBySeverity(indirect);
  const orgs = patches?.orgs ?? new Map<string, string>();
  const groups = groupByDependency(indirect, orgs);

  // Side-panel patch summaries (only once the lookups are in).
  const directFixed = countFixedByPatch(direct, patches?.self);
  const indirectFixed = groups.reduce(
    (sum, g) => sum + countFixedByPatch(g.vulnerabilities, patches?.groups[g.key]),
    0
  );

  const openDialog = (nextScope: Scope, severity: VulnerabilitySeverity | 'all' = 'all') => {
    setScope(nextScope);
    setSeverityFilter(severity);
    setOpen(true);
  };

  const scopeVulns = scope === 'direct' ? direct : indirect;
  const scopeCounts = scope === 'direct' ? directCounts : indirectCounts;
  const matches = (v: Vulnerability) => severityFilter === 'all' || v.severity === severityFilter;
  const countBadge = (n: number, active: boolean) => (
    <Box
      component="span"
      sx={{
        ml: 1,
        px: 0.9,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        bgcolor: active
          ? 'primary.main'
          : effectiveMode === 'dark'
            ? 'rgba(255,255,255,0.1)'
            : '#EDEDF0',
        color: active ? '#FFFFFF' : 'text.secondary',
      }}
    >
      {n}
    </Box>
  );

  // `&&` outranks the theme's own Tab sizing (min-height 48px, 8px 16px padding).
  const tabSx = {
    '&&': { minHeight: 35, py: 0.75, px: 1.5, minWidth: 0, flexDirection: 'row' },
    fontSize: 14,
    textTransform: 'none',
  } as const;

  const noneAtAll = directCounts.total === 0 && indirectCounts.total === 0;

  const summaryLine = (text: string) => (
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
      {text}
    </Typography>
  );

  return (
    <>
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 1.5 }}>
          Security
        </Typography>

        {noneAtAll && (
          <PlainPill text="No known vulnerabilities in libraries" effectiveMode={effectiveMode} />
        )}
        {!noneAtAll && directCounts.total === 0 && (
          <PlainPill text="No known direct vulnerabilities" effectiveMode={effectiveMode} />
        )}
        {directCounts.total > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700, mb: 1 }}>
            Direct vulnerabilities:{' '}
            <CountLink count={directCounts.total} onOpen={() => openDialog('direct')} />
          </Typography>
        )}
        {directCounts.total > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
            {SEVERITY_ORDER.filter((s) => directCounts[s] > 0).map((s) => (
              <SeverityPill
                key={s}
                severity={s}
                count={directCounts[s]}
                effectiveMode={effectiveMode}
                onClick={() => openDialog('direct', s)}
              />
            ))}
          </Box>
        )}
        {directCounts.total > 0 &&
          directFixed > 0 &&
          summaryLine(`${directFixed} of them fixed in newer patches`)}

        {!noneAtAll && indirectCounts.total === 0 && (
          <PlainPill text="No known indirect vulnerabilities" effectiveMode={effectiveMode} />
        )}
        {indirectCounts.total > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700, mb: 1 }}>
            Indirect vulnerabilities:{' '}
            <CountLink count={indirectCounts.total} onOpen={() => openDialog('indirect')} />
          </Typography>
        )}
        {indirectCounts.total > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
            {SEVERITY_ORDER.filter((s) => indirectCounts[s] > 0).map((s) => (
              <SeverityPill
                key={s}
                severity={s}
                count={indirectCounts[s]}
                effectiveMode={effectiveMode}
                onClick={() => openDialog('indirect', s)}
              />
            ))}
          </Box>
        )}
        {indirectCounts.total > 0 &&
          indirectFixed > 0 &&
          summaryLine(`${indirectFixed} of them fixed in newer patches`)}

        {checked && (
          <Typography variant="body2" color="text.secondary">
            Checked {checked} via{' '}
            <Link href="https://osv.dev" target="_blank" rel="noopener noreferrer">
              OSV.dev
            </Link>
          </Typography>
        )}
      </Box>
      <Divider sx={{ my: 2 }} />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        disableScrollLock
        maxWidth={false}
        scroll="paper"
        aria-labelledby="known-vulnerabilities-title"
        sx={{
          '& .MuiBackdrop-root': { backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'none' },
          // Same box as Central's modal: 800px wide, top-aligned with a 28px margin, height fits
          // the content and the body scrolls once it reaches the viewport. The theme's default
          // dialog is translucent and blurred, so opacity and blur are reset explicitly.
          '& .MuiDialog-container': { alignItems: 'flex-start' },
          '& .MuiDialog-paper': {
            width: 'min(800px, calc(100% - 32px))',
            maxHeight: 'calc(100% - 56px)',
            m: '28px 16px',
            opacity: 1,
            backdropFilter: 'none',
            bgcolor: effectiveMode === 'dark' ? '#18181B' : '#FFFFFF',
            backgroundImage: 'none',
            borderRadius: '8px',
            animation: `${slideDownIn} 250ms cubic-bezier(0.2, 0, 0, 1)`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          },
        }}
      >
        <DialogTitle
          id="known-vulnerabilities-title"
          component="div"
          sx={{
            px: 2,
            py: 1.5,
            pr: 7,
            borderBottom: 1,
            borderColor: 'divider',
            fontSize: 20,
            fontWeight: 500,
            lineHeight: 1.3,
          }}
        >
          Known vulnerabilities
          <Typography
            variant="body2"
            color="text.secondary"
            component="div"
            sx={{ mt: 0.25, fontWeight: 400 }}
          >
            {org}/{name} {version}
            {checked ? ` · Checked ${checked}` : ''} via{' '}
            <Link href="https://osv.dev" target="_blank" rel="noopener noreferrer">
              OSV.dev
            </Link>
          </Typography>
          <IconButton
            aria-label="Close"
            onClick={() => setOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: '8px 16px 16px' }}>
          <Tabs
            value={scope}
            onChange={(_, next: Scope) => {
              setScope(next);
              setSeverityFilter('all');
            }}
            sx={{ mb: 2, minHeight: 35, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab
              sx={tabSx}
              value="direct"
              label={
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                  Direct
                  {countBadge(direct.length, scope === 'direct')}
                </Box>
              }
            />
            <Tab
              sx={tabSx}
              value="indirect"
              label={
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                  Indirect
                  {countBadge(indirect.length, scope === 'indirect')}
                </Box>
              }
            />
          </Tabs>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Chip
              size="small"
              clickable
              variant="outlined"
              label={`All ${scopeCounts.total}`}
              color={severityFilter === 'all' ? 'primary' : 'default'}
              onClick={() => setSeverityFilter('all')}
            />
            {SEVERITY_ORDER.filter((s) => scopeCounts[s] > 0).map((s) => (
              <Chip
                key={s}
                size="small"
                clickable
                variant="outlined"
                label={`${SEVERITY_LABELS[s]} ${scopeCounts[s]}`}
                color={severityFilter === s ? 'primary' : 'default'}
                onClick={() => setSeverityFilter(s)}
              />
            ))}
          </Box>

          {scopeVulns.filter(matches).length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No {scope} vulnerabilities{severityFilter === 'all' ? '' : ' at this severity'}.
            </Typography>
          ) : scope === 'direct' ? (
            <VulnerabilityTable rows={scopeVulns.filter(matches)} effectiveMode={effectiveMode} />
          ) : (
            groups
              .map((group) => ({ group, rows: group.vulnerabilities.filter(matches) }))
              .filter(({ rows }) => rows.length > 0)
              .map(({ group, rows }) => {
                const badge = patchBadge(group, patches?.groups[group.key]);
                return (
                  <DependencyAccordion
                    key={group.key}
                    title={`${group.org ? `${group.org}/` : ''}${group.name} ${group.version}`}
                    summary={describeCounts(rows)}
                    badge={badge}
                    effectiveMode={effectiveMode}
                  >
                    <VulnerabilityTable rows={rows} effectiveMode={effectiveMode} />
                  </DependencyAccordion>
                );
              })
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One collapsible row per indirect dependency: name, severity summary, patch status. */
function DependencyAccordion({
  title,
  summary,
  badge,
  effectiveMode,
  children,
}: {
  title: string;
  summary: string;
  badge: { label: string; color: string; hint: string } | null;
  effectiveMode: 'light' | 'dark';
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        mb: 1,
        overflow: 'hidden',
        bgcolor: effectiveMode === 'dark' ? 'rgba(255,255,255,0.02)' : 'transparent',
      }}
    >
      <Box
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((x) => !x);
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1.5,
          cursor: 'pointer',
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {summary}
        </Typography>
        {badge && (
          <>
            <Box
              component="span"
              sx={{
                px: 1.25,
                py: 0.25,
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                color: '#FFFFFF',
                bgcolor: badge.color,
                whiteSpace: 'nowrap',
              }}
            >
              {badge.label}
            </Box>
            <Tooltip title={badge.hint}>
              <InfoOutlined sx={{ fontSize: 16, color: 'text.secondary' }} />
            </Tooltip>
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <Box
          sx={{
            display: 'flex',
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'none',
          }}
        >
          <ChevronDown size={18} />
        </Box>
      </Box>
      {expanded && <Box sx={{ px: 2, pb: 1 }}>{children}</Box>}
    </Box>
  );
}
