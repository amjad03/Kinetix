import type { Metadata } from 'next';
import { NewChallan, ReconcileChallans } from '@/components/fee-depth/ChallanActions';
import { FeeKitTable } from '@/components/fee-depth/FeeKitTable';
import { FeesNav } from '@/components/fees/FeesNav';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fd.nav.challans') };
}

/** Bank challans: issued for a student's dues, paid at the bank, receipted from the bank's paid file. */
export default async function ChallansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('fees');
  const sp = await searchParams;
  const { t } = await getI18n();
  const records = await loadRecords('fee-challans', sp);
  return (
    <>
      <PageHeader
        title={t('fd.nav.challans')}
        subtitle={t('fd.sub.challans')}
        actions={
          <>
            <ReconcileChallans />
            <NewChallan />
          </>
        }
      />
      <FeesNav value="challans" />
      {records.error !== undefined ? <ErrorState message={records.error} /> : <FeeKitTable meta={records.data.meta} page={records.data.page} state={records.data.state} label={t('fd.nav.challans')} />}
    </>
  );
}
