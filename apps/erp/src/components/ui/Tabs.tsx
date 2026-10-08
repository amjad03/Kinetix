'use client';

import Box from '@mui/material/Box';
import MuiTab from '@mui/material/Tab';
import MuiTabs from '@mui/material/Tabs';
import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { CountBadge } from './Badge';

export interface TabItem<V extends string = string> {
  value: V;
  label: string;
  count?: number;
  icon?: ReactNode;
  /** For LinkTabs: where the tab goes. */
  href?: string;
}

const tabSx = { minHeight: 44, textTransform: 'none', fontWeight: 600, fontSize: '0.875rem', px: 2, gap: 1, '&.Mui-selected': { color: 'm3.primary' } } as const;

/**
 * Tabs over local state. Pair each with a `TabPanel` of the same value. Arrow keys, Home and End
 * move between tabs (MUI), the selected tab has aria-selected and its panel is labelled by it.
 */
export function Tabs<V extends string>({ value, onChange, items, label }: { value: V; onChange: (v: V) => void; items: TabItem<V>[]; label: string }) {
  const id = useId();
  return (
    <MuiTabs
      value={value}
      onChange={(_, v: V) => onChange(v)}
      aria-label={label}
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
      sx={{ minHeight: 44, borderBottom: 1, borderColor: 'm3.outlineVariant', '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0' } }}
    >
      {items.map((it) => (
        <MuiTab key={it.value} value={it.value} id={`${id}-${it.value}`} aria-controls={`${id}-panel-${it.value}`} icon={it.icon as never} iconPosition="start" label={<TabLabel item={it} />} sx={tabSx} />
      ))}
    </MuiTabs>
  );
}

/** Tabs that navigate (each tab is a link); the active one is chosen by the caller, usually from the path. */
export function LinkTabs<V extends string>({ value, items, label }: { value: V; items: (TabItem<V> & { href: string })[]; label: string }) {
  return (
    <MuiTabs value={value} aria-label={label} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ minHeight: 44, borderBottom: 1, borderColor: 'm3.outlineVariant', '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0' } }}>
      {items.map((it) => (
        <MuiTab key={it.value} value={it.value} component={Link} href={it.href} icon={it.icon as never} iconPosition="start" label={<TabLabel item={it} />} sx={tabSx} />
      ))}
    </MuiTabs>
  );
}

function TabLabel({ item }: { item: TabItem }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      {item.label}
      {item.count !== undefined && <CountBadge count={item.count} tone="neutral" showZero />}
    </Box>
  );
}

export function TabPanel<V extends string>({ value, active, children, idPrefix }: { value: V; active: V; children: ReactNode; idPrefix?: string }) {
  if (value !== active) return null;
  return (
    <Box role="tabpanel" id={idPrefix ? `${idPrefix}-panel-${value}` : undefined} tabIndex={0} sx={{ pt: 2.5, '&:focus-visible': { outlineOffset: -2 } }}>
      {children}
    </Box>
  );
}
