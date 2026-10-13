import { MiniBar } from '@/components/Bars';
import { ClassTimeline } from '@/components/ClassTimeline';
import { LinkButton } from '@/components/LinkButton';
import { EmptyState, ErrorState } from '@/components/States';
import { Sparkline } from '@/components/ui/Charts';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/Badge';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { api, load } from '@/lib/api';
import { canSee } from '@/lib/access';
import type { DashboardRollup } from '@/lib/dashboard';
import { rangeFrom, toneOf } from '@/lib/department';
import { schoolNowTime } from '@/lib/school';
import type { ClassesDay, DepartmentOverview, DepartmentRef, Me } from '@/lib/types';
import { getI18n } from '@/i18n/server';
import { AttentionInbox, ChartCard, DrillBars, MiniMeter, type InboxItem } from './home';
import { QuickActions, Row } from './parts';

import { ArrowRight as ArrowForward, BookMarked as ClassOutlined, BookOpenText as MenuBookOutlined, CalendarX as EventBusyOutlined, ChartLine as InsightsOutlined, Clapperboard as VideoLibraryOutlined, ClipboardCheck as GradingOutlined, FileQuestion as QuizOutlined, IdCard as BadgeOutlined, ListChecks as FactCheckOutlined, Target as TrackChangesOutlined, TriangleAlert, Users as PeopleAltOutlined } from 'lucide-react';
import { naturalCompare } from '@/lib/natural';

/** Weighted mean of a percentage over rows, weighted by `w` (rows with no value or weight are skipped). */
function mean<T>(rows: T[], v: (r: T) => number | null | undefined, w: (r: T) => number) {
  let num = 0,
    den = 0;
  for (const r of rows) {
    const x = v(r);
    const k = w(r);
    if (x === null || x === undefined || k <= 0) continue;
    num += x * k;
    den += k;
  }
  return den > 0 ? Math.round((num / den) * 10) / 10 : null;
}

