'use client';

import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutline from '@mui/icons-material/ErrorOutlined';
import HourglassEmpty from '@mui/icons-material/HourglassEmpty';
import Schedule from '@mui/icons-material/Schedule';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { useI18n } from '@/i18n/client';
import type { ClassStatus } from '@/lib/types';

function LiveDot() {
  return (
    <Box
      component="span"
      sx={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        bgcolor: 'kx.live',
        ml: '6px !important',
        '@keyframes kxPulse': { '0%': { boxShadow: '0 0 0 0 rgba(232,113,10,.5)' }, '70%': { boxShadow: '0 0 0 6px rgba(232,113,10,0)' }, '100%': { boxShadow: '0 0 0 0 rgba(232,113,10,0)' } },
        animation: 'kxPulse 1.8s infinite',
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    />
  );
}

export function StatusChip({ status }: { status: ClassStatus }) {
  const { t } = useI18n();
  const common = { size: 'small' as const, label: t(`status.${status}`), title: t(`status.help.${status}`), 'data-status': status };
  const iconSx = { fontSize: '16px !important' };
  switch (status) {
    case 'live':
      return <Chip {...common} icon={<LiveDot />} sx={{ bgcolor: 'kx.liveContainer', color: 'kx.onLiveContainer' }} />;
    case 'taught':
      return (
        <Chip
          {...common}
          icon={<CheckCircleOutline sx={iconSx} />}
          sx={{ bgcolor: 'kx.successContainer', color: 'kx.onSuccessContainer', '& .MuiChip-icon': { color: 'inherit' } }}
        />
      );
    case 'not_started':
      return (
        <Chip
          {...common}
          variant="outlined"
          icon={<HourglassEmpty sx={iconSx} />}
          sx={{ borderColor: 'error.main', color: 'error.main', '& .MuiChip-icon': { color: 'inherit' } }}
        />
      );
    case 'missed':
      return (
        <Chip
          {...common}
          icon={<ErrorOutline sx={iconSx} />}
          sx={{ bgcolor: 'm3.errorContainer', color: 'm3.onErrorContainer', '& .MuiChip-icon': { color: 'inherit' } }}
        />
      );
    default:
      return (
        <Chip
          {...common}
          variant="outlined"
          icon={<Schedule sx={iconSx} />}
          sx={{ color: 'text.secondary', '& .MuiChip-icon': { color: 'inherit' } }}
        />
      );
  }
}
