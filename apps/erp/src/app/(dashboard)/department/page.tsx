import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import ChevronRight from '@mui/icons-material/ChevronRight';
import ClassOutlined from '@mui/icons-material/ClassOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import GradingOutlined from '@mui/icons-material/GradingOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import VideocamOutlined from '@mui/icons-material/VideocamOutlined';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { MiniBar } from '@/components/Bars';
import { TableFrame } from '@/components/DataTable';
import { RangeControl } from '@/components/department/RangeControl';
import { Rate } from '@/components/department/Rate';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { PublishedChip } from '@/components/results/PublishedChip';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { canSee } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { deptQuery, flagsFor, formatPercent, ofText, RANGE_LABEL, rangeFrom, rangeText, TONE_COLOR, toneOf } from '@/lib/department';
import { KIND_LABEL } from '@/lib/results';
import { schoolToday } from '@/lib/school';
import type { DepartmentOverview, DepartmentRef, DeptClass, DeptTeacher } from '@/lib/types';

export const metadata: Metadata = { title: 'Department' };

const num = { fontVariantNumeric: 'tabular-nums' } as const;

export default async function DepartmentPage({ searchParams }: { searchParams: Promise<{ dept?: string; range?: string; from?: string; to?: string }> }) {
  const me = await requireSection('department');
  const sp = await searchParams;
  const today = schoolToday();
  const range = rangeFrom(sp, today);
  const depts = await load(() => api<DepartmentRef[]>('/v1/departments'));
  const canManage = !!me && canSee(me.roles, 'departments');

  if (depts.error !== undefined)
    return (
      <>
        <PageHeader title="Department" />
        <ErrorState message={depts.error} />
      </>
    );
  const list = depts.data;
  const dept = list.find((d) => d.id === sp.dept) ?? list.find((d) => d.head?.id === me?.id) ?? list[0];
  if (!dept)
    return (
      <>
        <PageHeader title="Department" />
        <EmptyState
          icon={<GroupsOutlined />}
          title={canManage ? 'No departments yet' : 'You are not head of a department yet'}
          testId="no-departments"
          actions={
            canManage ? (
              <LinkButton href="/departments" variant="contained">
                Set up departments
              </LinkButton>
            ) : undefined
          }
        >
          {canManage
            ? 'Group subjects and staff into departments and choose a head for each, who then sees how their classes are going here.'
            : 'You are not head of a department yet. Ask the principal to set one up.'}
        </EmptyState>
      </>
    );

  const ov = await load(() => api<DepartmentOverview>(`/v1/departments/${dept.id}/overview?from=${range.from}&to=${range.to}`));
  const many = list.length > 1;

  return (
    <>
      <PageHeader
        title={dept.name}
        subtitle={
          <span data-testid="dept-subtitle">
            {dept.head ? `Head: ${dept.head.fullName}` : 'No head of department'} · {RANGE_LABEL[range.key]}, {rangeText(ov.error === undefined ? ov.data.range : range)}
          </span>
        }
        actions={
          <>
            {many && (
              // Without `param`, each option's value is the whole query string, so the range is kept.
              <UrlSelect label="Department" value={deptQuery(dept.id, range)} minWidth={200} testId="dept-picker" options={list.map((d) => ({ value: deptQuery(d.id, range), label: d.name }))} />
            )}
            <RangeControl deptId={many ? dept.id : null} range={range} today={today} />
          </>
        }
      />
      {ov.error !== undefined ? <ErrorState message={ov.error} /> : <Overview o={ov.data} canManage={canManage} />}
    </>
  );
}

