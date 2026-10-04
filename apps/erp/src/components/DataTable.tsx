import Box from '@mui/material/Box';
import type { ReactNode } from 'react';

/** Outlined, rounded frame for tables; scrolls sideways on narrow screens. */
export function TableFrame({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Box
      data-testid={testId}
      sx={{
        border: 1,
        borderColor: 'm3.outlineVariant',
        borderRadius: '12px',
        overflowX: 'auto',
        '& .MuiTableRow-root:last-of-type > .MuiTableCell-body': { borderBottom: 0 },
        '& .MuiTableCell-head': { bgcolor: 'm3.surfaceContainerLow' },
      }}
    >
      {children}
    </Box>
  );
}
