import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MeritListTable } from '@/components/admissions/AdmissionsTables';
import { CycleActions } from '@/components/admissions/CycleActions';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/ui';
import { ErrorState } from '@/components/States';
import { ApiError, api, load, requireSection } from '@/lib/api';
import type { CycleDetail, CycleRow, MeritListDetail, MeritListSummary } from '@/lib/admissions';
import { formatDate } from '@/lib/dates';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.cycles') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CyclePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('admissions');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t, locale } = await getI18n();
  const data = await load(async () => {
    try {
      const [cycle, all, lists] = await Promise.all([api<CycleDetail>(`/v1/admissions/cycles/${id}`), api<CycleRow[]>('/v1/admissions/cycles'), api<MeritListSummary[]>(`/v1/admissions/cycles/${id}/merit-lists`)]);
      const latest = lists[0] ? await api<MeritListDetail>(`/v1/admissions/merit-lists/${lists[0].id}`) : null;
      return { cycle, row: all.find((c) => c.id === id)!, lists, latest };
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  const back = (
    <Box sx={{ ml: -1, mb: 0.5 }}>
      <LinkButton href="/admissions/cycles" size="small" startIcon={<ArrowBack />}>
        {t('adm.tab.cycles')}
      </LinkButton>
    </Box>
  );
  if (data.error !== undefined) {
    return (
      <>
        {back}
        <ErrorState message={data.error} />
      </>
    );
  }
  const { cycle, row, lists, latest } = data.data;
  const by = row.counts;
  return (
    <>
      {back}
      <PageHeader title={cycle.name} subtitle={`${row.programName} · ${row.yearLabel} · ${formatDate(cycle.opensOn, 'short', locale)} – ${formatDate(cycle.closesOn, 'short', locale)}`} actions={<Chip color={cycle.status === 'open' ? 'success' : 'default'} label={t(`adm.cycleStatus.${cycle.status}` as MessageKey)} />} />
      <StatGrid>
        <StatTile label={t('adm.cycle.seats')} value={t('adm.cycle.seatsLeft', { left: row.seatsLeft, seats: cycle.seats })} />
        <StatTile label={t('adm.col.applications')} value={String(Object.values(by).reduce((a, b) => a + b, 0))} />
        <StatTile label={t('adm.app.eligible')} value={String(by.eligible ?? 0)} />
        <StatTile label={t('adm.app.offered')} value={String((by.offered ?? 0) + (by.accepted ?? 0) + (by.enrolled ?? 0))} caption={t('adm.cycle.offeredCaption', { n: by.enrolled ?? 0 })} />
      </StatGrid>
      <SectionTitle>{t('adm.cycle.run')}</SectionTitle>
      <CycleActions id={id} status={cycle.status} latestUnpublished={lists[0] && !lists[0].publishedAt ? lists[0].id : null} />
      <SectionTitle
        action={
          <LinkButton size="small" href={`/admissions/applications?cycle=${id}`}>
            {t('adm.cycle.viewApplications')}
          </LinkButton>
        }
      >
        {t('adm.cycle.meritList')}
        {latest ? ` · v${latest.version}${latest.publishedAt ? ` (${t('adm.cycle.publishedTag')})` : ` (${t('adm.cycle.draftTag')})`}` : ''}
      </SectionTitle>
      {!latest ? (
        <Typography color="text.secondary">{t('adm.cycle.noList')}</Typography>
      ) : (
        <MeritListTable rows={latest.entries} />
      )}
    </>
  );
}
