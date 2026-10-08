'use client';

import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useMemo } from 'react';
import { StatusPill } from '@/components/admissions/Chips';
import { DataTable, type Column, type TableFilter } from '@/components/ui/DataTable';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { STUDENT_STATUSES, type StudentRow } from '@/lib/admissions';

/** The student list: search, class and status filters, sortable columns, selection and CSV export. */
export function StudentsTable({ rows, initialQuery = '' }: { rows: StudentRow[]; initialQuery?: string }) {
  const { t } = useI18n();
  const columns: Column<StudentRow>[] = [
    {
      id: 'name',
      header: t('adm.field.name'),
      rowHeader: true,
      sort: (s) => s.fullName,
      cell: (s) => (
        <Typography component={Link} href={`/students/${s.id}`} variant="subtitle2" sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
          {s.fullName}
        </Typography>
      ),
    },
    { id: 'class', header: t('stu.class'), sort: (s) => s.className, cell: (s) => s.className },
    { id: 'roll', header: t('stu.roll'), sort: (s) => s.rollNo, cell: (s) => s.rollNo },
    { id: 'status', header: t('adm.col.status'), sort: (s) => t(`adm.stu.${s.status}` as MessageKey), cell: (s) => <StatusPill kind="student" status={s.status} /> },
  ];
  const filters = useMemo<TableFilter<StudentRow>[]>(() => {
    const classes = [...new Set(rows.map((r) => r.className))].sort();
    return [
      { id: 'class', label: t('stu.class'), options: classes.map((c) => ({ value: c, label: c })), match: (r, v) => r.className === v },
      { id: 'status', label: t('adm.col.status'), options: STUDENT_STATUSES.filter((s) => s !== 'applicant').map((s) => ({ value: s, label: t(`adm.stu.${s}` as MessageKey) })), match: (r, v) => r.status === v },
    ];
  }, [rows, t]);
  return <DataTable testId="students" label={t('nav.students')} columns={columns} rows={rows} rowId={(s) => s.id} filters={filters} selectable exportName="students" initialQuery={initialQuery} initialSort={{ id: 'name', dir: 'asc' }} />;
}
