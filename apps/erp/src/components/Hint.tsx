'use client';

import Tooltip from '@mui/material/Tooltip';
import type { ReactNode } from 'react';

/**
 * A tooltip for content rendered by a server component. MUI's Tooltip clones its child to add
 * listeners; a server-rendered child cannot be cloned the same way on the server and in the
 * browser (hydration fails), so the tooltip goes on a wrapper made here.
 */
export function Hint({ title, children, block }: { title: string; children: ReactNode; block?: boolean }) {
  return <Tooltip title={title}>{block ? <div>{children}</div> : <span style={{ display: 'inline-flex', maxWidth: '100%' }}>{children}</span>}</Tooltip>;
}
