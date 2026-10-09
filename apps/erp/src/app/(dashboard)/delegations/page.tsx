import type { Metadata } from 'next';
import { DelegationDesk } from '@/components/delegations/DelegationDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { DelegationRow } from '@/lib/dpdp';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.delegations') };
}

/** Delegated approvals: who I handed my leave and workflow approvals to, and what was handed to me. */
export default async function DelegationsPage() {
  await requireSection('delegations');
  const { t } = await getI18n();
  const [rows, colleagues] = await Promise.all([load(() => api<DelegationRow[]>('/v1/delegations')), load(() => api<{ id: string; fullName: string }[]>('/v1/delegations/colleagues'))]);
  const failed = rows.error ?? colleagues.error;
  return (
    <>
      <PageHeader title={t('nav.delegations')} subtitle={t('dg.subtitle')} />
      {failed !== undefined ? <ErrorState message={failed} /> : <DelegationDesk rows={rows.data!} colleagues={colleagues.data!} today={new Date().toISOString().slice(0, 10)} />}
    </>
  );
}
