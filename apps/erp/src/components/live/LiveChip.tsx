'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';

/** "Live" with a pulsing dot, in the fixed live colour. */
export function LiveChip({ label = 'Live' }: { label?: string }) {
  return (
    <Chip
      size="small"
      label={label}
      icon={
        <Box
          component="span"
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: 'kx.live',
            ml: '8px !important',
            '@keyframes kxLivePulse': {
              '0%': { boxShadow: '0 0 0 0 rgba(232,113,10,.5)' },
              '70%': { boxShadow: '0 0 0 6px rgba(232,113,10,0)' },
              '100%': { boxShadow: '0 0 0 0 rgba(232,113,10,0)' },
            },
            animation: 'kxLivePulse 1.8s infinite',
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
      }
      sx={{ bgcolor: 'kx.liveContainer', color: 'kx.onLiveContainer', fontWeight: 500 }}
    />
  );
}
