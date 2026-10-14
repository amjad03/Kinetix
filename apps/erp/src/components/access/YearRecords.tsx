'use client';

import { CalendarCheck, CalendarDays, CalendarPlus, CalendarRange } from 'lucide-react';
import { useState, useTransition } from 'react';
import { bulkRecords } from '@/app/(dashboard)/records-actions';
import { BulkReportDialog } from '@/components/records/BulkReportDialog';
import { RecordsTable } from '@/components/records/RecordsTable';
import { EmptyState, StatusPill, useToast, type Column, type RowAction } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { BulkReport, ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

type YearRow = Row & { label: string; startsOn: string; endsOn: string; isCurrent: boolean; state: 'current' | 'past' | 'upcoming' | 'open'; termCount: number; classCount: number; studentCount: number };
type TermRow = Row & { name: string; yearLabel: string; startsOn: string; endsOn: string; days: number; programNames: string[] | null };

const STATE_TONE = { current: 'success', open: 'info', upcoming: 'info', past: 'neutral' } as const;

/** Academic years (record kit): add, edit, make current, roll over to the next year with its terms, bin, import, export. */
export function YearRecords({ meta, page, state }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [report, setReport] = useState<{ report: BulkReport; title: string } | null>(null);
  const y = (x: Row) => x as YearRow;
  const columns: Column<Row>[] = [
    {
      id: 'label',
      header: t('ga.years.col.year'),
      sortKey: 'label',
      rowHeader: true,
      hideable: false,
      cell: (x) => <span className="font-medium whitespace-nowrap">{y(x).label}</span>,
    },
    { id: 'dates', header: t('ga.years.col.dates'), sortKey: 'starts', cell: (x) => <span className="whitespace-nowrap">{`${fmt.date(y(x).startsOn, 'long')} – ${fmt.date(y(x).endsOn, 'long')}`}</span> },
    { id: 'state', header: t('ga.years.col.state'), cell: (x) => <StatusPill tone={STATE_TONE[y(x).state]}>{t(`ga.years.state.${y(x).state}` as MessageKey)}</StatusPill> },
    { id: 'terms', header: t('ga.years.col.terms'), align: 'right', hideBelow: 'sm', cell: (x) => fmt.number(y(x).termCount) },
    { id: 'classes', header: t('ga.years.col.classes'), sortKey: 'classes', align: 'right', hideBelow: 'md', cell: (x) => fmt.number(y(x).classCount) },
    { id: 'students', header: t('ga.years.col.students'), sortKey: 'students', align: 'right', hideBelow: 'md', cell: (x) => fmt.number(y(x).studentCount) },
  ];
  const action = (row: YearRow, key: 'makeCurrent' | 'rollOver') =>
    start(async () => {
      const res = await bulkRecords('academic-years', { op: 'action', action: key, target: { ids: [row.id] } });
      if (!res.ok) return toast.error(res.error);
      const r = res.data.rows[0];
      if (r?.ok) toast.success(t(key === 'makeCurrent' ? 'ga.years.madeCurrent' : 'ga.years.rolledOver', { label: r.message ?? row.label }));
      else setReport({ report: res.data, title: t(`rk.action.academic-years.${key}` as MessageKey) });
    });
  const extra = (x: Row): RowAction<Row>[] =>
    meta.can.write
      ? [
          { id: 'current', label: t('rk.action.academic-years.makeCurrent'), icon: <CalendarCheck />, disabled: y(x).isCurrent || busy, onSelect: () => action(y(x), 'makeCurrent') },
          { id: 'roll', label: t('rk.action.academic-years.rollOver'), icon: <CalendarPlus />, disabled: busy, onSelect: () => action(y(x), 'rollOver') },
        ]
      : [];
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('ga.years.title')}
        columns={columns}
        extraParams={{ view: 'years' }}
        rowHref={(x) => `/settings/academic-years?view=terms&f.year=${x.id}`}
        extraRowActions={extra}
        empty={
          <EmptyState icon={<CalendarDays />} title={t('ga.years.none')}>
            {t('ga.years.noneBody')}
          </EmptyState>
        }
      />
      {report && <BulkReportDialog report={report.report} title={report.title} onClose={() => setReport(null)} />}
    </>
  );
}

/** Terms and semesters (record kit): inside their year, no overlaps for the same programmes. */
export function TermRecords({ meta, page, state }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t, fmt } = useI18n();
  const r = (x: Row) => x as TermRow;
  const columns: Column<Row>[] = [
    { id: 'name', header: t('ga.terms.col.term'), sortKey: 'name', rowHeader: true, hideable: false, cell: (x) => <span className="font-medium">{r(x).name}</span> },
    { id: 'year', header: t('ga.terms.col.year'), sortKey: 'year', cell: (x) => r(x).yearLabel },
    { id: 'dates', header: t('ga.years.col.dates'), sortKey: 'starts', cell: (x) => <span className="whitespace-nowrap">{`${fmt.date(r(x).startsOn, 'long')} – ${fmt.date(r(x).endsOn, 'long')}`}</span> },
    { id: 'days', header: t('ga.terms.col.days'), sortKey: 'days', align: 'right', hideBelow: 'sm', cell: (x) => fmt.number(r(x).days) },
    { id: 'programmes', header: t('ga.terms.col.programmes'), hideBelow: 'md', cell: (x) => (r(x).programNames?.length ? r(x).programNames!.join(', ') : <span className="text-muted-foreground">{t('ga.terms.allProgrammes')}</span>) },
  ];
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('ga.terms.title')}
      columns={columns}
      extraParams={{ view: 'terms' }}
      empty={
        <EmptyState icon={<CalendarRange />} title={t('ga.terms.none')}>
          {t('ga.terms.noneBody')}
        </EmptyState>
      }
    />
  );
}
