'use client';

import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { RateCell } from '@/components/Bars';
import { initials } from '@/components/initials';
import { DataTable, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { rateOf, type AbsentStudent } from '@/lib/attendance';
import { hhmm } from '@/lib/dates';
import type { AttendanceDay } from '@/lib/types';

type ClassRow = AttendanceDay['sections'][number];

/** One day's attendance by class: marks, the rate, and which classes have not been marked. */
export function ClassAttendanceTable({ rows }: { rows: ClassRow[] }) {
  const { t } = useI18n();
  const rate = (s: ClassRow) => rateOf(s.present, s.absent, s.late);
  const columns: Column<ClassRow>[] = [
    {
      id: 'class',
      header: t('att.col.class'),
      rowHeader: true,
      sort: (s) => s.section,
      cell: (s) => (
        <>
          <Typography variant="subtitle2">{s.section}</Typography>
          {s.students === 0 && (
            <Typography variant="caption" color="text.secondary">
              {t('att.noStudents')}
            </Typography>
          )}
          {s.students !== 0 && s.marked === 0 && (
            <Typography variant="caption" color="error.main">
              {t('att.notMarked')}
            </Typography>
          )}
        </>
      ),
    },
    { id: 'students', header: t('att.col.students'), align: 'right', sort: (s) => s.students, cell: (s) => s.students },
    { id: 'marked', header: t('att.col.marked'), align: 'right', hideBelow: 'sm', sort: (s) => s.marked, cell: (s) => s.marked },
    { id: 'present', header: t('att.col.present'), align: 'right', sort: (s) => s.present, cell: (s) => s.present },
    { id: 'absent', header: t('att.col.absent'), align: 'right', sort: (s) => s.absent, cell: (s) => <Box component="span" sx={{ color: s.absent ? 'error.main' : undefined, fontWeight: s.absent ? 500 : undefined }}>{s.absent}</Box> },
    { id: 'late', header: t('att.col.late'), align: 'right', hideBelow: 'sm', sort: (s) => s.late, cell: (s) => s.late },
    { id: 'rate', header: t('att.col.rate'), align: 'right', width: 200, sort: rate, csv: (s) => rate(s), cell: (s) => <RateCell rate={rate(s)} /> },
  ];
  return <DataTable testId="attendance-table" label={t('att.byClass')} rows={rows} rowId={(s) => s.sectionId} exportName="attendance-by-class" columns={columns} />;
}

/** The students absent on the day, with the periods they missed. */
export function AbsenteesTable({ rows }: { rows: AbsentStudent[] }) {
  const { t } = useI18n();
  const marker = (s: AbsentStudent) => [...new Set(s.periods.map((p) => p.markedBy))].join(', ');
  const missed = (s: AbsentStudent) => s.periods.map((p) => `${hhmm(p.startsAt)} ${p.subject ?? t('att.unscheduled')}`).join(', ');
  const columns: Column<AbsentStudent>[] = [
    {
      id: 'student',
      header: t('att.col.student'),
      rowHeader: true,
      sort: (s) => s.student,
      csv: (s) => (s.rollNo ? `${s.student} (${s.rollNo})` : s.student),
      cell: (s) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: 'm3.primaryContainer', color: 'm3.onPrimaryContainer' }}>{initials(s.student)}</Avatar>
          <Box>
            <Typography variant="subtitle2" sx={{ whiteSpace: 'nowrap' }}>
              {s.student}
            </Typography>
            {s.rollNo && (
              <Typography variant="caption" color="text.secondary">
                {s.rollNo}
              </Typography>
            )}
          </Box>
        </Box>
      ),
    },
    { id: 'class', header: t('att.col.class'), sort: (s) => s.section, cell: (s) => <Box sx={{ whiteSpace: 'nowrap' }}>{s.section}</Box> },
    {
      id: 'absentFor',
      header: t('att.col.absentFor'),
      sort: (s) => s.periods.length,
      csv: missed,
      cell: (s) => (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {s.periods.map((p, i) => (
            <StatusPill key={i} tone="danger">{`${hhmm(p.startsAt)} ${p.subject ?? t('att.unscheduled')}`}</StatusPill>
          ))}
        </Box>
      ),
    },
    { id: 'markedBy', header: t('att.col.markedBy'), hideBelow: 'md', sort: marker, cell: marker },
  ];
  return <DataTable testId="absentees-table" label={t('att.col.student')} rows={rows} rowId={(s) => s.id} exportName="absentees" columns={columns} />;
}
