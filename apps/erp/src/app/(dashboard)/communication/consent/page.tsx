import type { Metadata } from 'next';
import { ChannelPrefsList } from '@/components/comms/PassLists';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('cp.consent.title') };
}

/** Consent per channel under the DPDP Act: who opted in or out, how and when, kept as proof; the office records paper forms. */
export default async function ConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('comms');
  const { t, fmt } = await getI18n();
  const [records, register] = await Promise.all([loadRecords('comm-channel-prefs', await searchParams), load(() => api<{ total: number; optedOut: number; optedIn: number }>('/v1/comms/preferences/register?pageSize=10'))]);
  return (
    <>
      <PageHeader title={t('cp.consent.title')} subtitle={t('cp.consent.subtitle')} actions={<LinkButton href="/communication" variant="outlined">{t('nav.comms')}</LinkButton>} />
      {register.data && (
        <StatGrid min={160}>
          <StatTile label={t('cp.consent.optedOut')} value={fmt.number(register.data.optedOut)} testId="cp-opted-out" />
          <StatTile label={t('cp.consent.optedIn')} value={fmt.number(register.data.optedIn)} />
        </StatGrid>
      )}
      {records.error !== undefined ? <ErrorState message={records.error} /> : <ChannelPrefsList meta={records.data.meta} page={records.data.page} state={records.data.state} />}
    </>
  );
}
