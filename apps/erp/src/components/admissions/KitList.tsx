'use client';

import type { ReactNode } from 'react';
import type { ActionParam } from '@/components/records/ActionDialog';
import { RecordsTable } from '@/components/records/RecordsTable';
import { StatusPill, type Column, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

/** A column of a record kit list described as data, so a server page can give it. */
export interface KitColumn {
  key: string;
  header: string;
  /** The API sort key, when the column sorts. */
  sortKey?: string;
  kind?: 'text' | 'number' | 'rupees' | 'paise' | 'date' | 'datetime' | 'bool' | 'pill';
  /** Words for fixed values, by value. */
  labels?: Record<string, string>;
  /** Pill colours for a `pill` column, by value. */
  tones?: Record<string, Tone>;
  /** A second line under the value (another key of the row). */
  sub?: string;
  rowHeader?: boolean;
  hideBelow?: 'sm' | 'md' | 'lg';
  defaultHidden?: boolean;
  align?: 'right';
}

/**
 * A record kit list whose columns are plain data (labels and tones included), for the many admissions lists that
 * need no cell of their own: rows link to `rowHref` with `{id}` (or `{<key>}`) filled in.
 */
export function KitList({
  meta,
  page,
  state,
  label,
  columns,
  rowHref,
  empty,
  actionParams,
  rowActionKeys,
  toolbar,
  extraParams,
}: {
  meta: RecordMeta;
  page: RecordsPage<Row>;
  state: ListState;
  label: string;
  columns: KitColumn[];
  rowHref?: string;
  empty?: ReactNode;
  actionParams?: Record<string, ActionParam[]>;
  rowActionKeys?: string[];
  toolbar?: ReactNode;
  extraParams?: Record<string, string>;
}) {
  const { t, fmt } = useI18n();
  const text = (c: KitColumn, v: unknown): ReactNode => {
    if (v === null || v === undefined || v === '') return <span className="text-muted-foreground">—</span>;
    if (c.kind === 'pill') return <StatusPill tone={c.tones?.[String(v)] ?? 'neutral'}>{c.labels?.[String(v)] ?? String(v)}</StatusPill>;
    if (c.labels && typeof v === 'string') return c.labels[v] ?? v;
    switch (c.kind) {
      case 'number':
        return fmt.number(Number(v));
      case 'rupees':
        return fmt.rupees(Math.round(Number(v) * 100));
      case 'paise':
        return fmt.rupees(Number(v));
      case 'date':
        return fmt.date(String(v).slice(0, 10), 'short');
      case 'datetime':
        return `${fmt.date(String(v).slice(0, 10), 'short')} ${new Date(String(v)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })}`;
      case 'bool':
        return v ? t('adk.yes') : t('adk.no');
      default:
        return String(v);
    }
  };
  const cols: Column<Row>[] = columns.map((c) => ({
    id: c.key,
    header: c.header,
    sortKey: c.sortKey,
    rowHeader: c.rowHeader,
    hideable: c.rowHeader ? false : undefined,
    hideBelow: c.hideBelow,
    defaultHidden: c.defaultHidden,
    align: c.align ?? (c.kind === 'number' || c.kind === 'rupees' || c.kind === 'paise' ? 'right' : undefined),
    cell: (r) =>
      c.sub ? (
        <span className="min-w-0">
          <span className={c.rowHeader ? 'block truncate font-[550]' : 'block truncate'}>{text(c, r[c.key])}</span>
          <small className="block truncate text-xs text-muted-foreground">{r[c.sub] === null || r[c.sub] === undefined ? '' : String(r[c.sub])}</small>
        </span>
      ) : (
        text(c, r[c.key])
      ),
  }));
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={label}
      columns={cols}
      rowHref={
        rowHref
          ? (r) => {
              const keys = [...rowHref.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
              // A row without the record it would open (an original received without an application) has no page.
              return keys.every((k) => r[k]) ? rowHref.replace(/\{(\w+)\}/g, (_m, k: string) => String(r[k])) : undefined;
            }
          : undefined
      }
      empty={empty}
      actionParams={actionParams}
      rowActionKeys={rowActionKeys}
      toolbar={toolbar}
      extraParams={extraParams}
    />
  );
}
