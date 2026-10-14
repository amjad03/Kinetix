'use client';

import { UserX } from 'lucide-react';
import { debarStudent, liftDebar, setOptin } from '@/app/(dashboard)/placements/actions';
import { Bar, Grid } from '@/components/ops/kit';
import { useDialog, useRun } from '@/components/procurement/useDialog';
import { Button } from '@/components/shadcn/button';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { Option } from '@/lib/procurement';

export interface OptinRow {
  id: string;
  studentId: string;
  fullName: string;
  rollNo: string;
  className: string;
  optedIn: boolean;
  reason: string | null;
  debarredUntil: string | null;
  debarReason: string | null;
}

/**
 * Students out of placements: those who opted out (higher studies, a venture) and those debarred (absent from a drive
 * they registered for, misconduct) until a day. The cell records an opt-out for a student, debars and lifts it.
 */
export function StudentStanding({ rows, students, canEdit, today }: { rows: OptinRow[]; students: Option[]; canEdit: boolean; today: string }) {
  const { t, fmt } = useI18n();
  const [open, dialog] = useDialog();
  const run = useRun();
  const shown = rows.filter((r) => !r.optedIn || (r.debarredUntil && r.debarredUntil >= today));
  return (
    <>
      {canEdit && (
        <Bar>
          <Button variant="outline" disabled={!students.length} onClick={() => open({ title: t('pd.st.optOut'), intro: t('pd.st.optOutHelp'), fields: [{ name: 'studentId', label: t('ops.f.student'), kind: 'select', required: true, options: students }, { name: 'reason', label: t('ho.reason'), required: true }], run: (v) => setOptin(v.studentId, { optedIn: 'no', reason: v.reason }) })}>
            {t('pd.st.optOut')}
          </Button>
          <Button variant="outline" disabled={!students.length} onClick={() => open({ title: t('pd.st.debar'), intro: t('pd.st.debarHelp'), fields: [{ name: 'studentId', label: t('ops.f.student'), kind: 'select', required: true, options: students }, { name: 'until', label: t('pd.st.until'), kind: 'date', required: true }, { name: 'reason', label: t('ho.reason'), required: true }], run: (v) => debarStudent(v.studentId, v) })}>
            {t('pd.st.debar')}
          </Button>
        </Bar>
      )}
      <Grid
        testId="pl-standing"
        empty={t('pd.st.none')}
        emptyIcon={<UserX />}
        rows={shown}
        exportName="placement-standing"
        cols={[
          { label: t('pd.rollNo'), cell: (r) => r.rollNo },
          { label: t('ops.f.student'), cell: (r) => r.fullName },
          { label: t('pd.class'), cell: (r) => r.className },
          { label: t('ops.f.status'), cell: (r) => (r.debarredUntil && r.debarredUntil >= today ? <StatusPill tone="danger">{t('pd.st.debarredUntil', { date: fmt.date(r.debarredUntil, 'short') })}</StatusPill> : <StatusPill tone="neutral">{t('pd.st.optedOut')}</StatusPill>) },
          { label: t('ho.reason'), cell: (r) => (r.debarredUntil && r.debarredUntil >= today ? r.debarReason : r.reason) ?? '—' },
          {
            label: '',
            cell: (r) =>
              canEdit ? (
                <div className="flex flex-wrap justify-end gap-2">
                  {r.debarredUntil && r.debarredUntil >= today && (
                    <Button size="sm" variant="outline" onClick={() => void run(() => liftDebar(r.studentId), t('pd.st.lifted'))}>
                      {t('pd.st.lift')}
                    </Button>
                  )}
                  {!r.optedIn && (
                    <Button size="sm" variant="outline" onClick={() => void run(() => setOptin(r.studentId, { optedIn: 'yes' }), t('pd.st.optedBack'))}>
                      {t('pd.st.optIn')}
                    </Button>
                  )}
                </div>
              ) : null,
          },
        ]}
      />
      {dialog}
    </>
  );
}
