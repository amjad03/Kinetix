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
import { api, load } from '@/lib/api';
import { formatDate, hhmm, isoWeekday } from '@/lib/dates';
import { dateParam, relativeDay, schoolToday } from '@/lib/school';
import type { AttendanceDay } from '@/lib/types';

export const metadata: Metadata = { title: 'Attendance' };

/** Present + late over all marks. Marks are per period, so a student in three periods has three. */
function rateOf(present: number, absent: number, late: number): number | null {
  const marks = present + absent + late;
  return marks === 0 ? null : Math.round(((present + late) / marks) * 1000) / 10;
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const date = dateParam((await searchParams).date);
  const today = schoolToday();
  const res = await load(() => api<AttendanceDay>(`/v1/admin/attendance?date=${date}`));

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle={`${formatDate(date, 'long')}${date === today ? '' : ` · ${relativeDay(date, today)}`}`}
        actions={<DateNav date={date} today={today} />}
      />
      {res.error !== undefined ? <ErrorState message={res.error} /> : <AttendanceView a={res.data} date={date} today={today} />}
    </>
  );
}

function AttendanceView({ a, date, today }: { a: AttendanceDay; date: string; today: string }) {
  const t = a.sections.reduce(
    (s, r) => ({ present: s.present + r.present, absent: s.absent + r.absent, late: s.late + r.late, marked: s.marked + r.marked, students: s.students + r.students }),
    { present: 0, absent: 0, late: 0, marked: 0, students: 0 },
  );
  const marks = t.present + t.absent + t.late;
  if (marks === 0) {
    if (isoWeekday(date) === 7) return <NoClasses date={date} today={today} path="/attendance" />;
    return (
      <EmptyState icon={<FactCheckOutlined />} title={date > today ? 'Attendance is not due yet' : 'No attendance marked on this day'} testId="no-attendance">
        Teachers mark attendance on the board or in the Teacher App. It appears here as soon as it syncs.
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
  const rate = rateOf(t.present, t.absent, t.late);
  const classesMarked = a.sections.filter((s) => s.present + s.absent + s.late > 0).length;
  const classesWithStudents = a.sections.filter((s) => s.students > 0).length;

  return (
    <>
      <StatGrid min={200}>
        <StatTile
          testId="att-rate"
          icon={<FactCheckOutlined />}
          label="Attendance rate"
          value={rate === null ? '—' : `${rate}%`}
          bar={rate === null ? undefined : <MiniBar value={rate} color={rate >= 90 ? 'kx.success' : rate >= 75 ? 'primary.main' : 'error.main'} />}
          caption={`${marks} period marks`}
        />
        <StatTile testId="att-absent" icon={<PersonOffOutlined />} label="Absent students" value={absentees.length} caption={`${t.absent} absent marks`} />
        <StatTile icon={<ScheduleOutlined />} label="Late marks" value={t.late} caption="Counted as present in the rate" />
        <StatTile icon={<HowToRegOutlined />} label="Classes marked" value={classesMarked} unit={`of ${classesWithStudents}`} caption={`${t.marked} of ${t.students} students marked`} />
      </StatGrid>

      <SectionTitle>By class</SectionTitle>
      <TableFrame testId="attendance-table">
        <Table sx={{ minWidth: 720 }}>
          <TableHead>
            <TableRow>
              <TableCell>Class</TableCell>
              <TableCell align="right">Students</TableCell>
              <TableCell align="right">Marked</TableCell>
              <TableCell align="right">Present</TableCell>
              <TableCell align="right">Absent</TableCell>
              <TableCell align="right">Late</TableCell>
              <TableCell align="right" sx={{ width: 200 }}>
                Rate
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
                        No students enrolled
                      </Typography>
                    )}
                    {!none && s.marked === 0 && (
                      <Typography variant="caption" color="error.main">
                        Not marked
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
        Marked counts students. Present, absent and late count marks: one per student per period.
      </Typography>

      <SectionTitle>Absent students · {absentees.length}</SectionTitle>
      {absentees.length === 0 ? (
        <EmptyState dense icon={<HowToRegOutlined />} title="Everyone was present" testId="no-absentees">
          No student was marked absent on this day.
        </EmptyState>
      ) : (
        <TableFrame testId="absentees-table">
          <Table sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <TableCell>Student</TableCell>
                <TableCell>Class</TableCell>
                <TableCell>Absent for</TableCell>
                <TableCell>Marked by</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {absentees.map(([id, s]) => (
                <TableRow key={id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: 'm3.primaryContainer', color: 'm3.onPrimaryContainer' }}>{initials(s.student)}</Avatar>
                      <Box>
                        <Typography variant="subtitle2">{s.student}</Typography>
                        {s.rollNo && (
                          <Typography variant="caption" color="text.secondary">
                            {s.rollNo}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>{s.section}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                      {s.periods.map((p, i) => (
                        <Chip key={i} size="small" variant="outlined" label={`${hhmm(p.startsAt)} ${p.subject ?? 'Unscheduled'}`} />
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
