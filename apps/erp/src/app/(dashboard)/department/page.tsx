import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import ChevronRight from '@mui/icons-material/ChevronRight';
import ClassOutlined from '@mui/icons-material/ClassOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import GradingOutlined from '@mui/icons-material/GradingOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
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
import Link from 'next/link';
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
import { getI18n } from '@/i18n/server';
import type { I18n } from '@/i18n/format';
import { deptQuery, flagsFor, formatPercent, ofText, RANGE_LABEL, rangeFrom, rangeText, syllabusTotal, TONE_COLOR, toneOf } from '@/lib/department';
import { kindLabel } from '@/lib/results';
import { schoolToday } from '@/lib/school';
import type { DepartmentOverview, DepartmentRef, DeptClass, DeptTeacher } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.department') };
}

const num = { fontVariantNumeric: 'tabular-nums' } as const;

export default async function DepartmentPage({ searchParams }: { searchParams: Promise<{ dept?: string; range?: string; from?: string; to?: string }> }) {
  const me = await requireSection('department');
  const sp = await searchParams;
  const today = schoolToday();
  const range = rangeFrom(sp, today);
  const depts = await load(() => api<DepartmentRef[]>('/v1/departments'));
  const canManage = !!me && canSee(me.roles, 'departments');
  const i18n = await getI18n();
  const { t } = i18n;

  if (depts.error !== undefined)
    return (
      <>
        <PageHeader title={t('nav.department')} />
        <ErrorState message={depts.error} />
      </>
    );
  const list = depts.data;
  const dept = list.find((d) => d.id === sp.dept) ?? list.find((d) => d.head?.id === me?.id) ?? list[0];
  if (!dept)
    return (
      <>
        <PageHeader title={t('nav.department')} />
        <EmptyState
          icon={<GroupsOutlined />}
          title={canManage ? t('dept.noDepartments') : t('dept.notHead')}
          testId="no-departments"
          actions={
            canManage ? (
              <LinkButton href="/departments" variant="contained">
                {t('dept.setUp')}
              </LinkButton>
            ) : undefined
          }
        >
          {canManage ? t('dept.noDepartmentsBody') : t('dept.notHeadBody')}
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
            {dept.head ? t('dept.head', { name: dept.head.fullName }) : t('dept.noHead')} · {t(RANGE_LABEL[range.key])}, {rangeText(ov.error === undefined ? ov.data.range : range, i18n.locale)}
          </span>
        }
        actions={
          <>
            {many && (
              // Without `param`, each option's value is the whole query string, so the range is kept.
              <UrlSelect label={t('dept.picker')} value={deptQuery(dept.id, range)} minWidth={200} testId="dept-picker" options={list.map((d) => ({ value: deptQuery(d.id, range), label: d.name }))} />
            )}
            <RangeControl deptId={many ? dept.id : null} range={range} today={today} />
          </>
        }
      />
      {ov.error !== undefined ? <ErrorState message={ov.error} /> : <Overview o={ov.data} canManage={canManage} i18n={i18n} />}
    </>
  );
}

