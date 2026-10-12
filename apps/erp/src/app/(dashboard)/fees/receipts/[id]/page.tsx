import type { Metadata } from 'next';
import { PrintButton, ReceiptPrintStyles } from '@/components/fees/PrintReceipt';
import { RefundPanel } from '@/components/fees/RefundPanel';
import { loadFlows } from '@/lib/pathways-b-server';
import { ReceiptView } from '@/components/fees/ReceiptView';
import { LinkButton } from '@/components/LinkButton';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { TIMEZONE } from '@/lib/school';
import { getI18n } from '@/i18n/server';
import type { FeeReceipt } from '@/lib/types';

import { Card } from '@/components/kx';
import { ArrowLeft as ArrowBack } from 'lucide-react';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fees.receipt') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('fees');
  const { id } = await params;
  const { t } = await getI18n();
  const receipt = UUID.test(id) ? await load(() => api<FeeReceipt>(`/v1/fees/payments/${id}/receipt`)) : { error: t('fees.receipt.notFound'), data: undefined };

  const flows = receipt.data ? await loadFlows() : null;

  return (
    <>
      <ReceiptPrintStyles />
      <div className="kx-noprint flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="-ml-2">
          <LinkButton href="/fees/invoices?status=paid" size="small" startIcon={<ArrowBack />}>
            {t('fees.invoices')}
          </LinkButton>
        </div>
        {receipt.data && <RefundPanel paymentId={receipt.data.paymentId} amountPaise={receipt.data.amountPaise} flows={flows} />}
        {receipt.data && <PrintButton />}
      </div>
      {receipt.error !== undefined ? (
        <ErrorState title={t('fees.receipt.cantShow')} message={receipt.error} />
      ) : (
        <Card className="kx-receipt max-w-[720px] mx-auto p-5 md:p-10">
          <ReceiptView r={receipt.data} timeZone={TIMEZONE} full />
          <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-8 text-center">
            {t('fees.receipt.footer')}
          </p>
        </Card>
      )}
    </>
  );
}
