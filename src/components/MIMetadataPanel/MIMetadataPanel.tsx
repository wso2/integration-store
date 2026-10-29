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
  Button,
  Chip,
  CircularProgress,
  ClickAwayListener,
  Divider,
  FormControl,
  MenuItem,
  MenuList,
  Paper,
  Popper,
  Select,
  Tooltip,
  Typography,
} from '@wso2/oxygen-ui';
import { OpenInNew } from '@mui/icons-material';
import {
  MIComponent,
  MIRelease,
  formatMIVersionRange,
  getAssetLabel,
  sortMIVersions,
} from '@/lib/mi-connector';

export type ConnectorProfile = 'default' | 'mi';

const MAX_HISTORY = 10;

/** Only http(s) links from the MI API are rendered as links. */
function safeHref(url?: string): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

const labelSx = { fontWeight: 600, display: 'block' } as const;

interface MIProfileSwitchProps {
  value: ConnectorProfile;
  onChange: (profile: ConnectorProfile) => void;
  /** Profiles that cannot be selected, each with the reason shown as a tooltip. */
  disabledReasons?: Partial<Record<ConnectorProfile, string>>;
}

/** Switch between the default (Ballerina) profile and the MI profile. */
export function MIProfileSwitch({ value, onChange, disabledReasons = {} }: MIProfileSwitchProps) {
  const options: { key: ConnectorProfile; label: string }[] = [
    { key: 'default', label: 'WSO2 Integrator' },
    { key: 'mi', label: 'WSO2 Integrator: MI' },
  ];
  return (
    <Box
      role="group"
      aria-label="Connector profile"
      sx={{ display: 'flex', gap: 0.5, p: 0.5, mb: 2, borderRadius: 2, bgcolor: 'action.hover' }}
    >
      {options.map(({ key, label }) => {
        const reason = disabledReasons[key];
        const button = (
          <Button
            fullWidth
            size="small"
            color="primary"
            variant={value === key ? 'contained' : 'text'}
            aria-pressed={value === key}
            disabled={Boolean(reason)}
            onClick={() => onChange(key)}
            sx={{ textTransform: 'none', whiteSpace: 'nowrap', px: 1 }}
          >
            {label}
          </Button>
        );
        // A disabled button fires no pointer events, so the tooltip sits on a wrapper.
        return reason ? (
          <Tooltip key={key} title={reason} arrow>
            <Box component="span" sx={{ display: 'flex', flex: 1 }}>
              {button}
            </Box>
          </Tooltip>
        ) : (
          <Box key={key} component="span" sx={{ display: 'flex', flex: 1 }}>
            {button}
          </Box>
        );
      })}
    </Box>
  );
}

function ReleaseLinks({ release }: { release: MIRelease }) {
  const notesUrl = safeHref(release.releaseUrl);
  const links = [
    ...release.assets
      .map((asset) => ({
        key: asset.downloadUrl,
        label: release.assets.length > 1 ? `Download ${getAssetLabel(asset.name)}` : 'Download',
        title: asset.name,
        href: safeHref(asset.downloadUrl),
      }))
      .filter((l) => l.href),
    ...(notesUrl
      ? [{ key: notesUrl, label: 'Release notes', title: 'Release notes', href: notesUrl }]
      : []),
  ];
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 0.25 }}>
      {links.map((l) => (
        <Typography
          key={l.key}
          component="a"
          variant="caption"
          href={l.href}
          title={l.title}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            color: 'primary.main',
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {l.label}
        </Typography>
      ))}
    </Box>
  );
}

interface MIMetadataPanelProps {
  components: readonly MIComponent[];
  selected?: MIComponent;
  loading: boolean;
  onSelectComponent: (id: string) => void;
}

/**
 * Component dropdown. The trigger is the themed Select (same look as the store's other
 * dropdowns), but its list is a Popper instead of a modal menu: Popper stays attached to the
 * trigger while the page scrolls, whereas a modal menu is fixed to the viewport and drifts away.
 */
