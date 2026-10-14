'use client';

import { UsersRound } from 'lucide-react';
import { RecordsTable } from '@/components/records/RecordsTable';
import { EmptyState, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

type DeptRow = Row & { name: string; headName: string | null; staffCount: number; subjectCount: number };

/** Departments as a record kit list: add, edit, head (bulk too), reorder, duplicate, recycle bin, import, export, history, saved views. */
export function DepartmentRecords({ meta, page, state }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t, fmt } = useI18n();
  const d = (x: Row) => x as DeptRow;
  const columns: Column<Row>[] = [
    { id: 'name', header: t('rk.col.department'), sortKey: 'name', rowHeader: true, hideable: false, cell: (x) => d(x).name },
    { id: 'head', header: t('rk.col.head'), sortKey: 'head', cell: (x) => d(x).headName ?? <span className="text-muted-foreground">{t('depts.noHead')}</span> },
    { id: 'staff', header: t('rk.col.staff'), sortKey: 'staff', align: 'right', hideBelow: 'sm', cell: (x) => fmt.number(d(x).staffCount) },
    { id: 'subjects', header: t('rk.col.subjects'), sortKey: 'subjects', align: 'right', hideBelow: 'sm', cell: (x) => fmt.number(d(x).subjectCount) },
  ];
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('nav.departments')}
      columns={columns}
      rowHref={(x) => `/department?dept=${x.id}`}
      empty={
        <EmptyState icon={<UsersRound />} title={t('depts.none')} testId="no-departments">
          {t('depts.noneBody')}
        </EmptyState>
      }
    />
  );
}