function Overview({ o, canManage, i18n }: { o: DepartmentOverview; canManage: boolean; i18n: I18n }) {
  const { t } = i18n;
  const tot = o.totals;
  if (!tot)
    return (
      <EmptyState
        icon={<MenuBookOutlined />}
        title={t('dept.noSubjects')}
        testId="no-subjects"
        actions={
          canManage ? (
            <LinkButton href="/departments" variant="contained">
              {t('dept.addSubjects')}
            </LinkButton>
          ) : undefined
        }
      >
        {canManage ? t('dept.noSubjectsManage') : t('dept.noSubjectsBody')}
      </EmptyState>
    );

  const syl = syllabusTotal(o.classes);
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }} data-testid="dept-subjects">
        {o.subjects.map((s) => s.name).join(' · ')}
      </Typography>
      <StatGrid min={140}>
        <StatTile
          testId="dept-stat-held"
          icon={<ClassOutlined />}
          label={t('dept.stat.held')}
          value={formatPercent(tot.taughtPercent)}
          unit={tot.scheduled ? t('dept.of', { n: tot.taught, d: tot.scheduled }) : undefined}
          tone={toneOf(tot.taughtPercent, 'held') === 'low' ? 'warning' : 'default'}
          bar={tot.taughtPercent === null ? undefined : <MiniBar value={tot.taughtPercent} color={TONE_COLOR[toneOf(tot.taughtPercent, 'held')]} />}
          caption={tot.scheduled ? t('dept.stat.heldCaption') : t('dept.stat.noPeriods')}
        />
        <StatTile
          testId="dept-stat-taken"
          icon={<FactCheckOutlined />}
          label={t('dept.stat.taken')}
          value={formatPercent(tot.attendanceTakenPercent)}
          unit={tot.scheduled ? t('dept.of', { n: tot.attendanceTaken, d: tot.scheduled }) : undefined}
          tone={toneOf(tot.attendanceTakenPercent, 'held') === 'low' ? 'warning' : 'default'}
          bar={tot.attendanceTakenPercent === null ? undefined : <MiniBar value={tot.attendanceTakenPercent} color={TONE_COLOR[toneOf(tot.attendanceTakenPercent, 'held')]} />}
          caption={t('dept.stat.takenCaption')}
        />
        <StatTile
          testId="dept-stat-attendance"
          icon={<HowToRegOutlined />}
          label={t('dept.stat.attendance')}
          value={formatPercent(tot.attendancePercent)}
          tone={toneOf(tot.attendancePercent, 'attendance') === 'low' ? 'warning' : 'default'}
          bar={tot.attendancePercent === null ? undefined : <MiniBar value={tot.attendancePercent} color={TONE_COLOR[toneOf(tot.attendancePercent, 'attendance')]} />}
          caption={tot.attendancePercent === null ? t('dept.stat.noAttendance') : t('dept.stat.attendanceCaption')}
        />
        <StatTile
          testId="dept-stat-syllabus"
          icon={<AutoStoriesOutlined />}
          label={t('dept.stat.syllabus')}
          value={formatPercent(syl.percent)}
          unit={syl.total ? t('dept.stat.syllabusUnit', { covered: syl.covered, total: syl.total }) : undefined}
          bar={syl.percent === null ? undefined : <MiniBar value={syl.percent} />}
          caption={syl.total ? t('dept.stat.syllabusCaption') : t('dept.stat.noSyllabus')}
        />
        <StatTile testId="dept-stat-homework" icon={<AssignmentOutlined />} label={t('dept.stat.homework')} value={tot.homework} unit={t('dept.stat.homeworkUnit')} caption={t('dept.stat.homeworkCaption')} />
        <StatTile testId="dept-stat-recordings" icon={<VideocamOutlined />} label={t('dept.stat.recordings')} value={tot.recordings} unit={t.plural('dept.stat.lesson', tot.recordings)} caption={t('dept.stat.recordingsCaption')} />
        <StatTile
          testId="dept-stat-assessments"
          icon={<GradingOutlined />}
          label={t('dept.stat.assessments')}
          value={tot.assessments}
          unit={tot.assessments ? t('dept.stat.published', { n: tot.published }) : undefined}
          caption={t('dept.stat.assessmentsCaption')}
        />
      </StatGrid>

      <SectionTitle>{t('dept.teachers')}</SectionTitle>
      {o.teachers.length === 0 ? (
        <EmptyState dense icon={<GroupsOutlined />} title={t('dept.noTeachers')} testId="no-teachers">
          {canManage ? t('dept.noTeachersBodyManage') : t('dept.noTeachersBody')}
        </EmptyState>
      ) : (
        <TeachersTable rows={o.teachers} i18n={i18n} />
      )}

      <SectionTitle>{t('dept.classes')}</SectionTitle>
      {o.classes.length === 0 ? (
        <EmptyState dense icon={<ClassOutlined />} title={t('dept.noClasses')} testId="no-dept-classes">
          {t('dept.noClassesBody')}
        </EmptyState>
      ) : (
        <ClassesTable rows={o.classes} i18n={i18n} />
      )}

      <SectionTitle>{t('dept.assessments')}</SectionTitle>
      {o.assessments.length === 0 ? (
        <EmptyState dense icon={<GradingOutlined />} title={t('dept.noAssessments')} testId="no-dept-assessments">
          {t('dept.noAssessmentsBody')}
        </EmptyState>
      ) : (
        <AssessmentsTable o={o} i18n={i18n} />
      )}
    </>
  );
}

function Flags({ r, t }: { r: DeptTeacher | DeptClass; t: I18n['t'] }) {
  const flags = flagsFor(r);
  if (flags.length === 0) return null;
  return (
    <Tooltip title={flags.map((k) => t(k)).join(' · ')}>
      <Chip size="small" label={t('dept.needsAttention')} data-testid="flag" sx={{ ml: 1, height: 22, bgcolor: 'm3.errorContainer', color: 'm3.onErrorContainer', fontWeight: 500 }} />
    </Tooltip>
  );
}

