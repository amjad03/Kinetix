'use client';

import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { Tab as KxTab, Tabs as KxTabs } from '@/components/kx';
import { CountBadge } from './Badge';

export interface TabItem<V extends string = string> {
  value: V;
  label: string;
  count?: number;
  icon?: ReactNode;
  /** For LinkTabs: where the tab goes. */
  href?: string;
}

/**
 * Tabs over local state. Pair each with a `TabPanel` of the same value. Arrow keys, Home and End
 * move between tabs, the selected tab has aria-selected and its panel is labelled by it.
 */
export function Tabs<V extends string>({ value, onChange, items, label }: { value: V; onChange: (v: V) => void; items: TabItem<V>[]; label: string }) {
  const id = useId();
  return (
    <KxTabs value={value} onChange={(_, v: V) => onChange(v)} aria-label={label}>
      {items.map((it) => (
        <KxTab key={it.value} value={it.value} id={`${id}-${it.value}`} aria-controls={`${id}-panel-${it.value}`} icon={it.icon} label={<TabLabel item={it} />} />
      ))}
    </KxTabs>
  );
}

/** Tabs that navigate (each tab is a link); the active one is chosen by the caller, usually from the path. */
export function LinkTabs<V extends string>({ value, items, label }: { value: V; items: (TabItem<V> & { href: string })[]; label: string }) {
  return (
    <KxTabs value={value} aria-label={label} className="mb-6">
      {items.map((it) => (
        <KxTab key={it.value} value={it.value} component={Link} href={it.href} icon={it.icon} label={<TabLabel item={it} />} />
      ))}
    </KxTabs>
  );
}

function TabLabel({ item }: { item: TabItem }) {
  return (
    <span className="inline-flex items-center gap-2">
      {item.label}
      {item.count !== undefined && <CountBadge count={item.count} tone="neutral" showZero />}
    </span>
  );
}

export function TabPanel<V extends string>({ value, active, children, idPrefix }: { value: V; active: V; children: ReactNode; idPrefix?: string }) {
  if (value !== active) return null;
  return (
    <div role="tabpanel" id={idPrefix ? `${idPrefix}-panel-${value}` : undefined} tabIndex={0} className="pt-5 focus-visible:-outline-offset-2">
      {children}
    </div>
  );
}
