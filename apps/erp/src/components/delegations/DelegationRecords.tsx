'use client';

import { Ban, Forward } from 'lucide-react';
import { useTransition } from 'react';
import { bulkRecords } from '@/app/(dashboard)/records-actions';
import { RecordsTable } from '@/components/records/RecordsTable';
import { EmptyState, StatusPill, useToast, type Column, type RowAction } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

type DelegationRow = Row & { delegatorId: string; delegatorName: string; delegateName: string; scope: 'all' | 'workflows' | 'leave'; startsOn: string; endsOn: string; reason: string; state: 'active' | 'upcoming' | 'ended' | 'revoked' };
const TONE = { active: 'success', upcoming: 'info', ended: 'neutral', revoked: 'warning' } as const;

/**
 * Delegated approvals (record kit): the delegations a person gave or received (leaders see every one), with Add to
 * hand one's approvals to a colleague for some dates, edit, revoke, bin, export and history.
 */
export function DelegationRecords({ meta, page, state, userId, leader }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState; userId: string; leader: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [busy, start] = useTransition();
  const d = (x: Row) => x as DelegationRow;
  const columns: Column<Row>[] = [
    { id: 'delegator', header: t('ga.dg.col.from'), sortKey: 'delegator', rowHeader: true, hideable: false, cell: (x) => <span className="font-medium">{d(x).delegatorId === userId ? t('ga.dg.me') : d(x).delegatorName}</span> },
    { id: 'delegate', header: t('ga.dg.col.to'), sortKey: 'delegate', cell: (x) => d(x).delegateName },
    { id: 'scope', header: t('dg.col.scope'), hideBelow: 'sm', cell: (x) => t(`dg.scope.${d(x).scope}` as MessageKey) },
    { id: 'dates', header: t('dg.col.dates'), sortKey: 'starts', cell: (x) => `${fmt.date(d(x).startsOn, 'short')} – ${fmt.date(d(x).endsOn, 'short')}` },
    { id: 'state', header: t('dg.col.state'), cell: (x) => <StatusPill tone={TONE[d(x).state]}>{t(`dg.st.${d(x).state}` as MessageKey)}</StatusPill> },
    { id: 'reason', header: t('dg.col.reason'), hideBelow: 'md', cell: (x) => d(x).reason || <span className="text-muted-foreground">—</span> },
  ];
  const revoke = (x: DelegationRow) =>
    start(async () => {
      const res = await bulkRecords('delegations', { op: 'action', action: 'revoke', target: { ids: [x.id] } });
      if (!res.ok) return toast.error(res.error);
      if (res.data.rows[0]?.ok) toast.success(t('dg.revoked'));
      else toast.error(res.data.rows[0]?.message ?? t('error.generic'));
    });
  const extra = (x: Row): RowAction<Row>[] =>
    (d(x).delegatorId === userId || leader) && (d(x).state === 'active' || d(x).state === 'upcoming') ? [{ id: 'revoke', label: t('dg.revoke'), icon: <Ban />, tone: 'danger', disabled: busy, onSelect: () => revoke(d(x)) }] : [];
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('nav.delegations')}
      columns={columns}
      extraRowActions={extra}
      empty={
        <EmptyState icon={<Forward />} title={t('dg.empty')}>
          {t('ga.dg.emptyBody')}
        </EmptyState>
      }
    />
  );
}
