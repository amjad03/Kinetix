import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined';
import PersonOffOutlined from '@mui/icons-material/PersonOffOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { MiniBar } from '@/components/Bars';
import { AbsenteesTable, ClassAttendanceTable } from '@/components/attendance/AttendanceTables';
import { LiveAttendance } from '@/components/attendance/LiveAttendance';
import { DateNav } from '@/components/DateNav';
import { NoClasses } from '@/components/NoClasses';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { I18n } from '@/i18n/format';
import { isoWeekday } from '@/lib/dates';
import { rateOf, type AbsentStudent } from '@/lib/attendance';
import { dateParam, schoolToday } from '@/lib/school';
import type { AttendanceDay } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.attendance') };
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireSection('school');
  const date = dateParam((await searchParams).date);
  const today = schoolToday();
  const res = await load(() => api<AttendanceDay>(`/v1/admin/attendance?date=${date}`));
  const i18n = await getI18n();
  const { t, fmt } = i18n;

  return (
    <>
      <LiveAttendance date={date} />
      <PageHeader
        title={t('nav.attendance')}
        subtitle={`${fmt.date(date, 'long')}${date === today ? '' : ` · ${fmt.relativeDay(date, today)}`}`}
        actions={<DateNav date={date} today={today} />}
      />
      {res.error !== undefined ? <ErrorState message={res.error} /> : <AttendanceView a={res.data} date={date} today={today} i18n={i18n} />}
    </>
  );
}

function AttendanceView({ a, date, today, i18n: { t } }: { a: AttendanceDay; date: string; today: string; i18n: I18n }) {
  const tot = a.sections.reduce(
    (s, r) => ({ present: s.present + r.present, absent: s.absent + r.absent, late: s.late + r.late, marked: s.marked + r.marked, students: s.students + r.students }),
    { present: 0, absent: 0, late: 0, marked: 0, students: 0 },
  );
  const marks = tot.present + tot.absent + tot.late;
  if (marks === 0) {
    if (isoWeekday(date) === 7) return <NoClasses date={date} today={today} path="/attendance" />;
    return (
      <EmptyState icon={<FactCheckOutlined />} title={date > today ? t('att.notDueYet') : t('att.noneMarked')} testId="no-attendance">
        {t('att.noneBody')}
      </EmptyState>
    );
  }

  // One row per absent student, with the periods they missed.
  const byStudent = new Map<string, AbsentStudent>();
  for (const r of a.absentees) {
    const e = byStudent.get(r.studentId) ?? { id: r.studentId, student: r.student, rollNo: r.rollNo, section: r.section, periods: [] };
    e.periods.push({ subject: r.subject, startsAt: r.startsAt, markedBy: r.markedBy });
    byStudent.set(r.studentId, e);
  }
  const absentees = [...byStudent.values()];
  const rate = rateOf(tot.present, tot.absent, tot.late);
  const classesMarked = a.sections.filter((s) => s.present + s.absent + s.late > 0).length;
  const classesWithStudents = a.sections.filter((s) => s.students > 0).length;

  return (
    <>
      <StatGrid min={150}>
        <StatTile
          testId="att-rate"
          icon={<FactCheckOutlined />}
          label={t('att.rate')}
          value={rate === null ? '—' : `${rate}%`}
          bar={rate === null ? undefined : <MiniBar value={rate} color={rate >= 90 ? 'kx.success' : rate >= 75 ? 'primary.main' : 'error.main'} />}
          caption={t('att.periodMarks', { n: marks })}
        />
        <StatTile testId="att-absent" icon={<PersonOffOutlined />} label={t('att.absentStudents')} value={absentees.length} caption={t('att.absentMarks', { n: tot.absent })} />
        <StatTile icon={<ScheduleOutlined />} label={t('att.lateMarks')} value={tot.late} caption={t('att.lateCaption')} />
        <StatTile icon={<HowToRegOutlined />} label={t('att.classesMarked')} value={classesMarked} unit={t('att.ofN', { n: classesWithStudents })} caption={t('att.studentsMarked', { n: tot.marked, d: tot.students })} />
      </StatGrid>

      <SectionTitle>{t('att.byClass')}</SectionTitle>
      <ClassAttendanceTable rows={a.sections} />
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
        {t('att.note')}
      </Typography>

      <SectionTitle>{t('att.absentTitle', { n: absentees.length })}</SectionTitle>
      {absentees.length === 0 ? (
        <EmptyState dense icon={<HowToRegOutlined />} title={t('att.everyonePresent')} testId="no-absentees">
          {t('att.everyoneBody')}
        </EmptyState>
      ) : (
        <AbsenteesTable rows={absentees} />
      )}
    </>
  );
}
