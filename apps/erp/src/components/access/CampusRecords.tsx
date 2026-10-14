'use client';

import { Building2 } from 'lucide-react';
import { RecordsTable } from '@/components/records/RecordsTable';
import { EmptyState, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

type CampusRow = Row & { name: string; code: string | null; city: string | null; headName: string | null; active: boolean; programCount: number; studentCount: number; buildingCount: number };

/** Campuses (record kit): details, head, order, open or closed, duplicate, bin, import and export. */
export function CampusRecords({ meta, page, state }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t, fmt } = useI18n();
  const c = (x: Row) => x as CampusRow;
  const columns: Column<Row>[] = [
    {
      id: 'name',
      header: t('ga.campus.col.name'),
      sortKey: 'name',
      rowHeader: true,
      hideable: false,
      cell: (x) => (
        <span className="inline-flex items-center gap-2 font-medium">
          {c(x).name}
          {c(x).code && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{c(x).code}</span>}
        </span>
      ),
    },
    { id: 'city', header: t('ga.campus.col.city'), sortKey: 'city', hideBelow: 'sm', cell: (x) => c(x).city ?? '' },
    { id: 'head', header: t('ga.campus.col.head'), hideBelow: 'md', cell: (x) => c(x).headName ?? <span className="text-muted-foreground">{t('ga.campus.noHead')}</span> },
    { id: 'status', header: t('ga.campus.col.status'), cell: (x) => <StatusPill tone={c(x).active ? 'success' : 'neutral'}>{t(c(x).active ? 'ga.campus.open' : 'ga.campus.closed')}</StatusPill> },
    { id: 'programmes', header: t('ga.campus.col.programmes'), sortKey: 'programs', align: 'right', hideBelow: 'sm', cell: (x) => fmt.number(c(x).programCount) },
    { id: 'students', header: t('ga.campus.col.students'), sortKey: 'students', align: 'right', hideBelow: 'sm', cell: (x) => fmt.number(c(x).studentCount) },
    { id: 'buildings', header: t('ga.campus.col.buildings'), align: 'right', hideBelow: 'md', defaultHidden: true, cell: (x) => fmt.number(c(x).buildingCount) },
  ];
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('ga.campus.title')}
      columns={columns}
      extraParams={{ view: 'list' }}
      empty={
        <EmptyState icon={<Building2 />} title={t('ga.campus.none')}>
          {t('ga.campus.noneBody')}
        </EmptyState>
      }
    />
  );
}