function Overview({ o, canManage }: { o: DepartmentOverview; canManage: boolean }) {
  const t = o.totals;
  if (!t)
    return (
      <EmptyState
        icon={<MenuBookOutlined />}
        title="No subjects in this department yet"
        testId="no-subjects"
        actions={
          canManage ? (
            <LinkButton href="/departments" variant="contained">
              Add subjects
            </LinkButton>
          ) : undefined
        }
      >
        {canManage
          ? 'Add the subjects this department teaches, and its classes, teachers and marks appear here.'
          : 'When the principal adds the subjects this department teaches, its classes, teachers and marks appear here.'}
      </EmptyState>
    );

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }} data-testid="dept-subjects">
        {o.subjects.map((s) => s.name).join(' · ')}
      </Typography>
      <StatGrid>
        <StatTile
          testId="dept-stat-held"
          icon={<ClassOutlined />}
          label="Classes held"
          value={formatPercent(t.taughtPercent)}
          unit={t.scheduled ? `${t.taught} of ${t.scheduled}` : undefined}
          tone={toneOf(t.taughtPercent, 'held') === 'low' ? 'warning' : 'default'}
          bar={t.taughtPercent === null ? undefined : <MiniBar value={t.taughtPercent} color={TONE_COLOR[toneOf(t.taughtPercent, 'held')]} />}
          caption={t.scheduled ? 'Periods taught on a KINETIX board' : 'No periods were due'}
        />
        <StatTile
          testId="dept-stat-taken"
          icon={<FactCheckOutlined />}
          label="Attendance taken"
          value={formatPercent(t.attendanceTakenPercent)}
          unit={t.scheduled ? `${t.attendanceTaken} of ${t.scheduled}` : undefined}
          tone={toneOf(t.attendanceTakenPercent, 'held') === 'low' ? 'warning' : 'default'}
          bar={t.attendanceTakenPercent === null ? undefined : <MiniBar value={t.attendanceTakenPercent} color={TONE_COLOR[toneOf(t.attendanceTakenPercent, 'held')]} />}
          caption="Periods with attendance marked"
        />
        <StatTile
          testId="dept-stat-attendance"
          icon={<HowToRegOutlined />}
          label="Attendance"
          value={formatPercent(t.attendancePercent)}
          tone={toneOf(t.attendancePercent, 'attendance') === 'low' ? 'warning' : 'default'}
          bar={t.attendancePercent === null ? undefined : <MiniBar value={t.attendancePercent} color={TONE_COLOR[toneOf(t.attendancePercent, 'attendance')]} />}
          caption={t.attendancePercent === null ? 'No attendance marked' : 'Students present or late'}
        />
        <StatTile testId="dept-stat-homework" icon={<AssignmentOutlined />} label="Homework" value={t.homework} unit="set" caption="Assignments for students" />
        <StatTile testId="dept-stat-recordings" icon={<VideocamOutlined />} label="Recordings" value={t.recordings} unit={t.recordings === 1 ? 'lesson' : 'lessons'} caption="Recorded on the boards" />
        <StatTile
          testId="dept-stat-assessments"
          icon={<GradingOutlined />}
          label="Assessments"
          value={t.assessments}
          unit={t.assessments ? `${t.published} published` : undefined}
          caption="Tests, assignments and exams held"
        />
      </StatGrid>

      <SectionTitle>Teachers</SectionTitle>
      {o.teachers.length === 0 ? (
        <EmptyState dense icon={<GroupsOutlined />} title="No teachers yet" testId="no-teachers">
          Nobody teaches this department&apos;s subjects on the timetable{canManage ? ', and no staff are in the department' : ''}.
        </EmptyState>
      ) : (
        <TeachersTable rows={o.teachers} />
      )}

      <SectionTitle>Classes</SectionTitle>
      {o.classes.length === 0 ? (
        <EmptyState dense icon={<ClassOutlined />} title="No classes on the timetable" testId="no-dept-classes">
          The department&apos;s subjects are not on the current timetable yet.
        </EmptyState>
      ) : (
        <ClassesTable rows={o.classes} />
      )}

      <SectionTitle>Recent assessments</SectionTitle>
      {o.assessments.length === 0 ? (
        <EmptyState dense icon={<GradingOutlined />} title="No assessments in this range" testId="no-dept-assessments">
          Tests and assignments set in the Teacher App for the department&apos;s subjects appear here.
        </EmptyState>
      ) : (
        <AssessmentsTable o={o} />
      )}
    </>
  );
}

function Flags({ r }: { r: DeptTeacher | DeptClass }) {
  const flags = flagsFor(r);
  if (flags.length === 0) return null;
  return (
    <Tooltip title={flags.join(' · ')}>
      <Chip size="small" label="Needs attention" data-testid="flag" sx={{ ml: 1, height: 22, bgcolor: 'm3.errorContainer', color: 'm3.onErrorContainer', fontWeight: 500 }} />
    </Tooltip>
  );
}

