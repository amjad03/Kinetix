'use client';
import { RateCell } from '@/components/Bars';
import { initials } from '@/components/initials';
import { DataTable, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { rateOf, type AbsentStudent } from '@/lib/attendance';
import { hhmm } from '@/lib/dates';
import type { AttendanceDay } from '@/lib/types';

import { Avatar } from '@/components/kx';
import { cn } from '@/lib/utils';
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
          <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{s.section}</h6>
          {s.students === 0 && (
            <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
              {t('att.noStudents')}
            </span>
          )}
          {s.students !== 0 && s.marked === 0 && (
            <span className="text-xs leading-4 tracking-[0.3px] text-red-ink">
              {t('att.notMarked')}
            </span>
          )}
        </>
      ),
    },
    { id: 'students', header: t('att.col.students'), align: 'right', sort: (s) => s.students, cell: (s) => s.students },
    { id: 'marked', header: t('att.col.marked'), align: 'right', hideBelow: 'sm', sort: (s) => s.marked, cell: (s) => s.marked },
    { id: 'present', header: t('att.col.present'), align: 'right', sort: (s) => s.present, cell: (s) => s.present },
    { id: 'absent', header: t('att.col.absent'), align: 'right', sort: (s) => s.absent, cell: (s) => <span className={cn(s.absent ? 'text-red-ink' : '', s.absent ? 'font-medium' : '')}>{s.absent}</span> },
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
        <div className="flex items-center gap-3">
          <Avatar className="w-[32px] h-[32px] text-[13px] bg-teal-soft text-teal-ink">{initials(s.student)}</Avatar>
          <div>
            <h6 className="text-sm leading-5 font-medium tracking-[0.1px] whitespace-nowrap">
              {s.student}
            </h6>
            {s.rollNo && (
              <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                {s.rollNo}
              </span>
            )}
          </div>
        </div>
      ),
    },
    { id: 'class', header: t('att.col.class'), sort: (s) => s.section, cell: (s) => <div className="whitespace-nowrap">{s.section}</div> },
    {
      id: 'absentFor',
      header: t('att.col.absentFor'),
      sort: (s) => s.periods.length,
      csv: missed,
      cell: (s) => (
        <div className="flex flex-wrap gap-1.5">
          {s.periods.map((p, i) => (
            <StatusPill key={i} tone="danger">{`${hhmm(p.startsAt)} ${p.subject ?? t('att.unscheduled')}`}</StatusPill>
          ))}
        </div>
      ),
    },
    { id: 'markedBy', header: t('att.col.markedBy'), hideBelow: 'md', sort: marker, cell: marker },
  ];
  return <DataTable testId="absentees-table" label={t('att.col.student')} rows={rows} rowId={(s) => s.id} exportName="absentees" columns={columns} />;
}
