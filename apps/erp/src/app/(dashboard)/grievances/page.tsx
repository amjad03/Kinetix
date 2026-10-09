import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { Tiles } from '@/components/campus/Desk';
import { GrievanceDesk } from '@/components/grievances/GrievanceDesk';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { GrievanceStats, GrievanceTicket } from '@/lib/campus-life';
import type { IncidentRow } from '@/lib/pathways-b';
import { loadFlows } from '@/lib/pathways-b-server';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.grievances') };
}

export default async function GrievancesPage() {
  await requireSection('grievances');
  const { t, fmt } = await getI18n();
  const data = await load(async () => {
    // The queue first: listing escalates tickets that are past their deadline.
    const tickets = await api<GrievanceTicket[]>('/v1/grievances');
    const stats = await api<GrievanceStats>('/v1/grievances/stats');
    return { tickets, stats };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { tickets, stats } = data.data;
  // Discipline incidents are read by the principal, administrator, heads and teachers: the tab is left out for roles that cannot read them.
  const incidents = await load(() => api<IncidentRow[]>('/v1/discipline/incidents'));
  const flows = await loadFlows();
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
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }} data-testid="committee-count">
          {t('gv.committee')}: {t('gv.committeeCaption', { open: stats.committee.open, total: stats.committee.total })}
        </Typography>
      )}
      <GrievanceDesk tickets={tickets} incidents={incidents.error === undefined ? incidents.data : null} flows={flows} nowIso={new Date().toISOString()} />
    </>
  );
}
