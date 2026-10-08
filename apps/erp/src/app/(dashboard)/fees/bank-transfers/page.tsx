import type { Metadata } from 'next';
import { BankTransferQueue } from '@/components/fees/BankTransferQueue';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { BankTransferRow } from '@/lib/payments-desk';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('pd.transfers.title') };
}

/** Bank transfers reported by families, waiting for the accountant to match them with the bank statement. */
export default async function BankTransfersPage() {
  await requireSection('fees');
  const { t } = await getI18n();
  const rows = await load(() => api<BankTransferRow[]>('/v1/fees/bank-transfers'));
  return (
    <>
      <PageHeader title={t('pd.transfers.title')} subtitle={t('pd.transfers.subtitle')} />
      {rows.error !== undefined ? <ErrorState message={rows.error} /> : <BankTransferQueue rows={rows.data!} />}
    </>
  );
}
