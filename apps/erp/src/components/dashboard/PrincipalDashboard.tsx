import { SegmentBar } from '@/components/Bars';
import { ClassTimeline } from '@/components/ClassTimeline';
import { HolidayBanner } from '@/components/HolidayBanner';
import { LinkButton } from '@/components/LinkButton';
import { hrefFor, NoClasses } from '@/components/NoClasses';
import { EmptyState, ErrorState } from '@/components/States';
import { Card } from '@/components/ui/Card';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { api, load } from '@/lib/api';
import { canSee } from '@/lib/access';
import type { CalendarList } from '@/lib/calendar';
import { addDays } from '@/lib/dates';
import { percentChange, pointsChange, type DashboardRollup } from '@/lib/dashboard';
import { schoolNowTime } from '@/lib/school';
import type { ClassesDay, Me, Overview, SentBroadcast } from '@/lib/types';
import { getI18n } from '@/i18n/server';
import { AttentionInbox, ChartCard, FeeBars, MiniBars, MiniMeter, TrendLine, type InboxItem } from './home';
import { Announcements, QuickActions, Row, UpcomingEvents, type QuickAction, type Task } from './parts';
import { Sparkline } from '@/components/ui/Charts';
import type { FeeSummary } from '@/lib/types';

import { ArrowRight as ArrowForward, Banknote as PaymentsOutlined, BookMarked as ClassOutlined, CalendarDays as CalendarMonthOutlined, ClipboardCheck as GradingOutlined, ClipboardList as AssignmentOutlined, FileQuestion as QuizOutlined, IdCard as BadgeOutlined, ListChecks as FactCheckOutlined, Megaphone as CampaignOutlined, Presentation as CastForEducationOutlined, Sparkles as AutoAwesomeOutlined, Target as TrackChangesOutlined, Umbrella as BeachAccessOutlined, UserX as PersonOffOutlined, UsersRound as GroupsOutlined } from 'lucide-react';
/** The principal's and administrator's overview: KPIs with trend, the day's classes, performance, what needs a decision. */
export async function PrincipalDashboard({ me, date, today }: { me: Me; date: string; today: string }) {
  const i18n = await getI18n();
  const { t, fmt, locale } = i18n;
  const [ov, day, roll, bc, cal, feeSum] = await Promise.all([
    load(() => api<Overview>(`/v1/admin/overview?date=${date}`)),
    load(() => api<ClassesDay>(`/v1/admin/classes?date=${date}`)),
    load(() => api<DashboardRollup>('/v1/admin/dashboard')),
    load(() => api<SentBroadcast[]>('/v1/broadcasts')),
    load(() => api<CalendarList>(`/v1/calendar?from=${today}&to=${addDays(today, 60)}`)),
    canSee(me.roles, 'fees') ? load(() => api<FeeSummary>('/v1/fees/summary')) : Promise.resolve(null),
  ]);
  const isToday = date === today;
  const holiday = ov.data?.holiday ?? day.data?.holiday ?? null;
  const r = roll.data;
  const roles = me.roles;

  const tasks: Task[] = [
    { key: 'leave', label: t('dash.task.leave'), count: r?.pending.leave ?? null, href: '/hr/leave', icon: <BadgeOutlined /> },
    { key: 'papers', label: t('dash.task.papers'), count: r?.pending.examPapers ?? null, href: '/exams', icon: <QuizOutlined /> },
    { key: 'fees', label: t('dash.task.fees'), count: r?.pending.feeFollowUps ?? null, href: '/fees/invoices?status=overdue', icon: <PaymentsOutlined />, tone: 'warning' as const },
    { key: 'obe', label: t('dash.task.obe'), count: r?.pending.marksToVerify ?? null, href: '/results', icon: <TrackChangesOutlined /> },
    { key: 'admissions', label: t('dash.task.admissions'), count: r?.pending.admissionsReview ?? null, href: '/admissions/applications', icon: <GroupsOutlined /> },
  ];

  const actions: QuickAction[] = [
    { href: '/attendance', label: t('dash.qa.attendance'), icon: <FactCheckOutlined /> },
    { href: '/homework', label: t('dash.qa.homework'), icon: <AssignmentOutlined /> },
    { href: '/timetable', label: t('dash.qa.timetable'), icon: <CalendarMonthOutlined /> },
    { href: '/obe', label: t('dash.qa.report'), icon: <TrackChangesOutlined /> },
    { href: '/messages', label: t('dash.qa.announce'), icon: <CampaignOutlined /> },
    { href: '/ai', label: t('dash.qa.ai'), icon: <AutoAwesomeOutlined />, ai: true },
  ];

  const monthFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-IN' : locale, { month: 'short', timeZone: 'UTC' });
  const perf = r?.performance ?? null;
  const KIND: Record<string, Pick<InboxItem, 'kind' | 'tone'>> = {
    leave: { kind: 'approval', tone: 'amber' },
    papers: { kind: 'approval', tone: 'blue' },
    fees: { kind: 'alert', tone: 'red' },
    obe: { kind: 'task', tone: 'amber' },
    admissions: { kind: 'approval', tone: 'blue' },
  };
  const inbox: InboxItem[] = tasks
    .filter((x) => (x.count ?? 0) > 0)
    .map((x) => ({ key: x.key, ...KIND[x.key], icon: x.icon, title: `${fmt.number(x.count ?? 0)} · ${x.label}`, action: t(KIND[x.key].kind === 'approval' ? 'home.review' : 'home.open'), href: x.href }))
    .sort((a, b) => (a.kind === 'alert' ? -1 : 0) - (b.kind === 'alert' ? -1 : 0));
  const lakh = (p: number) => Math.round(p / 1e5) / 100;
  const feeRows = (feeSum?.data?.classes ?? [])
    .filter((c) => c.billedPaise > 0)
    .slice(0, 10)
    .map((c) => ({ id: c.sectionId, label: c.className, collected: lakh(c.collectedPaise), outstanding: lakh(c.outstandingPaise) }));

  return (
    <>
      {holiday && <HolidayBanner title={holiday.title} date={date} />}
      {roll.error !== undefined && ov.error !== undefined ? <ErrorState message={ov.error} /> : <Kpis o={ov.data} r={r} isToday={isToday} fmt={fmt} t={t} roles={roles} />}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title={t('home.attTrend')} subtitle={t('home.attTrendSub')} className="xl:col-span-2" testId="attendance-trend">
          {perf && perf.some((p) => p.attendance !== null) ? (
            <TrendLine labels={perf.map((p) => monthFmt.format(new Date(`${p.month}-01T00:00:00Z`)))} values={perf.map((p) => p.attendance)} href="/attendance" ariaLabel={t('home.attTrend')} targetLabel={t('home.min75')} />
          ) : roll.error !== undefined ? (
            <ErrorState message={roll.error} />
          ) : (
            <EmptyState dense icon={<GradingOutlined />} title={t('dash.perf.none')} />
          )}
        </ChartCard>
        <AttentionInbox items={inbox} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {feeSum && (
          <ChartCard title={t('home.feeChart')} subtitle={t('home.feeChartSub')} testId="fee-chart">
            {feeRows.length ? (
              <FeeBars rows={feeRows} ariaLabel={t('home.feeChart')} collectedLabel={t('home.collected')} outstandingLabel={t('home.outstanding')} />
            ) : feeSum.error !== undefined ? (
              <ErrorState message={feeSum.error} />
            ) : (
              <EmptyState dense icon={<PaymentsOutlined />} title={t('setup.ghost.fees')} actions={<LinkButton href="/fees" variant="outlined" size="small">{t('setup.setUp')}</LinkButton>} />
            )}
          </ChartCard>
        )}
        <Card
          title={isToday ? t('today.todaysClasses') : t('today.classes')}
          subtitle={t('home.classesSub')}
          padded={false}
          testId="schedule-card"
          className={feeSum ? 'xl:col-span-2' : 'xl:col-span-3'}
          action={
            day.data?.classes.length ? (
              <LinkButton href={hrefFor('/classes', date, today)} variant="outlined" endIcon={<ArrowForward />} size="small">
                {t('today.allClasses')}
              </LinkButton>
            ) : undefined
          }
        >
          <div className="max-h-[420px] overflow-y-auto px-[18px] pb-[18px]">
            {day.error !== undefined ? (
              <ErrorState message={day.error} />
            ) : day.data.classes.length === 0 && holiday ? (
              <EmptyState dense icon={<BeachAccessOutlined />} title={t('holiday.noClasses', { title: holiday.title })} testId="no-classes-holiday" />
            ) : day.data.classes.length === 0 ? (
              <NoClasses date={date} today={today} path="/" />
            ) : (
              <ClassTimeline classes={day.data.classes} nowTime={isToday ? schoolNowTime() : undefined} />
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <UpcomingEvents grid events={(cal.data?.events ?? []).filter((e) => e.endsOn >= today).slice(0, 5)} t={t} fmt={fmt} locale={locale === 'en' ? 'en-IN' : locale} />
      </div>

      <Row cols={2}>
        <Announcements items={(bc.data ?? []).slice(0, 4)} t={t} fmt={fmt} canOpen={canSee(roles, 'school')} />
        <QuickActions actions={actions} t={t} wide={false} />
      </Row>
    </>
  );
}

function Kpis({ o, r, isToday, fmt, t, roles }: { o: Overview | undefined; r: DashboardRollup | undefined; isToday: boolean; fmt: Awaited<ReturnType<typeof getI18n>>['fmt']; t: Awaited<ReturnType<typeof getI18n>>['t']; roles: string[] }) {
  const c = o?.classes;
  const a = o?.attendance;
  const held = c ? c.taught + c.live : 0;
  const rate = r?.attendance?.today ?? a?.rate ?? null;
  return (
    <>
      <StatGrid min={190}>
        <StatTile testId="stat-students" icon={<GroupsOutlined />} label={t('dash.kpi.students')} value={r?.students ? fmt.number(r.students.total) : '—'} caption={r?.students ? t('dash.kpi.joined', { n: r.students.joined }) : undefined} trend={r?.students && r.students.prevJoined > 0 ? { delta: percentChange(r.students.joined, r.students.prevJoined), label: t('dash.vsLastMonth') } : undefined} href={canSee(roles as never, 'students') ? '/students' : undefined} />
        <StatTile
          testId="stat-attendance"
          icon={<FactCheckOutlined />}
          label={t('today.stat.attendance')}
          value={rate === null ? '—' : `${rate}%`}
          trend={isToday ? { delta: pointsChange(r?.attendance?.today, r?.attendance?.previous), label: t('dash.vsLastWeek'), suffix: t('dash.pts') } : undefined}
          spark={r?.performance && r.performance.some((p) => p.attendance !== null) ? <Sparkline values={r.performance.map((p) => p.attendance)} width={88} height={30} label={t('home.attTrend')} /> : undefined}
          caption={!a || a.periodsDue === 0 ? t('today.stat.noPeriods') : t('today.stat.periodsTaken', { taken: a.periodsTaken, due: a.periodsDue })}
          href="/attendance"
        />
        {r?.fees && (
          <StatTile
            testId="stat-fees"
            icon={<PaymentsOutlined />}
            label={t('dash.kpi.fees')}
            value={fmt.rupeesShort(r.fees.collected)}
            trend={{ delta: percentChange(r.fees.collected, r.fees.previous), label: t('dash.vsLastMonth') }}
            caption={t('dash.kpi.feesCaption', { out: fmt.rupeesShort(r.fees.outstanding), n: r.fees.overdueInvoices })}
            spark={r.fees.collected + r.fees.outstanding > 0 ? <MiniMeter value={(r.fees.collected / (r.fees.collected + r.fees.outstanding)) * 100} /> : undefined}
            href="/fees"
          />
        )}
        {(() => {
          const pts = (r?.performance ?? []).map((p) => p.internalMarks).filter((v): v is number => v !== null);
          if (pts.length === 0) return null;
          const last = pts[pts.length - 1];
          return (
            <StatTile
              testId="stat-results"
              icon={<GradingOutlined />}
              label={t('dash.perf.internal')}
              value={`${Math.round(last * 10) / 10}%`}
              trend={pts.length > 1 ? { delta: pointsChange(last, pts[pts.length - 2]), label: t('dash.vsLastMonth'), suffix: t('dash.pts') } : undefined}
              spark={<MiniBars values={pts} label={t('dash.perf.internal')} />}
              caption={t('dash.perf.subtitle')}
              href="/results"
            />
          );
        })()}
      </StatGrid>
      <div style={{ height: 16 }} />
      <StatGrid min={170}>
        <StatTile testId="stat-faculty" icon={<BadgeOutlined />} label={t('dash.kpi.faculty')} value={r?.staff ? fmt.number(r.staff.total) : '—'} caption={t('dash.kpi.facultyCaption')} href={canSee(roles as never, 'hr') ? '/hr' : undefined} />
        <StatTile
          testId="stat-classes"
          icon={<ClassOutlined />}
          label={t('today.stat.classes')}
          value={held}
          unit={t('today.stat.classesUnit', { n: c?.scheduled ?? 0 })}
          bar={c && <SegmentBar label={t('today.stat.classesBar', { taught: c.taught, live: c.live, notStarted: c.notStarted, missed: c.missed, upcoming: c.upcoming })} parts={[{ value: c.taught, color: 'var(--kx-success)' }, { value: c.live, color: 'var(--kx-live)' }, { value: c.notStarted + c.missed, color: 'var(--kx-danger)' }, { value: c.upcoming, color: 'var(--kx-line)' }]} />}
          caption={!c || c.scheduled === 0 ? t('today.stat.nothingScheduled') : [c.live && t('today.stat.live', { n: c.live }), t('today.stat.missed', { n: c.missed + c.notStarted }), c.upcoming && t('today.stat.upcoming', { n: c.upcoming })].filter(Boolean).join(' · ')}
          href="/classes"
        />
        <StatTile testId="stat-absent" icon={<PersonOffOutlined />} label={t('today.stat.absent')} value={a?.absentStudents ?? 0} unit={t.plural('today.stat.student', a?.absentStudents ?? 0)} caption={!a || a.marked === 0 ? t('today.stat.noAttendance') : t('today.stat.absentLate', { absent: a.absent, late: a.late })} />
        <StatTile testId="stat-homework" icon={<AssignmentOutlined />} label={t('today.stat.homework')} value={o?.homeworkAssigned ?? 0} unit={t('today.stat.homeworkUnit')} caption={t.plural('today.stat.assignments', o?.homeworkAssigned ?? 0)} />
        <StatTile testId="stat-boards" icon={<CastForEducationOutlined />} label={t('today.stat.boards')} value={o?.boards.online ?? 0} unit={t('today.stat.boardsUnit', { n: o?.boards.total ?? 0 })} caption={`${t('today.stat.inClass', { n: o?.boards.inClass ?? 0 })}${isToday ? '' : ` ${t('today.stat.rightNow')}`}`} />
        <StatTile testId="stat-messages" icon={<CampaignOutlined />} label={t('today.stat.messages')} value={o?.broadcastsSent ?? 0} unit={t('today.stat.messagesUnit')} caption={t('today.stat.messagesCaption')} />
      </StatGrid>
    </>
  );
}
