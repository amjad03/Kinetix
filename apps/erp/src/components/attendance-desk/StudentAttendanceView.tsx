'use client';

import { CalendarCheck2, Percent, TriangleAlert } from 'lucide-react';
import { DataTable, EmptyState, StatGrid, StatTile, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { eligibilityTone, type StudentAttendance, type SubjectTally } from '@/lib/attendance-desk';
import { cn } from '@/lib/utils';
import { pctText } from './kit';

const CELL: Record<string, string> = { present: 'bg-green-ink text-white', late: 'bg-amber-ink text-white', absent: 'bg-red-ink text-white', excused: 'bg-slate-ink text-white' };

/** One student's attendance: overall and per subject against the rules in force, and each day hour by hour. */
export function StudentAttendanceView({ data }: { data: StudentAttendance }) {
  const { t, fmt } = useI18n();
  const columns: Column<SubjectTally>[] = [
    { id: 'code', header: t('atd.col.code'), cell: (s) => s.code, sort: (s) => s.code },
    { id: 'subject', header: t('atd.col.subject'), cell: (s) => s.subject, sort: (s) => s.subject, rowHeader: true },
    { id: 'held', header: t('atd.col.attendedHeld'), cell: (s) => `${fmt.number(s.attended)}/${fmt.number(s.held)}`, sort: (s) => s.held, align: 'right' },
    { id: 'pct', header: t('atd.col.pct'), cell: (s) => pctText(s.pct, fmt), sort: (s) => s.pct ?? -1, align: 'right' },
    { id: 'effective', header: t('atd.col.effective'), cell: (s) => (s.condoned ? `${pctText(s.effective, fmt)} (+${fmt.number(s.condoned)})` : pctText(s.effective, fmt)), sort: (s) => s.effective ?? -1, align: 'right', hideBelow: 'sm' },
    { id: 'status', header: t('atd.col.status'), cell: (s) => <StatusPill tone={s.short ? 'danger' : s.effective !== null && s.effective < data.policy.warnPct ? 'warning' : 'success'}>{s.short ? t('atd.short') : t('atd.ok')}</StatusPill>, csv: (s) => (s.short ? 'short' : 'ok') },
  ];
  return (
    <div className="grid gap-6" data-testid="student-attendance">
      <StatGrid min={180}>
        <StatTile icon={<Percent />} label={t('atd.overall')} value={pctText(data.overall.effective, fmt)} caption={t('atd.attendedOf', { a: fmt.number(data.overall.attended), h: fmt.number(data.overall.held) })} />
        <StatTile icon={<TriangleAlert />} label={t('atd.col.status')} value={<StatusPill tone={data.warning ? 'warning' : eligibilityTone(data.status)}>{t(data.warning ? 'atd.elig.warning' : `atd.elig.${data.status}`)}</StatusPill>} caption={t('atd.policy.threshold', { n: fmt.number(data.policy.thresholdPct) })} />
        <StatTile icon={<CalendarCheck2 />} label={t('atd.window.title')} value={data.window.label || '—'} caption={`${fmt.date(data.window.from, 'short')} – ${fmt.date(data.window.to, 'short')}`} />
      </StatGrid>
      <DataTable<SubjectTally> testId="student-subjects" label={t('atd.bySubject')} columns={columns} rows={data.subjects} rowId={(s) => s.subjectId} exportName="student-attendance" empty={<EmptyState icon={<CalendarCheck2 />} title={t('atd.noMarks')} />} />
      <section aria-label={t('atd.dayByDay')}>
        <h2 className="mb-3 text-base font-semibold">{t('atd.dayByDay')}</h2>
        {data.days.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('atd.noMarks')}</p>
        ) : (
          <ul className="grid gap-2">
            {data.days.map((d) => (
              <li key={d.date} className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2">
                <span className="w-28 shrink-0 text-sm font-medium">{fmt.date(d.date, 'short')}</span>
                {d.marks.map((m, i) => (
                  <span key={i} className={cn('rounded px-2 py-0.5 text-xs font-semibold', CELL[m.status])} title={`${m.startsAt ?? ''} ${m.subject ?? t('atd.wholeDay')} · ${t(`atd.status.${m.status}` as MessageKey)}`}>
                    {m.code ?? t('atd.day')} {m.special ? '*' : ''}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
