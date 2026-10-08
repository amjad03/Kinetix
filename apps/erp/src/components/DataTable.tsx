import Box from '@mui/material/Box';
import type { ReactNode } from 'react';

/** A white card frame for plain tables; scrolls sideways on narrow screens. */
export function TableFrame({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Box
      data-testid={testId}
      sx={{
        border: 1,
        borderColor: 'm3.outlineVariant',
        borderRadius: '16px',
        bgcolor: 'kx.pane',
        boxShadow: 'var(--kx-elev-card)',
        overflowX: 'auto',
        '& .MuiTableRow-root:last-of-type > .MuiTableCell-body': { borderBottom: 0 },
        '& .MuiTableCell-head': { bgcolor: 'm3.surfaceContainerLow' },
      }}
    >
      {children}
    </Box>
  );
}
