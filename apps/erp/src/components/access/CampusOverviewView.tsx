'use client';

import { Building2 } from 'lucide-react';
import { DataTable, EmptyState, StatGrid, StatTile, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { CampusOverview } from '@/lib/governance-access';

type Campus = CampusOverview['campuses'][number];

/** Multi-campus overview: the institution's totals and one row of figures per campus. */
export function CampusOverviewView({ data }: { data: CampusOverview }) {
  const { t, fmt } = useI18n();
  const pct = (v: number | null) => (v === null ? t('ga.campus.notMarked') : `${fmt.number(v)}%`);
  const columns: Column<Campus>[] = [
    {
      id: 'name',
      header: t('ga.campus.col.name'),
      rowHeader: true,
      sort: (c) => c.name,
      cell: (c) => (
        <span className="inline-flex items-center gap-2 font-medium">
          {c.name}
          {!c.active && <StatusPill tone="neutral">{t('ga.campus.closed')}</StatusPill>}
        </span>
      ),
    },
    { id: 'head', header: t('ga.campus.col.head'), hideBelow: 'md', sort: (c) => c.head ?? '', cell: (c) => c.head ?? '' },
    { id: 'programmes', header: t('ga.campus.col.programmes'), align: 'right', sort: (c) => c.programmes, cell: (c) => fmt.number(c.programmes) },
    { id: 'classes', header: t('ga.campus.col.classes'), align: 'right', hideBelow: 'sm', sort: (c) => c.classes, cell: (c) => fmt.number(c.classes) },
    { id: 'students', header: t('ga.campus.col.students'), align: 'right', sort: (c) => c.students, cell: (c) => fmt.number(c.students) },
    { id: 'attendance', header: t('ga.campus.col.attendance'), align: 'right', hideBelow: 'sm', sort: (c) => c.attendanceToday ?? -1, cell: (c) => pct(c.attendanceToday) },
    { id: 'due', header: t('ga.campus.col.feesDue'), align: 'right', hideBelow: 'md', sort: (c) => c.feesDuePaise, cell: (c) => fmt.rupees(c.feesDuePaise) },
    { id: 'overdue', header: t('ga.campus.col.feesOverdue'), align: 'right', hideBelow: 'md', sort: (c) => c.feesOverduePaise, cell: (c) => (c.feesOverduePaise ? <span className="text-red-ink">{fmt.rupees(c.feesOverduePaise)}</span> : fmt.rupees(0)) },
    { id: 'rooms', header: t('ga.campus.col.rooms'), align: 'right', hideBelow: 'lg', sort: (c) => c.rooms, cell: (c) => `${fmt.number(c.buildings)} / ${fmt.number(c.rooms)}` },
  ];
  return (
    <>
      <StatGrid min={150}>
        <StatTile label={t('ga.campus.stat.campuses')} value={fmt.number(data.totals.campuses)} />
        <StatTile label={t('ga.campus.stat.students')} value={fmt.number(data.totals.students)} caption={t('ga.campus.stat.classes', { n: data.totals.classes })} />
        <StatTile label={t('ga.campus.stat.attendance')} value={pct(data.totals.attendanceToday)} caption={fmt.date(data.today, 'short')} />
        <StatTile label={t('ga.campus.stat.feesDue')} value={fmt.rupees(data.totals.feesDuePaise)} caption={t('ga.campus.stat.overdue', { amount: fmt.rupees(data.totals.feesOverduePaise) })} tone={data.totals.feesOverduePaise > 0 ? 'warning' : 'default'} />
      </StatGrid>
      <DataTable
        label={t('ga.campus.overview')}
        columns={columns}
        rows={data.campuses}
        rowId={(c) => c.id}
        exportName="campus-overview"
        testId="campus-overview"
        empty={
          <EmptyState icon={<Building2 />} title={t('ga.campus.none')}>
            {t('ga.campus.noneBody')}
          </EmptyState>
        }
      />
    </>
  );
}
