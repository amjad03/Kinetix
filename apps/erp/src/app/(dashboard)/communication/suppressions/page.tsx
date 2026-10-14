import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { SuppressionsList } from '@/components/life/SuppressionsList';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('cd.sup.title') };
}

/** Numbers and addresses messages must not go to (DND, bounced, opted out): campaigns skip them. */
export default async function SuppressionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('comms');
  const { t } = await getI18n();
  const records = await loadRecords('contact-suppressions', await searchParams);
  return (
    <>
      <PageHeader title={t('cd.sup.title')} subtitle={t('cd.sup.subtitle')} actions={<LinkButton href="/communication" variant="outlined">{t('nav.comms')}</LinkButton>} />
      {records.error !== undefined ? <ErrorState message={records.error} /> : <SuppressionsList meta={records.data.meta} page={records.data.page} state={records.data.state} />}
    </>
  );
}
