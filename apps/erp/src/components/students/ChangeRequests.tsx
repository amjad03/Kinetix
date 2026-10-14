'use client';

import { ClipboardCheck } from 'lucide-react';
import { RecordsTable } from '@/components/records/RecordsTable';
import { EmptyState, StatusPill, type Column, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

type RequestRow = Row & { field: string; studentId: string; studentName: string; rollNo: string; className: string; fieldLabel: string; currentValue: string | null; newValue: string; reason: string; status: string; requestedAs: string; requesterName: string | null; deciderName: string | null; decisionNote: string | null; createdAt: string };

/** A profile field's name in the reader's language (custom fields keep the institution's own label). */
export const fieldName = (t: (k: MessageKey) => string, field: string, label: string) => (field.startsWith('custom.') ? label : t(`si.f.${field}` as MessageKey));

export const REQUEST_TONE: Record<string, Tone> = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral' };

/**
 * Profile change requests from students, parents and staff: what is on record, what is asked for and why; approve
 * (the change is written to the profile) or reject with a note, one by one or in bulk.
 */
export function ChangeRequests({ meta, page, state }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t, fmt } = useI18n();
  const r = (x: Row) => x as RequestRow;
  const columns: Column<Row>[] = [
    { id: 'created', header: t('si.col.askedOn'), sortKey: 'created', hideBelow: 'md', cell: (x) => fmt.date(r(x).createdAt.slice(0, 10), 'short') },
    {
      id: 'student',
      header: t('si.col.student'),
      sortKey: 'student',
      rowHeader: true,
      hideable: false,
      cell: (x) => (
        <span className="min-w-0">
          <b className="block truncate font-[550]">{r(x).studentName}</b>
          <small className="block truncate text-xs text-muted-foreground">
            {r(x).rollNo} · {r(x).className}
          </small>
        </span>
      ),
    },
    {
      id: 'change',
      header: t('si.col.change'),
      sortKey: 'field',
      cell: (x) => (
        <span className="block max-w-[360px] min-w-0">
          <b className="block font-[550]">{fieldName(t, r(x).field, r(x).fieldLabel)}</b>
          <small className="block text-xs text-muted-foreground">
            <s>{r(x).currentValue ?? '—'}</s> → <span className="text-foreground">{r(x).newValue}</span>
          </small>
        </span>
      ),
    },
    { id: 'reason', header: t('si.col.reason'), hideBelow: 'lg', cell: (x) => <span className="line-clamp-2 max-w-[280px]">{r(x).reason}</span> },
    { id: 'by', header: t('si.col.askedBy'), hideBelow: 'md', cell: (x) => `${t(`si.o.requestedAs.${r(x).requestedAs}` as MessageKey)}${r(x).requesterName ? ` · ${r(x).requesterName}` : ''}` },
    {
      id: 'status',
      header: t('si.col.status'),
      sortKey: 'status',
      cell: (x) => (
        <span className="grid gap-0.5">
          <StatusPill tone={REQUEST_TONE[r(x).status] ?? 'neutral'}>{t(`si.o.requestStatus.${r(x).status}` as MessageKey)}</StatusPill>
          {r(x).decisionNote && <small className="text-xs text-muted-foreground">{r(x).decisionNote}</small>}
        </span>
      ),
    },
  ];
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('si.tab.requests')}
      columns={columns}
      rowHref={(x) => `/students/${r(x).studentId}?tab=details`}
      rowActionKeys={['approve', 'reject']}
      actionParams={{
        approve: [{ key: 'note', label: t('si.note'), type: 'textarea' }],
        reject: [{ key: 'note', label: t('si.rejectWhy'), type: 'textarea', required: true, min: 3 }],
      }}
      empty={
        <EmptyState icon={<ClipboardCheck />} title={t('si.requests.none')} testId="no-change-requests">
          {t('si.requests.noneBody')}
        </EmptyState>
      }
    />
  );
}
