import type { Metadata } from 'next';
import { ChannelsPanel } from '@/components/comms/ChannelsPanel';
import { CreditLedgerList } from '@/components/comms/PassLists';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { CreditRow } from '@/lib/comms-pass';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.commsCredits') };
}

/** Message credits per channel: the balance, top-ups and corrections, and every spend (the accounts office keeps it). */
export default async function CreditsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('commsCredits');
  const { t } = await getI18n();
  const [credits, records] = await Promise.all([load(() => api<CreditRow[]>('/v1/comms/credits')), loadRecords('comm-credit-ledger', await searchParams)]);
  if (credits.error !== undefined) return <ErrorState message={credits.error} />;
  return (
    <>
      <PageHeader title={t('nav.commsCredits')} subtitle={t('cp.credits.subtitle')} />
      <div className="grid gap-6">
        <ChannelsPanel channels={[]} credits={credits.data!} canEdit={false} canTopUp onlyCredits />
        {records.error !== undefined ? <ErrorState message={records.error} /> : <CreditLedgerList meta={records.data.meta} page={records.data.page} state={records.data.state} />}
      </div>
    </>
  );
}
