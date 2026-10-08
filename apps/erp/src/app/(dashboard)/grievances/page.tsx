import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { DeskTable, Pill, Tiles } from '@/components/campus/Desk';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { slaState, type GrievanceStats, type GrievanceTicket } from '@/lib/campus-life';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';

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
  const now = new Date();
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
      {tickets.length === 0 ? (
        <EmptyState icon={<ReportProblemOutlined />} title={t('gv.empty')}>
          {t('gv.emptyHint')}
        </EmptyState>
      ) : (
        <DeskTable
          title={t('gv.queue')}
          testId="tickets-table"
          head={[t('gv.col.no'), t('gv.col.subject'), t('gv.col.category'), t('gv.col.severity'), t('gv.col.status'), t('gv.col.due'), t('gv.col.level')]}
          rows={tickets.map((x) => {
            const sla = slaState(x, now);
            return [
              x.ticketNo,
              <span key="s">
                {x.subject} {x.anonymous && <Pill label={t('gv.anonymous')} />} {x.committee && <Pill label={t('gv.confidential')} tone="warning" />}
              </span>,
              t(`gv.cat.${x.category}` as MessageKey),
              <Pill key="v" label={t(`gv.sev.${x.severity}` as MessageKey)} tone={x.severity === 'critical' ? 'error' : x.severity === 'high' ? 'warning' : 'default'} />,
              t(`gv.status.${x.status}` as MessageKey),
              <Pill key="d" label={fmt.dateTime(x.slaDueAt)} tone={sla === 'overdue' ? 'error' : sla === 'soon' ? 'warning' : 'default'} />,
              String(x.escalationLevel),
            ];
          })}
        />
      )}
    </>
  );
}
