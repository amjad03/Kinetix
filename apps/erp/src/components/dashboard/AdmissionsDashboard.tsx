import Link from 'next/link';
import { LinkButton } from '@/components/LinkButton';
import { EmptyState, ErrorState } from '@/components/States';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/Badge';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { api, load } from '@/lib/api';
import { ENQUIRY_STAGES, type CycleRow, type Pipeline } from '@/lib/admissions';
import type { DashboardRollup } from '@/lib/dashboard';
import { getI18n } from '@/i18n/server';
import { PendingTasks, QuickActions, Row } from './parts';

import { ArrowRight as ArrowForward, CalendarCheck as TodayOutlined, CalendarSync as EventRepeatOutlined, CirclePlus as AddCircleOutline, FolderOpen as FolderOpenOutlined, GraduationCap as SchoolOutlined, ListChecks as PlaylistAddCheckOutlined, UserCheck as HowToRegOutlined, UserSearch as PersonSearchOutlined } from 'lucide-react';
import { pal, size } from '@/lib/sx';
/** The admissions desk: the enquiry funnel, follow-ups due, applications to review and the open cycles. */
export async function AdmissionsDashboard() {
  const { t, fmt } = await getI18n();
  const [pipe, cycles, roll] = await Promise.all([
    load(() => api<Pipeline>('/v1/admissions/pipeline')),
    load(() => api<CycleRow[]>('/v1/admissions/cycles')),
    load(() => api<DashboardRollup>('/v1/admin/dashboard')),
  ]);
  if (pipe.error !== undefined) return <ErrorState message={pipe.error} />;
  const p = pipe.data;
  const total = Object.values(p.stages).reduce((a, b) => a + b, 0);
  const open = (cycles.data ?? []).filter((c) => c.status === 'open');
  const toReview = roll.data?.pending.admissionsReview ?? null;
  const funnel = ENQUIRY_STAGES.filter((s) => s !== 'lost' && s !== 'deferred');
  const maxStage = Math.max(1, ...funnel.map((s) => p.stages[s] ?? 0));

  return (
    <>
      <StatGrid min={200}>
        <StatTile testId="stat-enquiries" icon={<PersonSearchOutlined />} label={t('dash.adm.enquiries')} value={fmt.number(total)} caption={t('dash.adm.newThisWeek', { n: p.newThisWeek })} href="/admissions" />
        <StatTile testId="stat-followups" icon={<EventRepeatOutlined />} label={t('dash.adm.followUps')} value={p.followUpsDue} tone={p.followUpsDue > 0 ? 'warning' : 'default'} caption={t('dash.adm.followUpsCaption')} href="/admissions" />
        <StatTile testId="stat-review" icon={<PlaylistAddCheckOutlined />} label={t('dash.adm.toReview')} value={toReview ?? '—'} caption={t('dash.adm.toReviewCaption')} href="/admissions/applications" />
        <StatTile testId="stat-cycles" icon={<FolderOpenOutlined />} label={t('dash.adm.openCycles')} value={open.length} caption={open.length ? t('dash.adm.seatsLeft', { n: open.reduce((s, c) => s + c.seatsLeft, 0) }) : t('dash.adm.noOpen')} href="/admissions/cycles" />
      </StatGrid>

      <Row cols={3}>
        <Card title={t('dash.adm.funnel')} subtitle={t('dash.adm.funnelSub')} testId="funnel">
          <ul className="list-none m-0 p-0 grid gap-3">
            {funnel.map((s, i) => {
              const n = p.stages[s] ?? 0;
              return (
                <li key={s}>
                  <div className="flex justify-between mb-1">
                    <p className="text-[0.8125rem] font-semibold">{t(`adm.stage.${s}` as never)}</p>
                    <p className="text-[0.8125rem] tabular-nums font-bold">{n}</p>
                  </div>
                  <div className="h-[12px] rounded-[60px] bg-accent overflow-hidden" role="img" aria-label={`${t(`adm.stage.${s}` as never)}: ${n}`}>
                    <div className="h-full rounded-[60px]" style={{ width: size(`${(n / maxStage) * 100}%`), backgroundColor: pal(`var(--kx-chart-${(i % 3) + 1})`) }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title={t('dash.adm.cycles')} padded={false} action={<LinkButton href="/admissions/cycles" size="small" endIcon={<ArrowForward />}>{t('dash.viewAll')}</LinkButton>} testId="cycles">
          {(cycles.data ?? []).length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState dense icon={<SchoolOutlined />} title={t('dash.adm.noCycles')} />
            </div>
          ) : (
            <ul className="list-none m-0 p-0">
              {(cycles.data ?? []).slice(0, 6).map((c) => (
                <li className="px-5 py-2.5 border-t border-border flex items-center gap-3" key={c.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.875rem] font-semibold">
                      <Link href={`/admissions/cycles/${c.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {c.name}
                      </Link>
                    </p>
                    <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                      {t('dash.adm.cycleLine', { program: c.programName, left: c.seatsLeft, seats: c.seats })}
                    </span>
                  </div>
                  <StatusPill tone={c.status === 'open' ? 'success' : c.status === 'draft' ? 'neutral' : 'warning'}>{t(`adm.cycleStatus.${c.status}` as never)}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <PendingTasks
          t={t}
          tasks={[
            { key: 'followups', label: t('dash.task.followUps'), count: p.followUpsDue, href: '/admissions', icon: <TodayOutlined />, tone: 'warning' },
            { key: 'review', label: t('dash.task.review'), count: toReview, href: '/admissions/applications', icon: <HowToRegOutlined /> },
          ]}
        />
      </Row>
      <Row cols={3}>
        <QuickActions
          t={t}
          actions={[
            { href: '/admissions', label: t('dash.qa.newEnquiry'), icon: <AddCircleOutline /> },
            { href: '/admissions/applications', label: t('dash.qa.applications'), icon: <HowToRegOutlined /> },
            { href: '/admissions/cycles', label: t('dash.qa.cycles'), icon: <FolderOpenOutlined /> },
            { href: '/students', label: t('dash.qa.students'), icon: <SchoolOutlined /> },
          ]}
        />
      </Row>
    </>
  );
}
