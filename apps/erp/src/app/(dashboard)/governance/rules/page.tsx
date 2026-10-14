import type { Metadata } from 'next';
import { RulesDesk } from '@/components/governance/RulesDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.govRules') };
}

/** The business rule registry: versions, four-eyes approval and effective dates. */
export default async function RulesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('governance');
  const { t } = await getI18n();
  const records = await loadRecords('business-rules', await searchParams);
  return (
    <>
      <PageHeader title={t('nav.govRules')} subtitle={t('gr.subtitle')} />
      {records.error !== undefined ? <ErrorState message={records.error} /> : <RulesDesk meta={records.data.meta} page={records.data.page} state={records.data.state} />}
    </>
  );
}
