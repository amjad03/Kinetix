import type { Metadata } from 'next';
import { GovList } from '@/components/governance/GovLists';
import { GovTabs } from '@/components/governance/GovTabs';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('gp.title.policies') };
}

/** Policies and document control: each policy with its published version, an open draft, acknowledgement and review. */
export default async function PoliciesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('governance');
  const { t } = await getI18n();
  const records = await loadRecords('governance-policies', await searchParams);
  return (
    <>
      <PageHeader title={t('gp.title.policies')} subtitle={t('gp.sub.policies')} />
      <GovTabs value="policies" />
      {records.error !== undefined ? <ErrorState message={records.error} /> : <GovList entity="governance-policies" meta={records.data.meta} page={records.data.page} state={records.data.state} />}
    </>
  );
}