/** The head of department's home: the department's classes, attendance by section, syllabus coverage, teachers falling behind and what waits on them. */
export async function HodDashboard({ me, today }: { me: Me; today: string }) {
  const { t, fmt } = await getI18n();
  const range = rangeFrom({ range: 'month' }, today);
  const depts = await load(() => api<DepartmentRef[]>('/v1/departments'));
  if (depts.error !== undefined) return <ErrorState message={depts.error} />;
  const dept = depts.data.find((d) => d.head?.id === me.id) ?? depts.data[0];
  if (!dept) return <EmptyState icon={<InsightsOutlined />} title={t('dash.hod.none')}>{t('dash.hod.noneHelp')}</EmptyState>;
  const [ov, day, roll] = await Promise.all([
    load(() => api<DepartmentOverview>(`/v1/departments/${dept.id}/overview?from=${range.from}&to=${range.to}`)),
    load(() => api<ClassesDay>(`/v1/admin/classes?date=${today}`)),
    load(() => api<DashboardRollup>('/v1/admin/dashboard')),
  ]);
  const o = ov.data;
  const totals = o?.totals;
  const classes = o?.classes ?? [];
  const subjectIds = new Set((o?.subjects ?? []).map((s) => s.id));
  const mine = (day.data?.classes ?? []).filter((c) => subjectIds.has(c.subject.id));
  const behind = [...(o?.teachers ?? [])].filter((x) => toneOf(x.taughtPercent, 'held') === 'low' || toneOf(x.attendanceTakenPercent, 'held') === 'low');
  const roles = me.roles;
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);
  const color = (v: number | null | undefined, kind: 'held' | 'attendance') => {
    const tone = toneOf(v, kind);
    return tone === 'low' ? 'var(--kx-danger)' : tone === 'good' ? 'var(--kx-success)' : 'var(--kx-accent)';
  };

  // Attendance by section and syllabus coverage by subject, from the department's classes this week.
  const sections = [...new Map(classes.map((c) => [c.sectionId, c.section])).entries()]
    .map(([id, label]) => ({ id, label, value: mean(classes.filter((c) => c.sectionId === id), (c) => c.attendancePercent, (c) => c.attendanceTaken) }))
    .filter((r): r is { id: string; label: string; value: number } => r.value !== null)
    .sort((a, b) => naturalCompare(a.label, b.label))
    .map((r) => ({ ...r, href: '/attendance' }));
  const low = sections.filter((s) => s.value < 75);
  const subjects = [...new Map(classes.map((c) => [c.subjectId, c.subject])).entries()]
    .map(([id, label]) => ({ id, label, value: mean(classes.filter((c) => c.subjectId === id), (c) => c.syllabus?.percent, (c) => c.syllabus?.total ?? 0) }))
    .filter((r): r is { id: string; label: string; value: number } => r.value !== null)
    .slice(0, 10)
    .map((r) => ({ ...r, href: '/syllabus' }));
  const syllabus = mean(classes, (c) => c.syllabus?.percent, (c) => c.syllabus?.total ?? 0);
  const perf = roll.data?.performance;
  const p = roll.data?.pending;

  const inbox = (
    [
      low.length > 0 && { key: 'lowatt', kind: 'alert', tone: 'red', icon: <TriangleAlert />, title: t('dash.hod.inbox.lowAtt', { n: low.length }), detail: low.map((s) => `${s.label} ${Math.round(s.value)}%`).join(' · '), action: t('home.open'), href: '/attendance' },
      behind.length > 0 && { key: 'behind', kind: 'alert', tone: 'amber', icon: <BadgeOutlined />, title: t('dash.hod.inbox.behind', { n: behind.length }), detail: behind.slice(0, 3).map((x) => x.fullName).join(', '), action: t('home.open'), href: '/department' },
      canSee(roles, 'hr') && (p?.leave ?? 0) > 0 && { key: 'leave', kind: 'approval', tone: 'amber', icon: <EventBusyOutlined />, title: `${fmt.number(p?.leave ?? 0)} · ${t('dash.task.leave')}`, action: t('home.review'), href: '/hr/leave' },
      (p?.marksToVerify ?? 0) > 0 && { key: 'obe', kind: 'task', tone: 'amber', icon: <TrackChangesOutlined />, title: `${fmt.number(p?.marksToVerify ?? 0)} · ${t('dash.task.obe')}`, action: t('home.open'), href: '/results' },
      (p?.examPapers ?? 0) > 0 && { key: 'papers', kind: 'approval', tone: 'blue', icon: <QuizOutlined />, title: `${fmt.number(p?.examPapers ?? 0)} · ${t('dash.task.papers')}`, action: t('home.review'), href: '/exams' },
    ] as (InboxItem | false)[]
  ).filter((x): x is InboxItem => !!x);

  return (
    <>
      {ov.error !== undefined ? (
        <ErrorState message={ov.error} />
      ) : (
        <StatGrid min={200}>
          <StatTile testId="stat-held" icon={<ClassOutlined />} label={t('dash.hod.held')} value={pct(totals?.taughtPercent)} bar={totals?.taughtPercent != null ? <MiniBar value={totals.taughtPercent} color={color(totals.taughtPercent, 'held')} /> : undefined} caption={t('dash.hod.held30', { taught: totals?.taught ?? 0, n: totals?.scheduled ?? 0 })} href="/department?range=month" />
          <StatTile testId="stat-dept-attendance" icon={<FactCheckOutlined />} label={t('dash.hod.attendance')} value={pct(totals?.attendancePercent)} spark={perf && perf.some((x) => x.attendance !== null) ? <Sparkline values={perf.map((x) => x.attendance)} width={88} height={30} label={t('home.attTrend')} /> : undefined} caption={t('dash.hod.attendanceCaption', { pct: pct(totals?.attendanceTakenPercent) })} href="/attendance" />
          <StatTile testId="stat-syllabus" icon={<MenuBookOutlined />} label={t('dash.hod.syllabus')} value={pct(syllabus)} spark={syllabus !== null ? <MiniMeter value={syllabus} tone={syllabus < 50 ? 'amber' : 'teal'} /> : undefined} caption={t('dash.hod.syllabusCaption', { n: subjects.length })} href="/syllabus" />
          <StatTile testId="stat-dept-marks" icon={<GradingOutlined />} label={t('dash.hod.marks')} value={`${totals?.published ?? 0} / ${totals?.assessments ?? 0}`} spark={totals && totals.assessments > 0 ? <MiniMeter value={(totals.published / totals.assessments) * 100} /> : undefined} caption={t('dash.hod.marksCaption', { n: (totals?.assessments ?? 0) - (totals?.published ?? 0) })} href="/results" />
        </StatGrid>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title={t('dash.hod.bySection')} subtitle={t('dash.hod.bySectionSub')} className="xl:col-span-2" testId="section-attendance">
          {sections.length ? <DrillBars rows={sections} ariaLabel={t('dash.hod.bySection')} unit="%" max={100} refValue={75} refLabel={t('home.min75')} /> : <EmptyState dense icon={<FactCheckOutlined />} title={t('dash.hod.noAttendance')} />}
        </ChartCard>
        <AttentionInbox items={inbox} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title={t('dash.hod.coverage')} subtitle={t('dash.hod.coverageSub')} testId="syllabus-chart">
          {subjects.length ? <DrillBars rows={subjects} ariaLabel={t('dash.hod.coverage')} unit="%" max={100} /> : <EmptyState dense icon={<MenuBookOutlined />} title={t('dash.hod.noCoverage')} />}
        </ChartCard>
        <Card className="xl:col-span-2" title={t('dash.hod.today')} subtitle={dept.name} padded={false} testId="schedule-card" action={<LinkButton href="/classes" size="small" endIcon={<ArrowForward />}>{t('today.allClasses')}</LinkButton>}>
          <div className="max-h-[420px] overflow-y-auto px-5 pt-1 pb-5">{day.error !== undefined ? <ErrorState message={day.error} /> : mine.length === 0 ? <EmptyState dense icon={<ClassOutlined />} title={t('dash.hod.noClasses')} /> : <ClassTimeline classes={mine} nowTime={schoolNowTime()} />}</div>
        </Card>
      </div>

      <Row cols={2}>
        <Card title={t('dash.hod.attention')} subtitle={t('dash.hod.attentionSub')} padded={false} testId="teachers-attention">
          {behind.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState dense icon={<BadgeOutlined />} title={t('dash.hod.allGood')} />
            </div>
          ) : (
            <ul className="m-0 list-none p-0">
              {behind.slice(0, 5).map((x) => (
                <li className="flex items-center gap-3 border-t px-5 py-2.5" key={x.id}>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-sm font-semibold">{x.fullName}</p>
                    <span className="text-xs text-muted-foreground">{t('dash.hod.teacherLine', { held: pct(x.taughtPercent), taken: pct(x.attendanceTakenPercent) })}</span>
                  </div>
                  <StatusPill tone="warning">{t('dash.hod.low')}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <QuickActions
          t={t}
          wide={false}
          actions={[
            { href: '/department', label: t('dash.qa.department'), icon: <InsightsOutlined /> },
            { href: '/results', label: t('dash.qa.results'), icon: <GradingOutlined /> },
            { href: '/syllabus', label: t('dash.qa.syllabus'), icon: <MenuBookOutlined /> },
            { href: '/topic-videos', label: t('dash.qa.videos'), icon: <VideoLibraryOutlined /> },
            { href: '/exams', label: t('dash.qa.exams'), icon: <QuizOutlined /> },
            { href: '/obe', label: t('dash.qa.report'), icon: <PeopleAltOutlined /> },
          ]}
        />
      </Row>
    </>
  );
}
