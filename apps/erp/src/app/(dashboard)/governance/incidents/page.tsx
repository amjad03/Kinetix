import type { Metadata } from 'next';
import { IncidentsDesk } from '@/components/governance/IncidentsDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.govIncidents') };
}

/** The incident register, with the 72-hour clock for incidents that involve personal data. */
export default async function IncidentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('governance');
  const { t } = await getI18n();
  const records = await loadRecords('incidents', await searchParams);
  return (
    <>
      <PageHeader title={t('nav.govIncidents')} subtitle={t('inc.subtitle')} />
      {records.error !== undefined ? <ErrorState message={records.error} /> : <IncidentsDesk meta={records.data.meta} page={records.data.page} state={records.data.state} />}
    </>
  );
}
