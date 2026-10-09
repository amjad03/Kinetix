import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { type Agent, type Commission, PartnersDesk } from '@/components/admissions/PartnersDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { schoolToday } from '@/lib/school';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.partners') };
}

export default async function PartnersPage() {
  await requireSection('admissions');
  const [agents, commissions] = await Promise.all([load(() => api<Agent[]>('/v1/admissions/agents')), load(() => api<Commission[]>('/v1/admissions/commissions'))]);
  const { t } = await getI18n();
  const error = agents.error ?? commissions.error;
  return (
    <>
      <PageHeader title={t('adm.tab.partners')} subtitle={t('ag.partners.subtitle')} />
      <AdmissionsTabs current="partners" />
      {error !== undefined ? <ErrorState message={error} /> : <PartnersDesk agents={agents.data!} commissions={commissions.data!} today={schoolToday()} />}
    </>
  );
}
