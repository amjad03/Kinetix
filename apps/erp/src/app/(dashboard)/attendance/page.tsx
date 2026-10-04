import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined';
import PersonOffOutlined from '@mui/icons-material/PersonOffOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { initials } from '@/components/initials';
import { MiniBar, RateCell } from '@/components/Bars';
import { TableFrame } from '@/components/DataTable';
import { DateNav } from '@/components/DateNav';
import { NoClasses } from '@/components/NoClasses';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { I18n } from '@/i18n/format';
import { hhmm, isoWeekday } from '@/lib/dates';
import { dateParam, schoolToday } from '@/lib/school';
import type { AttendanceDay } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.attendance') };
}

/** Present + late over all marks. Marks are per period, so a student in three periods has three. */
function rateOf(present: number, absent: number, late: number): number | null {
  const marks = present + absent + late;
  return marks === 0 ? null : Math.round(((present + late) / marks) * 1000) / 10;
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
  const byStudent = new Map<string, { student: string; rollNo: string | null; section: string; periods: { subject: string | null; startsAt: string | null; markedBy: string }[] }>();
  for (const r of a.absentees) {
    const e = byStudent.get(r.studentId) ?? { student: r.student, rollNo: r.rollNo, section: r.section, periods: [] };
    e.periods.push({ subject: r.subject, startsAt: r.startsAt, markedBy: r.markedBy });
    byStudent.set(r.studentId, e);
  }
  const absentees = [...byStudent.entries()];
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
      <TableFrame testId="attendance-table">
        <Table sx={{ minWidth: 600 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t('att.col.class')}</TableCell>
              <TableCell align="right">{t('att.col.students')}</TableCell>
              <TableCell align="right">{t('att.col.marked')}</TableCell>
              <TableCell align="right">{t('att.col.present')}</TableCell>
              <TableCell align="right">{t('att.col.absent')}</TableCell>
              <TableCell align="right">{t('att.col.late')}</TableCell>
              <TableCell align="right" sx={{ width: { xs: 140, md: 200 } }}>
                {t('att.col.rate')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {a.sections.map((s) => {
              const r = rateOf(s.present, s.absent, s.late);
              const none = s.students === 0;
              return (
                <TableRow key={s.sectionId} hover>
                  <TableCell>
                    <Typography variant="subtitle2">{s.section}</Typography>
                    {none && (
                      <Typography variant="caption" color="text.secondary">
                        {t('att.noStudents')}
                      </Typography>
                    )}
                    {!none && s.marked === 0 && (
                      <Typography variant="caption" color="error.main">
                        {t('att.notMarked')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {s.students}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {s.marked}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {s.present}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: s.absent ? 'error.main' : undefined, fontWeight: s.absent ? 500 : undefined }}>
                    {s.absent}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {s.late}
                  </TableCell>
                  <TableCell align="right">
                    <RateCell rate={r} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableFrame>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
        {t('att.note')}
      </Typography>

      <SectionTitle>{t('att.absentTitle', { n: absentees.length })}</SectionTitle>
      {absentees.length === 0 ? (
        <EmptyState dense icon={<HowToRegOutlined />} title={t('att.everyonePresent')} testId="no-absentees">
          {t('att.everyoneBody')}
        </EmptyState>
      ) : (
        <TableFrame testId="absentees-table">
          <Table sx={{ minWidth: 600 }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('att.col.student')}</TableCell>
                <TableCell>{t('att.col.class')}</TableCell>
                <TableCell>{t('att.col.absentFor')}</TableCell>
                <TableCell>{t('att.col.markedBy')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {absentees.map(([id, s]) => (
                <TableRow key={id} hover>
                  <TableCell>
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
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{s.section}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                      {s.periods.map((p, i) => (
                        <Chip key={i} size="small" variant="outlined" label={`${hhmm(p.startsAt)} ${p.subject ?? t('att.unscheduled')}`} />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>{[...new Set(s.periods.map((p) => p.markedBy))].join(', ')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </>
  );
}
