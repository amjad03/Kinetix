import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import ClassOutlined from '@mui/icons-material/ClassOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import GradingOutlined from '@mui/icons-material/GradingOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import VideocamOutlined from '@mui/icons-material/VideocamOutlined';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { MiniBar } from '@/components/Bars';
import { ClassesTable, DeptAssessmentsTable, TeachersTable } from '@/components/department/DepartmentTables';
import { ClassEngagementTable } from '@/components/reports/ClassEngagementTable';
import { RangeControl } from '@/components/department/RangeControl';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { canSee } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { I18n } from '@/i18n/format';
import { deptQuery, formatPercent, RANGE_LABEL, rangeFrom, rangeText, syllabusTotal, TONE_COLOR, toneOf } from '@/lib/department';
import type { ClassEngagement, ClassroomAnalytics } from '@/lib/insights';
import { schoolToday } from '@/lib/school';
import type { DepartmentOverview, DepartmentRef } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.department') };
}


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
  // Classroom engagement of this department's classes (the institution-wide figures, narrowed to its sections).
  const classroom = ov.error === undefined ? await load(() => api<ClassroomAnalytics>(`/v1/analytics/classroom?from=${range.from}&to=${range.to}`)) : null;
  const sectionIds = new Set(ov.error === undefined ? ov.data.classes.map((c) => c.sectionId) : []);
  const engagement = classroom?.data ? classroom.data.bySection.filter((r) => sectionIds.has(r.id)) : null;

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
      {ov.error !== undefined ? <ErrorState message={ov.error} /> : <Overview o={ov.data} canManage={canManage} i18n={i18n} engagement={engagement} />}
    </>
  );
}

function Overview({ o, canManage, i18n, engagement }: { o: DepartmentOverview; canManage: boolean; i18n: I18n; engagement: ClassEngagement[] | null }) {
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
        <TeachersTable rows={o.teachers} />
      )}

      <SectionTitle>{t('dept.classes')}</SectionTitle>
      {o.classes.length === 0 ? (
        <EmptyState dense icon={<ClassOutlined />} title={t('dept.noClasses')} testId="no-dept-classes">
          {t('dept.noClassesBody')}
        </EmptyState>
      ) : (
        <ClassesTable rows={o.classes} />
      )}

      {engagement && (
        <>
          <SectionTitle>{t('dept.engagement')}</SectionTitle>
          <ClassEngagementTable rows={engagement} i18n={i18n} />
        </>
      )}

      <SectionTitle>{t('dept.assessments')}</SectionTitle>
      {o.assessments.length === 0 ? (
        <EmptyState dense icon={<GradingOutlined />} title={t('dept.noAssessments')} testId="no-dept-assessments">
          {t('dept.noAssessmentsBody')}
        </EmptyState>
      ) : (
        <DeptAssessmentsTable o={o} />
      )}
    </>
  );
}
