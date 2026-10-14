import type { Metadata } from 'next';
import { DelegationRecords } from '@/components/delegations/DelegationRecords';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.delegations') };
}

/** Delegated approvals: who I handed my leave and workflow approvals to, and what was handed to me (leaders see all). */
export default async function DelegationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('delegations');
  const { t } = await getI18n();
  const records = await loadRecords('delegations', await searchParams);
  const leader = !!me?.roles.some((r) => r === 'principal' || r === 'tenant_admin');
  return (
    <>
      <PageHeader title={t('nav.delegations')} subtitle={t('dg.subtitle')} />
      {records.error !== undefined ? <ErrorState message={records.error} /> : <DelegationRecords meta={records.data.meta} page={records.data.page} state={records.data.state} userId={me?.id ?? ''} leader={leader} />}
    </>
  );
}
