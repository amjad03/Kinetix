import type { Metadata } from 'next';
import { HrList } from '@/components/hr/HrList';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.delegations') };
}

/** Delegated approvals: who I handed my leave and workflow approvals to, and what was handed to me (administrators see all). */
export default async function DelegationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('delegations');
  const { t } = await getI18n();
  const list = await loadRecords('delegations', await searchParams);
  return (
    <>
      <PageHeader title={t('nav.delegations')} subtitle={t('dg.subtitle')} />
      {list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity="delegations" data={list.data} />}
    </>
  );
}
