import type { Metadata } from 'next';
import { SendLogList } from '@/components/comms/PassLists';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('cp.log.title') };
}

/** Every send and hold-back, its channel and fallback step, cost and delivery report: the audit trail of messages. */
export default async function SendLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('comms');
  const { t } = await getI18n();
  const records = await loadRecords('comm-send-log', await searchParams);
  return (
    <>
      <PageHeader title={t('cp.log.title')} subtitle={t('cp.log.subtitle')} actions={<LinkButton href="/communication" variant="outlined">{t('nav.comms')}</LinkButton>} />
      {records.error !== undefined ? <ErrorState message={records.error} /> : <SendLogList meta={records.data.meta} page={records.data.page} state={records.data.state} />}
    </>
  );
}
