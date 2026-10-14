'use client';

import { SlidersHorizontal } from 'lucide-react';
import { RecordsTable } from '@/components/records/RecordsTable';
import { EmptyState, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

type FieldRow = Row & { key: string; label: string; type: string; optionsText: string; required: boolean; viewRolesText: string; editRolesText: string; requestable: boolean; active: boolean; filled: number };

/**
 * The institution's own profile fields (house, blood group, hobbies…): their type and choices, who may see and change
 * them, whether students and parents may ask to change them; ordered by dragging. Record kit throughout.
 */
export function CustomFieldRecords({ meta, page, state }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t, fmt } = useI18n();
  const f = (x: Row) => x as FieldRow;
  const roles = (text: string) =>
    text
      ? text
          .split(', ')
          .map((r) => t(`si.role.${r}` as MessageKey))
          .join(', ')
      : t('si.fields.anyone');
  const columns: Column<Row>[] = [
    {
      id: 'label',
      header: t('si.fields.label'),
      sortKey: 'label',
      rowHeader: true,
      hideable: false,
      cell: (x) => (
        <span className="min-w-0">
          <b className="block truncate font-[550]">{f(x).label}</b>
          <small className="block truncate font-mono text-xs text-muted-foreground">{f(x).key}</small>
        </span>
      ),
    },
    { id: 'type', header: t('si.fields.type'), sortKey: 'type', cell: (x) => `${t(`si.fields.type.${f(x).type}` as MessageKey)}${f(x).optionsText ? `: ${f(x).optionsText}` : ''}` },
    { id: 'view', header: t('si.fields.view'), hideBelow: 'md', cell: (x) => roles(f(x).viewRolesText) },
    { id: 'edit', header: t('si.fields.edit'), hideBelow: 'lg', cell: (x) => roles(f(x).editRolesText) },
    { id: 'filled', header: t('si.fields.filled'), align: 'right', hideBelow: 'sm', cell: (x) => fmt.number(f(x).filled) },
    {
      id: 'state',
      header: t('si.col.status'),
      cell: (x) => (
        <span className="flex flex-wrap gap-1">
          <StatusPill tone={f(x).active ? 'success' : 'neutral'}>{t(f(x).active ? 'si.fields.inUse' : 'si.fields.off')}</StatusPill>
          {f(x).required && <StatusPill tone="info">{t('si.fields.required')}</StatusPill>}
        </span>
      ),
    },
  ];
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('si.tab.fields')}
      columns={columns}
      empty={
        <EmptyState icon={<SlidersHorizontal />} title={t('si.fields.none')} testId="no-custom-fields">
          {t('si.fields.noneBody')}
        </EmptyState>
      }
    />
  );
}
