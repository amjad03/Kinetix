import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, FileCheck2, Gavel, Landmark, MessageSquareWarning, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { GovTabs } from '@/components/governance/GovTabs';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card, StatusPill } from '@/components/ui';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import { meetingsPct, type GovDashboard } from '@/lib/governance-pass';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('gp.title.overview') };
}

/**
 * The board and management view of governance: statutory committees against their norms, grievances, RTI, the
 * compliance calendar, policies, data-protection requests, incidents, academic audit findings and the IQAC's AQAR.
 */
export default async function GovernanceOverview() {
  await requireSection('governance');
  const { t, fmt } = await getI18n();
  const res = await load(() => api<GovDashboard>('/v1/governance/dashboard'));
  const header = <PageHeader title={t('gp.title.overview')} subtitle={t('gp.sub.overview')} />;
  if (res.error !== undefined)
    return (
      <>
        {header}
        <GovTabs value="overview" />
        <ErrorState message={res.error} />
      </>
    );
  const d = res.data;
  const c = d.committees;
  const pct = meetingsPct(c.meetingsHeld, c.meetingsExpected);
  return (
    <>
      {header}
      <GovTabs value="overview" />
      <p className="mb-4 text-[13px] text-muted-foreground" data-testid="gov-year">
        {t('gp.o.year', { year: d.year.label, from: fmt.date(d.year.from, 'short'), to: fmt.date(d.year.to, 'short') })}
      </p>
      <StatGrid min={200}>
        <StatTile testId="gov-committees" icon={<Users />} label={t('gp.k.committees')} value={c.statutory} caption={c.missing.length ? t('gp.k.missing', { n: c.missing.length }) : t('gp.k.attention', { n: c.attention.length })} tone={c.missing.length || c.attention.length ? 'warning' : 'default'} href="/governance/committees" />
        <StatTile testId="gov-meetings" icon={<CalendarClock />} label={t('gp.k.meetings')} value={`${pct}%`} caption={t('gp.k.meetingsCap', { held: c.meetingsHeld, expected: c.meetingsExpected, pending: c.minutesPending })} tone={pct < 100 ? 'warning' : 'default'} href="/governance/committees" />
        <StatTile testId="gov-actions" icon={<FileCheck2 />} label={t('gp.k.actions')} value={c.openActions} caption={t('gp.k.actionsCap', { overdue: c.overdueActions, done: c.doneActions })} tone={c.overdueActions ? 'warning' : 'default'} href="/governance/committees" />
        <StatTile testId="gov-grievances" icon={<MessageSquareWarning />} label={t('gp.k.grievances')} value={d.grievances.open} caption={t('gp.k.grievancesCap', { overdue: d.grievances.overdue, resolved: d.grievances.resolvedYear, received: d.grievances.receivedYear })} tone={d.grievances.overdue ? 'warning' : 'default'} href="/grievances" />
        <StatTile testId="gov-rti" icon={<Landmark />} label={t('gp.k.rti')} value={d.rti.open} caption={t('gp.k.rtiCap', { overdue: d.rti.overdue, week: d.rti.dueWeek, appeals: d.rti.appealsPending })} tone={d.rti.overdue ? 'warning' : 'default'} href="/governance/rti" />
        <StatTile testId="gov-calendar" icon={<Gavel />} label={t('gp.k.calendar')} value={d.calendar.dueMonth} caption={t('gp.k.calendarCap', { overdue: d.calendar.overdue, done: d.calendar.doneYear, onTime: d.calendar.onTime })} tone={d.calendar.overdue ? 'warning' : 'default'} href="/governance/compliance" />
        <StatTile testId="gov-policies" icon={<ScrollText />} label={t('gp.k.policies')} value={d.policies.published} caption={t('gp.k.policiesCap', { review: d.policies.reviewDue, approval: d.policies.inApproval, acks: d.policies.acknowledgements })} tone={d.policies.reviewDue ? 'warning' : 'default'} href="/governance/policies" />
        <StatTile testId="gov-dpdp" icon={<ShieldCheck />} label={t('gp.k.dpdp')} value={d.dpdp.pending} caption={t('gp.k.dpdpCap', { overdue: d.dpdp.overdue, incidents: d.incidents.active, severe: d.incidents.severe })} tone={d.dpdp.overdue || d.incidents.severe ? 'warning' : 'default'} href="/dpdp" />
      </StatGrid>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="m-0 mb-3 text-[15px] font-semibold">{t('gp.o.attention')}</h2>
          {c.missing.length === 0 && c.attention.length === 0 ? (
            <p className="m-0 text-[13px] text-green-ink">{t('gp.o.allWell')}</p>
          ) : (
            <ul className="m-0 list-none p-0 text-[13px]" data-testid="gov-attention">
              {c.missing.map((m) => (
                <li key={m.kind} className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="min-w-0">{t(`gp.kind.${m.kind}` as MessageKey)}</span>
                  <StatusPill tone="danger">{t('gp.o.notConstituted')}</StatusPill>
                </li>
              ))}
              {c.attention.map((a) => (
                <li key={a.id} className="mb-1.5 flex items-center justify-between gap-2">
                  <Link href={`/governance/committees/${a.id}`} className="min-w-0 truncate">
                    {a.name}
                  </Link>
                  <StatusPill tone="warning">{a.issues ? t('gp.o.issues', { n: a.issues }) : a.overdueActions ? t('gp.o.overdueActions', { n: a.overdueActions }) : t('gp.o.meetingsShort', { held: a.meetingsHeld, expected: a.meetingsExpected })}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="m-0 mb-3 text-[15px] font-semibold">{t('gp.o.next')}</h2>
          {d.calendar.next.length === 0 ? (
            <p className="m-0 text-[13px] text-muted-foreground">{t('gp.o.noDeadlines')}</p>
          ) : (
            <ul className="m-0 list-none p-0 text-[13px]" data-testid="gov-next">
              {d.calendar.next.map((n) => (
                <li key={n.id} className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="min-w-0">{n.title}</span>
                  <StatusPill tone={n.dueOn < d.today ? 'danger' : 'neutral'}>{fmt.date(n.dueOn, 'short')}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="m-0 mb-3 text-[15px] font-semibold">{t('gp.o.quality')}</h2>
          <ul className="m-0 list-none p-0 text-[13px]">
            <li className="mb-1.5 flex items-center justify-between gap-2">
              <span>{t('gp.o.aqar')}</span>
              {d.iqac.aqar ? <StatusPill tone={d.iqac.aqar.status === 'accepted' || d.iqac.aqar.status === 'submitted' ? 'success' : 'warning'}>{`${d.iqac.aqar.year} · ${t(`rk.o.iqac-aqar.status.${d.iqac.aqar.status}` as MessageKey)}`}</StatusPill> : <StatusPill tone="neutral">{t('gp.o.none')}</StatusPill>}
            </li>
            <li className="mb-1.5 flex items-center justify-between gap-2">
              <span>{t('gp.o.dvv')}</span>
              <StatusPill tone={d.iqac.dvvOpen ? 'warning' : 'success'}>{fmt.number(d.iqac.dvvOpen)}</StatusPill>
            </li>
            <li className="mb-1.5 flex items-center justify-between gap-2">
              <span>{t('gp.o.findings')}</span>
              <StatusPill tone={d.audit.overdueFindings ? 'danger' : d.audit.openFindings ? 'warning' : 'success'}>{t('gp.o.findingsVal', { open: d.audit.openFindings, overdue: d.audit.overdueFindings })}</StatusPill>
            </li>
            <li className="mb-1.5 flex items-center justify-between gap-2">
              <span>{t('gp.o.external')}</span>
              <StatusPill tone={d.grievances.external ? 'warning' : 'neutral'}>{fmt.number(d.grievances.external)}</StatusPill>
            </li>
          </ul>
          <p className="mt-3 mb-0 text-[13px]">
            <AlertTriangle className="mr-1 inline size-3.5 text-muted-foreground" aria-hidden />
            <Link href="/accreditation">{t('gp.o.readiness')}</Link>
          </p>
        </Card>
      </div>
    </>
  );
}
