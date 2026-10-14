'use client';

import { FileText, HandHeart, ListChecks } from 'lucide-react';
import { useMemo } from 'react';
import { RecordsTable } from '@/components/records/RecordsTable';
import { tr } from '@/components/records/text';
import { EmptyState, StatusPill, type Column, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

export type ApprovalEntity = 'attendance-corrections' | 'attendance-condonations';
type R = Row & Record<string, string | number | boolean | null>;
const TONE: Record<string, Tone> = { pending: 'warning', approved: 'success', rejected: 'danger', none: 'neutral', due: 'warning', paid: 'success', waived: 'neutral' };

/** Attendance approvals as kit lists: corrections to locked registers and condonation requests, decided in bulk. */
export function ApprovalRecords({ entity, meta, page, state }: { entity: ApprovalEntity; meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t, fmt } = useI18n();
  const columns = useMemo<Column<Row>[]>(() => {
    const v = (x: Row) => x as R;
    const status = (x: Row) => <StatusPill tone={TONE[String(v(x).status)] ?? 'neutral'}>{tr(t, `rk.o.${entity}.status.${v(x).status}`, String(v(x).status))}</StatusPill>;
    if (entity === 'attendance-corrections')
      return [
        { id: 'student', header: t('atd.col.student'), sortKey: 'student', rowHeader: true, hideable: false, cell: (x) => `${v(x).rollNo} ${v(x).fullName}` },
        { id: 'class', header: t('atd.col.class'), sortKey: 'class', hideBelow: 'md', cell: (x) => v(x).section },
        { id: 'subject', header: t('atd.col.subject'), hideBelow: 'sm', cell: (x) => v(x).subject },
        { id: 'date', header: t('atd.col.date'), sortKey: 'date', cell: (x) => fmt.date(String(v(x).date), 'short') },
        { id: 'change', header: t('atd.col.change'), cell: (x) => `${v(x).fromStatus ? t(`atd.status.${v(x).fromStatus}` as MessageKey) : '—'} → ${t(`atd.status.${v(x).toStatus}` as MessageKey)}` },
        { id: 'reason', header: t('atd.col.reason'), hideBelow: 'lg', cell: (x) => <span className="line-clamp-2 max-w-[260px]">{String(v(x).reason)}</span> },
        { id: 'by', header: t('atd.col.askedBy'), hideBelow: 'lg', cell: (x) => v(x).requestedBy ?? '—' },
        { id: 'status', header: t('atd.col.status'), sortKey: 'status', cell: status },
      ];
    return [
      { id: 'student', header: t('atd.col.student'), sortKey: 'student', rowHeader: true, hideable: false, cell: (x) => `${v(x).rollNo} ${v(x).fullName}` },
      { id: 'class', header: t('atd.col.class'), sortKey: 'class', hideBelow: 'md', cell: (x) => v(x).section },
      { id: 'subject', header: t('atd.col.subject'), hideBelow: 'sm', cell: (x) => v(x).subject ?? t('atd.overall') },
      { id: 'kind', header: t('atd.col.kind'), hideBelow: 'md', cell: (x) => t(`atd.kind.${v(x).kind}` as MessageKey) },
      { id: 'reason', header: t('atd.col.reason'), hideBelow: 'lg', cell: (x) => <span className="line-clamp-2 max-w-[260px]">{String(v(x).reason)}</span> },
      { id: 'status', header: t('atd.col.status'), sortKey: 'status', cell: status },
      { id: 'points', header: t('atd.col.points'), sortKey: 'points', align: 'right', cell: (x) => (Number(v(x).approvedPoints) ? `+${fmt.number(Number(v(x).approvedPoints))}` : '—') },
      { id: 'fee', header: t('atd.col.fee'), hideBelow: 'md', cell: (x) => (Number(v(x).feePaise) > 0 ? <StatusPill tone={TONE[String(v(x).feeStatus)] ?? 'neutral'}>{`₹${fmt.number(Number(v(x).feePaise) / 100)} · ${tr(t, `rk.o.${entity}.fee.${v(x).feeStatus}`, String(v(x).feeStatus))}`}</StatusPill> : '—') },
    ];
  }, [entity, t, fmt]);
  return (
    <RecordsTable
      key={entity}
      meta={meta}
      page={page}
      state={state}
      label={tr(t, `rk.entity.${entity}`, entity)}
      columns={columns}
      extraParams={{ tab: entity === 'attendance-corrections' ? 'corrections' : 'condonations' }}
      extraRowActions={(row) => (entity === 'attendance-condonations' && (row as R).hasDocument ? [{ id: 'doc', label: t('atd.document'), icon: <FileText />, onSelect: (r) => window.open(`/api/download?kind=condonation-doc&id=${r.id}`, '_blank', 'noopener') }] : [])}
      empty={
        <EmptyState icon={entity === 'attendance-corrections' ? <ListChecks /> : <HandHeart />} title={t(entity === 'attendance-corrections' ? 'atd.corrections.empty' : 'atd.condonations.empty')}>
          {t(entity === 'attendance-corrections' ? 'atd.corrections.emptyBody' : 'atd.condonations.emptyBody')}
        </EmptyState>
      }
    />
  );
}
