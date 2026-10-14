'use client';

import { actionText } from '@/components/records/text';
import type { ActivityItem } from '@/components/templates';
import type { MessageKey } from '@/i18n/messages';
import { DataTable, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { statusTone, type AuditRow, type RequestRow, type Slot } from '@/lib/academics';

type T = ReturnType<typeof useI18n>['t'];

/** Audit rows as RecordPage activity: known actions are translated, others shown as written. */
export function toActivity(rows: AuditRow[], t: T): ActivityItem[] {
  return rows.map((r) => {
    const key = `acad.audit.${r.action}`;
    const label = t(key as MessageKey);
    return { id: String(r.id), at: r.at, actor: r.actor ?? t('acad.system'), action: label === key ? actionText(t, r.action) : label };
  });
}

export function Pill({ status, prefix = 'acad.status' }: { status: string; prefix?: string }) {
  const { t } = useI18n();
  return <StatusPill tone={statusTone(status)}>{t(`${prefix}.${status}` as MessageKey)}</StatusPill>;
}

/** A weekly timetable as a table: day, time, then the columns asked for. */
export function SlotTable({ slots, show, label }: { slots: Slot[]; show: ('section' | 'subject' | 'teacher' | 'room')[]; label: string }) {
  const { t } = useI18n();
  const cols: Column<Slot>[] = [
    { id: 'day', header: t('acad.col.day'), cell: (r) => t(`acad.day.${r.day}` as MessageKey), sort: (r) => r.day * 10000 + Number(r.startsAt.replace(':', '')) },
    { id: 'time', header: t('acad.col.time'), cell: (r) => `${r.startsAt}–${r.endsAt}`, sort: (r) => r.startsAt },
    ...show.map((k) => ({ id: k, header: t(`acad.col.${k}` as MessageKey), cell: (r: Slot) => r[k] ?? '—', sort: (r: Slot) => r[k] ?? '' })),
  ];
  return <DataTable columns={cols} rows={slots} rowId={(r) => r.id} label={label} pageSize={50} empty={t('acad.noPeriods')} bare />;
}

export function RequestList({ rows, label }: { rows: RequestRow[]; label: string }) {
  const { t, fmt } = useI18n();
  const cols: Column<RequestRow>[] = [
    { id: 'number', header: t('acad.col.number'), cell: (r) => r.number, sort: (r) => r.number, rowHeader: true },
    { id: 'kind', header: t('acad.col.kind'), cell: (r) => t(`acad.kind.${r.kind}` as MessageKey), sort: (r) => r.kind },
    { id: 'title', header: t('acad.col.title'), cell: (r) => r.title, sort: (r) => r.title, hideBelow: 'md' },
    { id: 'status', header: t('acad.col.status'), cell: (r) => <Pill status={r.status} />, sort: (r) => r.status },
    { id: 'createdAt', header: t('acad.col.raised'), cell: (r) => fmt.dateTime(r.createdAt), sort: (r) => r.createdAt, hideBelow: 'sm' },
  ];
  return <DataTable columns={cols} rows={rows} rowId={(r) => r.id} label={label} rowHref={(r) => `/academics/requests/${r.id}`} empty={t('acad.noRequests')} bare />;
}
