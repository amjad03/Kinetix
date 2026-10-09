import type { Metadata } from 'next';
import { IncidentsDesk } from '@/components/governance/IncidentsDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { Incident } from '@/lib/governance';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.govIncidents') };
}

/** The incident register, with the 72-hour clock for incidents that involve personal data. */
export default async function IncidentsPage() {
  await requireSection('governance');
  const { t } = await getI18n();
  const incidents = await load(() => api<Incident[]>('/v1/governance/incidents'));
  return (
    <>
      <PageHeader title={t('nav.govIncidents')} subtitle={t('inc.subtitle')} />
      {incidents.error !== undefined ? <ErrorState message={incidents.error} /> : <IncidentsDesk incidents={incidents.data!} />}
    </>
  );
}
