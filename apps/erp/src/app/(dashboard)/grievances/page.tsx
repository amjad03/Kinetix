import type { Metadata } from 'next';
import { Tiles } from '@/components/campus/Desk';
import { GrievanceDesk } from '@/components/grievances/GrievanceDesk';
import { WelfareTab } from '@/components/life/WelfareTab';
import { GrievanceReportView } from '@/components/life/WelfareLists';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, getMe, load, requireSection } from '@/lib/api';
import type { GrievanceStats, GrievanceTicket } from '@/lib/campus-life';
import type { GrievanceReport } from '@/lib/life';
import type { IncidentRow } from '@/lib/pathways-b';
import { loadFlows } from '@/lib/pathways-b-server';
import { loadRecords } from '@/lib/records-server';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.grievances') };
}

/** List tabs and their record kit entities; who sees each tab follows the API's roles. */
const LISTS = { register: 'grievances', routes: 'grievance-routes', undertakings: 'antiragging-undertakings', accommodations: 'pwd-accommodations', welfare: 'welfare-requests', discipline: 'discipline-incidents' } as const;
type ListTab = keyof typeof LISTS;
const TAB_ROLES: Record<string, string[]> = {
  desk: ['principal', 'tenant_admin', 'grievance_officer', 'icc_member'],
  register: ['principal', 'tenant_admin', 'grievance_officer', 'icc_member'],
  routes: ['principal', 'tenant_admin', 'grievance_officer'],
  undertakings: ['principal', 'tenant_admin', 'grievance_officer'],
  accommodations: ['principal', 'tenant_admin', 'grievance_officer'],
  welfare: ['principal', 'tenant_admin', 'grievance_officer'],
  discipline: ['principal', 'tenant_admin'],
  report: ['principal', 'tenant_admin', 'grievance_officer', 'icc_member'],
};

/** The academic year label for today: "2026-27" (years start in June). */
function yearNow(): string {
  const d = new Date();
  const start = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/**
 * Grievances and welfare: the ticket desk, the NAAC grievance register, routing by category, anti-ragging
 * undertakings, disability accommodations, welfare requests, the discipline register and the year's report.
 */
export default async function GrievancesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('grievances');
  const sp = await searchParams;
  const { t, fmt } = await getI18n();
  const me = await getMe();
  const allowed = Object.keys(TAB_ROLES).filter((k) => TAB_ROLES[k].some((r) => me.roles.includes(r as never)));
  const tab = allowed.includes(String(sp.tab)) ? String(sp.tab) : 'desk';
  const data = await load(async () => {
    // The queue first: listing escalates tickets that are past their deadline.
    const tickets = await api<GrievanceTicket[]>('/v1/grievances');
    const stats = await api<GrievanceStats>('/v1/grievances/stats');
    return { tickets, stats };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { tickets, stats } = data.data;
  const tabs = <LinkTabs label={t('nav.grievances')} value={tab} items={allowed.map((x) => ({ value: x, label: t(`wd.tab.${x}` as MessageKey), href: x === 'desk' ? '/grievances' : `/grievances?tab=${x}` }))} />;
  let body: React.ReactNode;
  if (tab === 'desk') {
    // Discipline incidents are read by the principal, administrator, heads and teachers: the tab is left out for roles that cannot read them.
    const incidents = await load(() => api<IncidentRow[]>('/v1/discipline/incidents'));
    const flows = await loadFlows();
    body = <GrievanceDesk tickets={tickets} incidents={incidents.error === undefined ? incidents.data : null} flows={flows} nowIso={new Date().toISOString()} />;
  } else if (tab === 'report') {
    const r = await load(() => api<GrievanceReport>('/v1/welfare/reports/grievances'));
    body = r.error !== undefined ? <ErrorState message={r.error} /> : <GrievanceReportView report={r.data} />;
  } else {
    const records = await loadRecords(LISTS[tab as ListTab], sp);
    const structure = tab === 'undertakings' ? await load(() => api<Structure>('/v1/admin/structure')) : null;
    const sections = (structure?.data?.sections ?? []).map((x) => ({ id: x.id, name: x.displayName }));
    body = records.error !== undefined ? <ErrorState message={records.error} /> : <WelfareTab tab={tab} meta={records.data.meta} page={records.data.page} state={records.data.state} sections={sections} year={yearNow()} />;
  }
  return (
    <>
      <PageHeader title={t('nav.grievances')} subtitle={t('gv.subtitle')} />
      <Tiles>
        <StatTile label={t('gv.stat.open')} value={fmt.number(stats.open)} testId="gv-open" />
        <StatTile label={t('gv.stat.overdue')} value={fmt.number(stats.overdue)} tone={stats.overdue > 0 ? 'warning' : 'default'} />
        <StatTile label={t('gv.stat.rating')} value={stats.averageRating === null ? '-' : String(stats.averageRating)} caption={t('gv.stat.ratingCaption')} />
        <StatTile label={t('gv.stat.resolution')} value={stats.averageResolutionHours === null ? '-' : fmt.number(stats.averageResolutionHours)} unit={t('gv.stat.hours')} />
      </Tiles>
      {stats.committee && (
        <p className="text-[13px] leading-[19px] text-muted-foreground mb-6" data-testid="committee-count">
          {t('gv.committee')}: {t('gv.committeeCaption', { open: stats.committee.open, total: stats.committee.total })}
        </p>
      )}
      {tabs}
      {body}
    </>
  );
}
