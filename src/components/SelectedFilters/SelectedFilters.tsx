import React from 'react';
import { Paper, Typography, Chip, Button } from '@wso2/oxygen-ui';
import type { ProfileFilter } from '@/lib/mi-connector/profile-search';

const PROFILE_LABELS: Record<ProfileFilter, string> = {
  default: 'WSO2 Integrator',
  mi: 'WSO2 Integrator: MI',
};

interface SelectedFiltersProps {
  selectedAreas: string[];
  selectedTypes: string[];
  selectedVendors: string[];
  onAreaDelete: (area: string) => void;
  onTypeDelete: (type: string) => void;
  onVendorDelete: (vendor: string) => void;
  onClearAll: () => void;
  /** The Profile that restricts the list (null when nothing or both are selected). */
  activeProfile?: ProfileFilter | null;
  onProfileDelete?: () => void;
  WSO2_ORANGE?: string;
  effectiveMode?: 'light' | 'dark';
}

const SelectedFilters: React.FC<SelectedFiltersProps> = ({
  selectedAreas,
  selectedTypes,
  selectedVendors,
  onAreaDelete,
  onTypeDelete,
  onVendorDelete,
  onClearAll,
  activeProfile = null,
  onProfileDelete,
  WSO2_ORANGE = '#FF7300',
  effectiveMode = 'light',
}) => {
  if (
    !activeProfile &&
    selectedAreas.length === 0 &&
    selectedTypes.length === 0 &&
    selectedVendors.length === 0
  ) {
    return null;
  }

  return (
    <Paper
      sx={{
        p: 1.5,
        mb: 2.5,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1,
        bgcolor: 'action.hover',
      }}
    >
      <Typography variant="body2" fontWeight={500} sx={{ mr: 1 }}>
        Active filters:
      </Typography>

      {activeProfile && (
        <Chip
          label={PROFILE_LABELS[activeProfile]}
          size="small"
          onDelete={onProfileDelete}
          color="default"
        />
      )}

      {selectedAreas.map((area) => (
        <Chip
          key={`area-${area}`}
          label={area}
          size="small"
          onDelete={() => onAreaDelete(area)}
          sx={{
            bgcolor: effectiveMode === 'dark' ? `${WSO2_ORANGE}20` : 'transparent',
            color: WSO2_ORANGE,
            border: `1px solid ${WSO2_ORANGE}`,
            '& .MuiChip-deleteIcon': {
              color: WSO2_ORANGE,
              '&:hover': {
                color: WSO2_ORANGE,
                opacity: 0.7,
              },
            },
          }}
        />
      ))}

      {selectedTypes.map((type) => (
        <Chip
          key={`type-${type}`}
          label={type}
          size="small"
          onDelete={() => onTypeDelete(type)}
          color="default"
        />
      ))}

      {selectedVendors.map((vendor) => (
        <Chip
          key={`vendor-${vendor}`}
          label={vendor}
          size="small"
          onDelete={() => onVendorDelete(vendor)}
          color="primary"
        />
      ))}

      <Button
        size="small"
        onClick={onClearAll}
        sx={{ ml: 'auto', textDecoration: 'underline', color: 'text.secondary' }}
      >
        Clear all
      </Button>
    </Paper>
  );
};

export default SelectedFilters;
