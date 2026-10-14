'use client';

import { Send, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { sendFeeReminders } from '@/app/(dashboard)/students/sheet-actions';
import { StatusPill } from '@/components/admissions/Chips';
import { RecordsTable } from '@/components/records/RecordsTable';
import { Avatar, AvatarFallback } from '@/components/shadcn/avatar';
import { useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { StudentStatus } from '@/lib/admissions';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { initials, type FeeState, type RosterRow } from '@/lib/roster';
import { AttendanceBar, FeeBadge } from './RosterBits';
import { StudentSheet } from './StudentSheet';

/** A student as the kit lists them (GET /v1/records/students), plus attendance and fees for this page's rows. */
export type StudentKitRow = Row & {
  fullName: string;
  rollNo: string;
  status: StudentStatus;
  sectionId: string;
  className: string;
  programId: string;
  programName: string;
  term: number;
  guardianCount: number;
  attendancePct: number | null;
  fee: FeeState | null;
  duePaise: number;
};

/**
 * Students: the reference module of the record depth kit. Search, filters, sort and pages on the server; quick view
 * in a side sheet, the full profile, edit, move between classes and programmes (with a reason, kept in the student's
 * record), bulk promote, fee reminders, import, export, history, the recycle bin and saved views.
 */
export function StudentRecords({ meta, page, state, showFees, showAttendance, canRemind, empty }: { meta: RecordMeta; page: RecordsPage<StudentKitRow>; state: ListState; showFees: boolean; showAttendance: boolean; canRemind: boolean; empty: React.ReactNode }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState<RosterRow | null>(null);
  const [, start] = useTransition();

  const remind = (ids: string[]) =>
    start(async () => {
      const res = await sendFeeReminders(ids);
      if (!res.ok) toast.error(res.error);
      else if (res.data.reminded === 0) toast.info(t('ro.remindNone'));
      else toast.success(t('ro.reminded', { n: res.data.reminded }));
    });

  const columns = useMemo<Column<Row>[]>(() => {
    const r = (x: Row) => x as StudentKitRow;
    return [
      {
        id: 'student',
        header: t('ro.col.student'),
        sortKey: 'name',
        rowHeader: true,
        cell: (x) => (
          <span className="flex max-w-[220px] min-w-0 items-center gap-2.5 sm:max-w-none">
            <Avatar className="size-8">
              <AvatarFallback className="bg-teal-soft text-[11.5px] font-semibold text-teal-ink">{initials(r(x).fullName)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0">
              <b className="block truncate text-[13.5px] font-[550]">{r(x).fullName}</b>
              <small className="block truncate text-xs font-normal text-muted-foreground">
                <span className="sm:hidden">{r(x).rollNo} · </span>
                {r(x).className}
              </small>
            </span>
          </span>
        ),
      },
      { id: 'roll', header: t('ro.col.roll'), sortKey: 'roll', hideBelow: 'sm', cell: (x) => <span className="tabular-nums text-muted-foreground">{r(x).rollNo}</span> },
      {
        id: 'programme',
        header: t('ro.col.programme'),
        sortKey: 'programme',
        hideBelow: 'lg',
        cell: (x) => (
          <>
            {r(x).programName}
            <span className="text-muted-foreground"> · {t('ro.f.sem', { n: r(x).term })}</span>
          </>
        ),
      },
      { id: 'class', header: t('ro.f.section'), sortKey: 'class', defaultHidden: true, cell: (x) => r(x).className },
      ...(showAttendance ? [{ id: 'attendance', header: t('ro.col.attendance'), hideBelow: 'md' as const, cell: (x: Row) => <AttendanceBar pct={r(x).attendancePct} /> }] : []),
      ...(showFees ? [{ id: 'fees', header: t('ro.col.fees'), cell: (x: Row) => <FeeBadge state={r(x).fee} /> }] : []),
      { id: 'guardians', header: t('rk.col.guardians'), align: 'right', defaultHidden: true, cell: (x) => r(x).guardianCount },
      { id: 'status', header: t('ro.col.status'), sortKey: 'status', hideBelow: 'md', cell: (x) => <StatusPill kind="student" status={r(x).status} /> },
    ];
  }, [t, showFees, showAttendance]);

  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('nav.students')}
        columns={columns}
        empty={empty}
        onView={(x) => setOpen(x as StudentKitRow)}
        extraRowActions={(x) => [
          { id: 'profile', label: t('ro.fullProfile'), icon: <UserRound />, onSelect: () => router.push(`/students/${x.id}`) },
          ...(canRemind && (x as StudentKitRow).duePaise > 0 ? [{ id: 'remind', label: t('ro.remind'), icon: <Send />, onSelect: () => remind([x.id]) }] : []),
        ]}
        extraBulkActions={canRemind ? [{ id: 'remind', label: t('ro.remind'), icon: <Send />, onClick: (rows) => remind(rows.map((x) => x.id)) }] : []}
        testId="students-records"
      />
      {open && <StudentSheet key={open.id} row={open} onClose={() => setOpen(null)} canRemind={canRemind} showFees={showFees} showAttendance={showAttendance} />}
    </>
  );
}
