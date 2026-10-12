import { LinkButton } from '@/components/LinkButton';
import { EmptyState, ErrorState } from '@/components/States';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/Badge';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { api, load } from '@/lib/api';
import { canSee } from '@/lib/access';
import type { JobOpening, LeaveRequest, PayrollRunSummary, StaffSummary } from '@/lib/hr-types';
import type { Me } from '@/lib/types';
import { getI18n } from '@/i18n/server';
import { PendingTasks, QuickActions, Row } from './parts';

import { ArrowRight as ArrowForward, Briefcase as WorkOutlineOutlined, CalendarX as EventBusyOutlined, FileText as RequestQuoteOutlined, Folders as FolderCopyOutlined, IdCard as BadgeOutlined, Umbrella as BeachAccessOutlined, UserPlus as PersonAddAltOutlined, Users as PeopleAltOutlined } from 'lucide-react';
import { size } from '@/lib/sx';
/** HR: head count, who is away, leave waiting for a decision, the payroll run and open positions. */
export async function HrDashboard({ me, today }: { me: Me; today: string }) {
  const { t, fmt } = await getI18n();
  const canPay = canSee(me.roles, 'payroll');
  const [staff, leave, runs, openings] = await Promise.all([
    load(() => api<StaffSummary[]>('/v1/hr/staff')),
    load(() => api<LeaveRequest[]>('/v1/hr/leave/requests')),
    canPay ? load(() => api<PayrollRunSummary[]>('/v1/payroll/runs')) : Promise.resolve(null),
    load(() => api<JobOpening[]>('/v1/hr/openings')),
  ]);
  if (staff.error !== undefined) return <ErrorState message={staff.error} />;
  const active = staff.data.filter((s) => s.status === 'active' || s.status === 'on_notice' || s.status === null);
  const pending = (leave.data ?? []).filter((l) => l.status === 'pending');
  const away = (leave.data ?? []).filter((l) => l.status === 'approved' && l.fromDate <= today && l.toDate >= today);
  const run = runs?.data?.[0];
  const open = (openings.data ?? []).filter((o) => o.status === 'open');
  const byDept = new Map<string, number>();
  for (const s of active) byDept.set(s.department?.name ?? t('dash.hr.noDept'), (byDept.get(s.department?.name ?? t('dash.hr.noDept')) ?? 0) + 1);
  const depts = [...byDept.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  const top = Math.max(1, ...depts.map((d) => d[1]));

  return (
    <>
      <StatGrid min={200}>
        <StatTile testId="stat-staff" icon={<PeopleAltOutlined />} label={t('dash.hr.staff')} value={fmt.number(active.length)} caption={t('dash.hr.onNotice', { n: staff.data.filter((s) => s.status === 'on_notice').length })} href="/hr" />
        <StatTile testId="stat-away" icon={<BeachAccessOutlined />} label={t('dash.hr.away')} value={away.length} caption={t('dash.hr.awayCaption')} href="/hr/leave" />
        <StatTile testId="stat-leave" icon={<EventBusyOutlined />} label={t('dash.hr.leave')} value={pending.length} tone={pending.length > 0 ? 'warning' : 'default'} caption={t('dash.hr.leaveCaption')} href="/hr/leave" />
        {canPay && <StatTile testId="stat-payroll" icon={<RequestQuoteOutlined />} label={t('dash.hr.payroll')} value={run ? t(`pay.status.${run.status}` as never) : '—'} caption={run ? t('dash.hr.payrollCaption', { month: run.month, net: fmt.rupeesShort(run.netPaise) }) : t('dash.hr.noRun')} href="/payroll" />}
        <StatTile testId="stat-openings" icon={<WorkOutlineOutlined />} label={t('dash.hr.openings')} value={open.length} caption={t('dash.hr.positions', { n: open.reduce((s, o) => s + o.positions, 0) })} href="/hr/recruitment" />
      </StatGrid>

      <Row cols={3}>
        <Card title={t('dash.hr.pendingLeave')} padded={false} action={<LinkButton href="/hr/leave" size="small" endIcon={<ArrowForward />}>{t('dash.viewAll')}</LinkButton>} testId="pending-leave">
          {pending.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState dense icon={<EventBusyOutlined />} title={t('dash.hr.noPending')} />
            </div>
          ) : (
            <ul className="list-none m-0 p-0">
              {pending.slice(0, 6).map((l) => (
                <li className="flex items-center gap-3 px-5 py-2.5 border-t border-border" key={l.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.875rem] font-semibold">
                      {l.user.fullName}
                    </p>
                    <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                      {l.leaveType.name} · {fmt.date(l.fromDate, 'dayMonth')}
                      {l.toDate !== l.fromDate ? ` – ${fmt.date(l.toDate, 'dayMonth')}` : ''}
                    </span>
                  </div>
                  <StatusPill tone="warning">{t('dash.hr.days', { n: l.days })}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t('dash.hr.byDept')} testId="staff-by-dept">
          {depts.length === 0 ? (
            <EmptyState dense icon={<BadgeOutlined />} title={t('dash.hr.noStaff')} />
          ) : (
            <ul className="list-none m-0 p-0 grid gap-3">
              {depts.map(([name, n]) => (
                <li key={name}>
                  <div className="flex justify-between mb-1">
                    <p className="text-[0.8125rem] font-semibold">{name}</p>
                    <p className="text-[0.8125rem] font-bold tabular-nums">{n}</p>
                  </div>
                  <div className="h-[10px] rounded-[50px] bg-accent overflow-hidden" role="img" aria-label={`${name}: ${n}`}>
                    <div className="h-full bg-[var(--kx-chart-1)] rounded-[50px]" style={{ width: size(`${(n / top) * 100}%`) }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <PendingTasks
          t={t}
          tasks={[
            { key: 'leave', label: t('dash.task.leave'), count: pending.length, href: '/hr/leave', icon: <EventBusyOutlined />, tone: 'warning' },
            { key: 'payroll', label: t('dash.task.payroll'), count: canPay ? (run && run.status !== 'locked' ? 1 : 0) : null, href: '/payroll', icon: <RequestQuoteOutlined /> },
            { key: 'applicants', label: t('dash.task.openings'), count: open.length, href: '/hr/recruitment', icon: <PersonAddAltOutlined /> },
          ]}
        />
      </Row>
      <Row cols={3}>
        <QuickActions
          t={t}
          actions={[
            { href: '/hr', label: t('dash.qa.staff'), icon: <BadgeOutlined /> },
            { href: '/hr/leave', label: t('dash.qa.leave'), icon: <EventBusyOutlined /> },
            { href: '/hr/attendance', label: t('dash.qa.staffAttendance'), icon: <PeopleAltOutlined /> },
            { href: '/hr/recruitment', label: t('dash.qa.recruit'), icon: <PersonAddAltOutlined /> },
            ...(canPay ? [{ href: '/payroll', label: t('dash.qa.payroll'), icon: <RequestQuoteOutlined /> }] : []),
            ...(canSee(me.roles, 'documents') ? [{ href: '/documents', label: t('dash.qa.documents'), icon: <FolderCopyOutlined /> }] : []),
          ]}
        />
      </Row>
    </>
  );
}