function ComponentSelect({
  components,
  selectedId,
  onSelect,
}: {
  components: readonly MIComponent[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const close = () => setAnchorEl(null);

  return (
    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
      <Select
        // Never opens its own menu; onOpen hands the trigger to the Popper below.
        open={false}
        onOpen={(e) => {
          const root = (e.currentTarget as HTMLElement).closest('.MuiInputBase-root');
          setAnchorEl(
            open ? null : ((root as HTMLElement | null) ?? (e.currentTarget as HTMLElement))
          );
        }}
        value={selectedId}
        SelectDisplayProps={{ 'aria-label': 'MI component' }}
        sx={{
          '& .MuiSelect-icon': {
            transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
          },
        }}
      >
        {components.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </Select>
      <Popper
        open={open}
        anchorEl={anchorEl}
        placement="bottom-start"
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
        style={{ width: anchorEl?.clientWidth }}
      >
        <ClickAwayListener
          onClickAway={(e) => {
            // The trigger opens on mouse-down and toggles itself; its own click is not "away".
            if (anchorEl?.contains(e.target as Node)) return;
            close();
          }}
        >
          <Paper
            elevation={16}
            sx={(theme) => ({
              mt: 0.5,
              maxHeight: 320,
              overflow: 'auto',
              borderRadius: '10px',
              border: theme.vars ? `1px solid ${theme.vars.palette.divider}` : 'none',
              boxShadow: theme.shadows[8],
              // Opaque: the theme's default Paper is translucent with a backdrop blur, which
              // lets the text behind the list show through.
              // (The "Channel" value is the same colour without its alpha.)
              backgroundColor: theme.vars
                ? `rgb(${theme.vars.palette.background.paperChannel})`
                : theme.palette.background.paper,
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              opacity: 1,
            })}
          >
            <MenuList
              role="listbox"
              autoFocusItem
              sx={{ py: 0.5 }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || e.key === 'Tab') close();
              }}
            >
              {components.map((c) => (
                <MenuItem
                  key={c.id}
                  role="option"
                  aria-selected={c.id === selectedId}
                  selected={c.id === selectedId}
                  sx={{ py: 1, px: 2, minHeight: 40 }}
                  onClick={() => {
                    close();
                    if (c.id !== selectedId) onSelect(c.id);
                  }}
                >
                  {c.name}
                </MenuItem>
              ))}
            </MenuList>
          </Paper>
        </ClickAwayListener>
      </Popper>
    </FormControl>
  );
}

/** Right-hand panel for the MI profile: latest release, supported MI versions and history. */
export default function MIMetadataPanel({
  components,
  selected,
  loading,
  onSelectComponent,
}: MIMetadataPanelProps) {
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress size={24} />
      </Box>
    );
  }
  if (!selected) {
    return (
      <Typography variant="body2" color="text.secondary">
        No WSO2 Micro Integrator details are available for this connector.
      </Typography>
    );
  }

  const [latest, ...older] = selected.releases;
  const docsUrl = safeHref(selected.documentationUrl) ?? safeHref(selected.repoUrl);
  const licenseUrl = safeHref(selected.licenseUrl);

  return (
    <Box>
      {components.length > 1 && (
        <ComponentSelect
          components={components}
          selectedId={selected.id}
          onSelect={onSelectComponent}
        />
      )}

      {latest ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={labelSx}>
              Version
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {latest.tagName}
            </Typography>
            <ReleaseLinks release={latest} />
          </Box>
          {latest.products.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={labelSx}>
                Supported MI versions
              </Typography>
              <Typography variant="body2">{sortMIVersions(latest.products).join(', ')}</Typography>
            </Box>
          )}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No releases have been published yet.
        </Typography>
      )}

      {selected.license && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={labelSx}>
            License
          </Typography>
          {licenseUrl ? (
            <Typography
              component="a"
              variant="body2"
              href={licenseUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: 'inherit' }}
            >
              {selected.license}
            </Typography>
          ) : (
            <Typography variant="body2">{selected.license}</Typography>
          )}
        </Box>
      )}

      {selected.labels.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" color="text.secondary" sx={labelSx}>
            Tags
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
            {selected.labels.map((label) => (
              <Chip key={label} label={label} size="small" />
            ))}
          </Box>
        </>
      )}

      {older.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" color="text.secondary" sx={labelSx}>
            Version History
          </Typography>
          <Box sx={{ mt: 1, maxHeight: 260, overflowY: 'auto' }}>
            {older.slice(0, MAX_HISTORY).map((release) => (
              <Box key={release.tagName} sx={{ py: 0.75 }}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {release.tagName}
                </Typography>
                {release.products.length > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {formatMIVersionRange(release.products)}
                  </Typography>
                )}
                <ReleaseLinks release={release} />
              </Box>
            ))}
          </Box>
        </>
      )}

      {docsUrl && (
        <>
          <Divider sx={{ my: 2 }} />
          <Button
            fullWidth
            variant="contained"
            color="primary"
            onClick={() => window.open(docsUrl, '_blank', 'noopener,noreferrer')}
            endIcon={<OpenInNew sx={{ fontSize: 16 }} />}
          >
            Documentation
          </Button>
        </>
      )}
    </Box>
  );
}
