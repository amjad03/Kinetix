'use client';

import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { DataTable, EmptyState, SectionTitle, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { DeptDashboard } from '@/lib/attendance-desk';
import { pctText } from './kit';

type Row = DeptDashboard['departments'][number];

/** The day across departments: periods marked, periods left unmarked, and attendance among the marks. */
export function DepartmentDay({ data }: { data: DeptDashboard }) {
  const { t, fmt } = useI18n();
  const columns: Column<Row>[] = [
    { id: 'dept', header: t('atd.col.department'), cell: (r) => r.department || t('atd.noDepartment'), sort: (r) => r.department, rowHeader: true },
    { id: 'marked', header: t('atd.col.periodsMarked'), cell: (r) => fmt.number(r.periodsMarked), sort: (r) => r.periodsMarked, align: 'right' },
    {
      id: 'unmarked',
      header: t('atd.col.unmarked'),
      cell: (r) => (r.unmarked ? <StatusPill tone="warning">{fmt.number(r.unmarked)}</StatusPill> : fmt.number(0)),
      sort: (r) => r.unmarked,
      csv: (r) => r.unmarked,
      align: 'right',
    },
    { id: 'present', header: t('atd.col.presentMarks'), cell: (r) => fmt.number(r.present), sort: (r) => r.present, align: 'right', hideBelow: 'sm' },
    { id: 'absent', header: t('atd.col.absentMarks'), cell: (r) => fmt.number(r.absent), sort: (r) => r.absent, align: 'right', hideBelow: 'sm' },
    { id: 'rate', header: t('atd.col.rate'), cell: (r) => pctText(r.rate, fmt), sort: (r) => r.rate ?? -1, align: 'right' },
  ];
  return (
    <>
      <SectionTitle>{t('atd.byDepartment')}</SectionTitle>
      <DataTable<Row>
        testId="department-day"
        label={t('atd.byDepartment')}
        columns={columns}
        rows={data.departments}
        rowId={(r) => r.departmentId ?? 'none'}
        exportName="attendance-by-department"
        empty={<EmptyState icon={<Building2 />} title={t('atd.noDepartments')} />}
      />
      {data.unmarked > 0 && (
        <p className="mt-2 text-sm">
          <Link href={`/attendance/unmarked?from=${data.date}&to=${data.date}`} className="text-teal-ink underline-offset-4 hover:underline">
            {t('atd.seeUnmarked', { n: fmt.number(data.unmarked) })}
          </Link>
        </p>
      )}
    </>
  );
}
