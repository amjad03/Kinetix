'use client';

import { BellRing, CircleCheck, PencilLine } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { remindUnmarked } from '@/app/(dashboard)/attendance/desk-actions';
import { DataTable, EmptyState, StatusPill, useToast, type BulkAction, type Column, type RowAction } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { DayPeriod } from '@/lib/attendance-desk';

type Row = DayPeriod & { key: string };

/** Periods that met and have no attendance: mark one, or (heads and the principal) remind the teachers. */
export function UnmarkedTable({ rows, canRemind }: { rows: DayPeriod[]; canRemind: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const data: Row[] = rows.map((r) => ({ ...r, key: `${r.slotId}|${r.date}` }));
  const remind = async (list: Row[]) => {
    const res = await remindUnmarked(list.map((r) => ({ slotId: r.slotId, date: r.date })));
    if (!res.ok) return toast.error(res.error);
    toast.success(t('atd.reminded', { n: fmt.number(res.data.reminded) }));
  };
  const columns: Column<Row>[] = [
    { id: 'date', header: t('atd.col.date'), cell: (r) => fmt.date(r.date, 'short'), sort: (r) => r.date },
    { id: 'time', header: t('atd.col.time'), cell: (r) => `${r.startsAt}–${r.endsAt}`, sort: (r) => r.startsAt, hideBelow: 'sm' },
    { id: 'section', header: t('atd.col.class'), cell: (r) => r.section, sort: (r) => r.section },
    { id: 'subject', header: t('atd.col.subject'), cell: (r) => r.subject, sort: (r) => r.subject, rowHeader: true },
    { id: 'teacher', header: t('atd.col.teacher'), cell: (r) => (r.substitute ? `${r.teacher} (${t('atd.substitute')})` : r.teacher), sort: (r) => r.teacher, hideBelow: 'md' },
    { id: 'batch', header: t('atd.col.batch'), cell: (r) => (r.batch ? <StatusPill tone="info">{r.batch}</StatusPill> : '—'), csv: (r) => r.batch ?? '', hideBelow: 'lg' },
  ];
  const rowActions = (): RowAction<Row>[] => [
    { id: 'mark', label: t('atd.markNow'), icon: <PencilLine />, onSelect: (r) => router.push(`/attendance/mark?slot=${r.slotId}&date=${r.date}`) },
    ...(canRemind ? [{ id: 'remind', label: t('atd.remind'), icon: <BellRing />, onSelect: (r: Row) => void remind([r]) }] : []),
  ];
  const bulk: BulkAction<Row>[] = canRemind ? [{ id: 'remind', label: t('atd.remind'), icon: <BellRing />, onClick: (list) => remind(list) }] : [];
  return (
    <DataTable<Row>
      testId="unmarked-table"
      label={t('atd.unmarked.title')}
      columns={columns}
      rows={data}
      rowId={(r) => r.key}
      selectable={canRemind}
      bulkActions={bulk}
      rowActions={rowActions}
      exportName="unmarked-periods"
      empty={
        <EmptyState icon={<CircleCheck />} title={t('atd.unmarked.none')}>
          {t('atd.unmarked.noneBody')}
        </EmptyState>
      }
    />
  );
}