function TeachersTable({ rows }: { rows: DeptTeacher[] }) {
  return (
    <TableFrame testId="dept-teachers">
      <Table sx={{ minWidth: 820 }}>
        <TableHead>
          <TableRow>
            <TableCell>Teacher</TableCell>
            <TableCell align="right">Classes held</TableCell>
            <TableCell align="right">Attendance taken</TableCell>
            <TableCell align="right">Attendance</TableCell>
            <TableCell align="right">Homework</TableCell>
            <TableCell align="right">Recordings</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} hover data-testid="dept-teacher-row">
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="subtitle2">{r.fullName}</Typography>
                  <Flags r={r} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {r.scheduled ? `${r.scheduled} period${r.scheduled === 1 ? '' : 's'} due` : 'No periods due in this range'}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Rate value={r.taughtPercent} kind="held" detail={ofText(r.taught, r.scheduled)} testId="teacher-held" />
              </TableCell>
              <TableCell align="right">
                <Rate value={r.attendanceTakenPercent} kind="held" detail={ofText(r.attendanceTaken, r.scheduled)} testId="teacher-taken" />
              </TableCell>
              <TableCell align="right">
                <Rate value={r.attendancePercent} kind="attendance" testId="teacher-attendance" />
              </TableCell>
              <TableCell align="right" sx={num}>
                {r.homework}
              </TableCell>
              <TableCell align="right" sx={num}>
                {r.recordings}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}

function ClassesTable({ rows }: { rows: DeptClass[] }) {
  return (
    <TableFrame testId="dept-classes">
      <Table sx={{ minWidth: 920 }}>
        <TableHead>
          <TableRow>
            <TableCell>Class</TableCell>
            <TableCell>Teacher</TableCell>
            <TableCell align="right">Held</TableCell>
            <TableCell align="right">Attendance</TableCell>
            <TableCell align="right">Homework</TableCell>
            <TableCell align="right">Latest test</TableCell>
            <TableCell aria-label="Results" />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((c) => {
            const latest = c.latestAssessment;
            return (
              <TableRow key={`${c.sectionId}|${c.subjectId}|${c.teacherId}`} hover data-testid="dept-class-row">
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography variant="subtitle2">{c.section}</Typography>
                    <Flags r={c} />
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {c.subject}
                  </Typography>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{c.teacher}</TableCell>
                <TableCell align="right">
                  <Rate value={c.taughtPercent} kind="held" detail={ofText(c.taught, c.scheduled)} />
                </TableCell>
                <TableCell align="right">
                  <Rate value={c.attendancePercent} kind="attendance" detail={c.scheduled ? `taken ${ofText(c.attendanceTaken, c.scheduled)}` : undefined} />
                </TableCell>
                <TableCell align="right" sx={num}>
                  {c.homework}
                </TableCell>
                <TableCell align="right" data-testid="class-latest">
                  {latest ? (
                    <Tooltip title={`${latest.title} · ${formatDate(latest.heldOn, 'short')}`}>
                      <Box>
                        <Rate value={latest.averagePercent} kind="marks" detail="class average" />
                      </Box>
                    </Tooltip>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right" padding="checkbox" sx={{ pr: 1 }}>
                  <LinkButton href={`/results?class=${c.sectionId}`} size="small" endIcon={<ChevronRight />} aria-label={`Results for ${c.section}`}>
                    Results
                  </LinkButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableFrame>
  );
}

function AssessmentsTable({ o }: { o: DepartmentOverview }) {
  return (
    <TableFrame testId="dept-assessments">
      <Table sx={{ minWidth: 820 }}>
        <TableHead>
          <TableRow>
            <TableCell>Assessment</TableCell>
            <TableCell>Held on</TableCell>
            <TableCell align="right">Marks entered</TableCell>
            <TableCell align="right">Class average</TableCell>
            <TableCell>Status</TableCell>
            <TableCell aria-label="Open" />
          </TableRow>
        </TableHead>
        <TableBody>
          {o.assessments.map((a) => (
            <TableRow key={a.id} hover data-testid="dept-assessment-row">
              <TableCell>
                <Typography variant="subtitle2">{a.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {a.section} · {a.subject} · {KIND_LABEL[a.kind] ?? a.kind} · {a.createdBy}
                </Typography>
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(a.heldOn, 'short')}</TableCell>
              <TableCell align="right" sx={num}>
                {a.entered}
              </TableCell>
              <TableCell align="right">
                <Rate value={a.averagePercent} kind="marks" />
              </TableCell>
              <TableCell>
                <PublishedChip publishedAt={a.publishedAt} />
              </TableCell>
              <TableCell align="right" padding="checkbox" sx={{ pr: 1 }}>
                <LinkButton href={`/results/${a.id}`} size="small" endIcon={<ChevronRight />} aria-label={`Marks for ${a.title}`}>
                  Marks
                </LinkButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
