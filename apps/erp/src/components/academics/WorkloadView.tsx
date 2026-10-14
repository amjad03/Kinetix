'use client';

import { Gauge } from 'lucide-react';
import { DataTable, EmptyState, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';

export interface WorkloadRow {
  teacherId: string;
  teacher: string;
  designation: string | null;
  department: string | null;
  norm: number;
  allocated: number;
  timetabled: number;
  periods: number;
  classes: number;
  status: 'over' | 'light' | 'ok';
  allocations: { hours: number; role: string; section: string; code: string; subject: string; batch: string | null }[];
}

const TONE = { over: 'danger', light: 'warning', ok: 'success' } as const;

/** The workload statement: each teacher's allocated and timetabled hours a week against the norm for their designation. */
export function WorkloadView({ rows }: { rows: WorkloadRow[] }) {
  const { t, fmt } = useI18n();
  const courses = (r: WorkloadRow) => r.allocations.map((a) => `${a.code} ${a.section}${a.batch ? ` (${a.batch})` : ''} ${fmt.number(a.hours)}`).join('; ');
  const columns: Column<WorkloadRow>[] = [
    { id: 'teacher', header: t('plan.col.teacher'), cell: (r) => r.teacher, sort: (r) => r.teacher, rowHeader: true },
    { id: 'designation', header: t('plan.col.designation'), cell: (r) => r.designation ?? '—', sort: (r) => r.designation ?? '', hideBelow: 'md' },
    { id: 'department', header: t('rk.col.department'), cell: (r) => r.department ?? '—', sort: (r) => r.department ?? '', hideBelow: 'lg' },
    { id: 'allocated', header: t('plan.col.allocated'), cell: (r) => fmt.number(r.allocated), sort: (r) => r.allocated, align: 'right' },
    { id: 'timetabled', header: t('plan.col.timetabled'), cell: (r) => fmt.number(r.timetabled), sort: (r) => r.timetabled, align: 'right' },
    { id: 'norm', header: t('plan.col.norm'), cell: (r) => fmt.number(r.norm), sort: (r) => r.norm, align: 'right', hideBelow: 'sm' },
    { id: 'classes', header: t('rk.col.classes'), cell: (r) => fmt.number(r.classes), sort: (r) => r.classes, align: 'right', hideBelow: 'lg' },
    { id: 'courses', header: t('plan.col.courses'), cell: (r) => <span className="line-clamp-2 max-w-[320px] text-xs">{courses(r) || '—'}</span>, csv: courses, hideBelow: 'lg' },
    { id: 'status', header: t('atd.col.status'), cell: (r) => <StatusPill tone={TONE[r.status]}>{t(`plan.load.${r.status}`)}</StatusPill>, sort: (r) => r.status, csv: (r) => r.status },
  ];
  return (
    <DataTable<WorkloadRow>
      testId="workload"
      label={t('plan.workload')}
      columns={columns}
      rows={rows}
      rowId={(r) => r.teacherId}
      exportName="workload-statement"
      initialSort={{ id: 'allocated', dir: 'desc' }}
      empty={
        <EmptyState icon={<Gauge />} title={t('plan.workloadEmpty')}>
          {t('plan.workloadEmptyBody')}
        </EmptyState>
      }
    />
  );
}
