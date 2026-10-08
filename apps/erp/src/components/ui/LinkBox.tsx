'use client';

import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** A Box that is a link. Server components cannot pass `component={Link}` to a Box, so they use this. */
export function LinkBox({ href, sx, children, ...rest }: { href: string; sx?: SxProps<Theme>; children?: ReactNode; 'data-testid'?: string; 'aria-current'?: 'page'; 'aria-label'?: string }) {
  return (
    <Box component={Link} href={href} sx={sx} {...rest}>
      {children}
    </Box>
  );
}