function TeachersTable({ rows, i18n: { t } }: { rows: DeptTeacher[]; i18n: I18n }) {
  return (
    <TableFrame testId="dept-teachers">
      <Table sx={{ minWidth: 820 }}>
        <TableHead>
          <TableRow>
            <TableCell>{t('dept.col.teacher')}</TableCell>
            <TableCell align="right">{t('dept.col.held')}</TableCell>
            <TableCell align="right">{t('dept.col.taken')}</TableCell>
            <TableCell align="right">{t('dept.col.attendance')}</TableCell>
            <TableCell align="right">{t('dept.col.homework')}</TableCell>
            <TableCell align="right">{t('dept.col.recordings')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} hover data-testid="dept-teacher-row">
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="subtitle2">{r.fullName}</Typography>
                  <Flags r={r} t={t} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {r.scheduled ? t.plural('dept.periodsDue', r.scheduled) : t('dept.noPeriodsDue')}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Rate value={r.taughtPercent} kind="held" detail={ofText(r.taught, r.scheduled, t)} testId="teacher-held" />
              </TableCell>
              <TableCell align="right">
                <Rate value={r.attendanceTakenPercent} kind="held" detail={ofText(r.attendanceTaken, r.scheduled, t)} testId="teacher-taken" />
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

function ClassesTable({ rows, i18n: { t, fmt } }: { rows: DeptClass[]; i18n: I18n }) {
  return (
    <TableFrame testId="dept-classes">
      <Table sx={{ minWidth: 1040 }}>
        <TableHead>
          <TableRow>
            <TableCell>{t('dept.col.class')}</TableCell>
            <TableCell>{t('dept.col.teacher')}</TableCell>
            <TableCell align="right">{t('dept.col.heldShort')}</TableCell>
            <TableCell align="right">{t('dept.col.attendance')}</TableCell>
            <TableCell>{t('dept.col.syllabus')}</TableCell>
            <TableCell align="right">{t('dept.col.homework')}</TableCell>
            <TableCell align="right">{t('dept.col.latest')}</TableCell>
            <TableCell aria-label={t('dept.col.results')} />
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
                    <Flags r={c} t={t} />
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {c.subject}
                  </Typography>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{c.teacher}</TableCell>
                <TableCell align="right">
                  <Rate value={c.taughtPercent} kind="held" detail={ofText(c.taught, c.scheduled, t)} />
                </TableCell>
                <TableCell align="right">
                  <Rate value={c.attendancePercent} kind="attendance" detail={c.scheduled ? t('dept.takenOf', { n: c.attendanceTaken, d: c.scheduled }) : undefined} />
                </TableCell>
                <TableCell data-testid="class-syllabus">
                  <SyllabusCell c={c} t={t} />
                </TableCell>
                <TableCell align="right" sx={num}>
                  {c.homework}
                </TableCell>
                <TableCell align="right" data-testid="class-latest">
                  {latest ? (
                    <Tooltip title={`${latest.title} · ${fmt.date(latest.heldOn, 'short')}`}>
                      <Box>
                        <Rate value={latest.averagePercent} kind="marks" detail={t('dept.classAverage')} />
                      </Box>
                    </Tooltip>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right" padding="checkbox" sx={{ pr: 1 }}>
                  <LinkButton href={`/results?class=${c.sectionId}`} size="small" endIcon={<ChevronRight />} aria-label={t('dept.resultsFor', { section: c.section })}>
                    {t('dept.col.results')}
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

function AssessmentsTable({ o, i18n: { t, fmt } }: { o: DepartmentOverview; i18n: I18n }) {
  return (
    <TableFrame testId="dept-assessments">
      <Table sx={{ minWidth: 820 }}>
        <TableHead>
          <TableRow>
            <TableCell>{t('dept.col.assessment')}</TableCell>
            <TableCell>{t('dept.col.heldOn')}</TableCell>
            <TableCell align="right">{t('dept.col.entered')}</TableCell>
            <TableCell align="right">{t('dept.col.average')}</TableCell>
            <TableCell>{t('dept.col.status')}</TableCell>
            <TableCell aria-label={t('dept.col.open')} />
          </TableRow>
        </TableHead>
        <TableBody>
          {o.assessments.map((a) => (
            <TableRow key={a.id} hover data-testid="dept-assessment-row">
              <TableCell>
                <Typography variant="subtitle2">{a.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {a.section} · {a.subject} · {kindLabel(a.kind, t)} · {a.createdBy}
                </Typography>
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmt.date(a.heldOn, 'short')}</TableCell>
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
                <LinkButton href={`/results/${a.id}`} size="small" endIcon={<ChevronRight />} aria-label={t('dept.marksFor', { title: a.title })}>
                  {t('dept.marks')}
                </LinkButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}

/** Topics of the class's syllabus taught so far, with a link to the topic list. */
function SyllabusCell({ c, t }: { c: DeptClass; t: I18n['t'] }) {
  const sy = c.syllabus;
  if (!sy || sy.total === 0)
    return (
      <Tooltip title={t('dept.syllabus.noneHelp')}>
        <Typography variant="body2" color="text.secondary" data-percent="none">
          {t('dept.syllabus.none')}
        </Typography>
      </Tooltip>
    );
  const p = sy.percent ?? 0;
  return (
    <Link
      href={`/department/syllabus?section=${c.sectionId}&subject=${c.subjectId}`}
      aria-label={t('dept.syllabus.open', { section: c.section, subject: c.subject })}
      data-percent={p}
      style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', minWidth: 150 }}
    >
      <Box sx={{ width: 64 }}>
        <MiniBar value={p} color={p >= 100 ? 'kx.success' : 'primary.main'} />
      </Box>
      <Box>
        <Typography variant="body2" sx={{ ...num, color: 'primary.main', fontWeight: 500 }}>
          {formatPercent(p)}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ ...num, lineHeight: '16px', whiteSpace: 'nowrap' }}>
          {t('dept.syllabus.topics', { covered: sy.covered, total: sy.total })}
        </Typography>
      </Box>
    </Link>
  );
}
