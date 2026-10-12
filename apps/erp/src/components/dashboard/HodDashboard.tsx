import { MiniBar } from '@/components/Bars';
import { ClassTimeline } from '@/components/ClassTimeline';
import { LinkButton } from '@/components/LinkButton';
import { EmptyState, ErrorState } from '@/components/States';
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
import { PendingTasks, QuickActions, Row } from './parts';

import { ArrowRight as ArrowForward, BookMarked as ClassOutlined, BookOpenText as MenuBookOutlined, CalendarX as EventBusyOutlined, ChartLine as InsightsOutlined, Clapperboard as VideoLibraryOutlined, ClipboardCheck as GradingOutlined, ClipboardList as AssignmentOutlined, FileQuestion as QuizOutlined, IdCard as BadgeOutlined, ListChecks as FactCheckOutlined, Target as TrackChangesOutlined, Users as PeopleAltOutlined } from 'lucide-react';
/** The head of department: how the department's classes, attendance and teachers are doing this week. */
export async function HodDashboard({ me, today }: { me: Me; today: string }) {
  const { t } = await getI18n();
  const range = rangeFrom({}, today);
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
  const subjectIds = new Set((o?.subjects ?? []).map((s) => s.id));
  const mine = (day.data?.classes ?? []).filter((c) => subjectIds.has(c.subject.id));
  const behind = [...(o?.teachers ?? [])].filter((x) => toneOf(x.taughtPercent, 'held') === 'low' || toneOf(x.attendanceTakenPercent, 'held') === 'low').slice(0, 5);
  const roles = me.roles;
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);
  const color = (v: number | null | undefined, kind: 'held' | 'attendance') => {
    const tone = toneOf(v, kind);
    return tone === 'low' ? 'var(--kx-danger)' : tone === 'good' ? 'var(--kx-success)' : 'var(--kx-accent)';
  };

  return (
    <>
      {ov.error !== undefined ? (
        <ErrorState message={ov.error} />
      ) : (
        <StatGrid min={200}>
          <StatTile testId="stat-held" icon={<ClassOutlined />} label={t('dash.hod.held')} value={pct(totals?.taughtPercent)} bar={totals?.taughtPercent != null ? <MiniBar value={totals.taughtPercent} color={color(totals.taughtPercent, 'held')} /> : undefined} caption={t('dash.hod.heldCaption', { taught: totals?.taught ?? 0, n: totals?.scheduled ?? 0 })} href="/department" />
          <StatTile testId="stat-dept-attendance" icon={<FactCheckOutlined />} label={t('dash.hod.attendance')} value={pct(totals?.attendancePercent)} bar={totals?.attendancePercent != null ? <MiniBar value={totals.attendancePercent} color={color(totals.attendancePercent, 'attendance')} /> : undefined} caption={t('dash.hod.attendanceCaption', { pct: pct(totals?.attendanceTakenPercent) })} href="/department" />
          <StatTile testId="stat-dept-homework" icon={<AssignmentOutlined />} label={t('today.stat.homework')} value={totals?.homework ?? 0} unit={t('today.stat.homeworkUnit')} caption={t('dash.hod.week')} />
          <StatTile testId="stat-dept-teachers" icon={<PeopleAltOutlined />} label={t('dash.hod.teachers')} value={o?.teachers.length ?? 0} caption={dept.name} href="/department" />
        </StatGrid>
      )}

      <Row cols={3}>
        <Card title={t('dash.hod.today')} subtitle={dept.name} padded={false} testId="schedule-card" action={<LinkButton href="/classes" size="small" endIcon={<ArrowForward />}>{t('today.allClasses')}</LinkButton>}>
          <div style={{ padding: '4px 20px 20px', maxHeight: 520, overflowY: 'auto' }}>
            {day.error !== undefined ? <ErrorState message={day.error} /> : mine.length === 0 ? <EmptyState dense icon={<ClassOutlined />} title={t('dash.hod.noClasses')} /> : <ClassTimeline classes={mine} nowTime={schoolNowTime()} />}
          </div>
        </Card>
        <Card title={t('dash.hod.attention')} subtitle={t('dash.hod.attentionSub')} padded={false} testId="teachers-attention">
          {behind.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState dense icon={<BadgeOutlined />} title={t('dash.hod.allGood')} />
            </div>
          ) : (
            <ul className="list-none m-0 p-0">
              {behind.map((x) => (
                <li className="px-5 py-2.5 border-t border-border flex items-center gap-3" key={x.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.875rem] font-semibold">
                      {x.fullName}
                    </p>
                    <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                      {t('dash.hod.teacherLine', { held: pct(x.taughtPercent), taken: pct(x.attendanceTakenPercent) })}
                    </span>
                  </div>
                  <StatusPill tone="warning">{t('dash.hod.low')}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <PendingTasks
          t={t}
          tasks={[
            { key: 'leave', label: t('dash.task.leave'), count: roll.data?.pending.leave ?? null, href: '/hr/leave', icon: <EventBusyOutlined /> },
            { key: 'obe', label: t('dash.task.obe'), count: roll.data?.pending.marksToVerify ?? null, href: '/results', icon: <TrackChangesOutlined /> },
            { key: 'papers', label: t('dash.task.papers'), count: roll.data?.pending.examPapers ?? null, href: '/exams', icon: <QuizOutlined /> },
          ].filter((x) => (x.key === 'leave' ? canSee(roles, 'hr') : true))}
        />
      </Row>
      <Row cols={3}>
        <QuickActions
          t={t}
          actions={[
            { href: '/department', label: t('dash.qa.department'), icon: <InsightsOutlined /> },
            { href: '/results', label: t('dash.qa.results'), icon: <GradingOutlined /> },
            { href: '/syllabus', label: t('dash.qa.syllabus'), icon: <MenuBookOutlined /> },
            { href: '/topic-videos', label: t('dash.qa.videos'), icon: <VideoLibraryOutlined /> },
            { href: '/exams', label: t('dash.qa.exams'), icon: <QuizOutlined /> },
            { href: '/obe', label: t('dash.qa.report'), icon: <TrackChangesOutlined /> },
          ]}
        />
      </Row>
    </>
  );
}
