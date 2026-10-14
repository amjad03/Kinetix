import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReceiptPanel } from '@/components/fee-depth/ReceiptPanel';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { ReceiptView } from '@/lib/fee-depth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fx.feeReceipt') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One receipt (all it paid, in every mode): print, PDF, cancellation with approval, and reissue. */
export default async function FeeReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('fees');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t } = await getI18n();
  const data = await load(() => api<ReceiptView>(`/v1/fee-collect/receipts/${id}`));
  return (
    <>
      <div className="kx-noprint">
        <PageHeader
          title={data.data?.receiptNo ?? t('fx.feeReceipt')}
          subtitle={data.data ? `${data.data.student.fullName} · ${data.data.student.section}` : undefined}
          actions={
            <>
              <Button asChild variant="outline" className="h-9">
                <Link href="/accounts/receipts">{t('fd.nav.receipts')}</Link>
              </Button>
              {data.data && (
                <Button asChild variant="outline" className="h-9">
                  <Link href={`/fees/counter?student=${data.data.student.id}`}>{t('fx.counter')}</Link>
                </Button>
              )}
            </>
          }
        />
      </div>
      {data.error !== undefined || !me ? <ErrorState title={t('fx.feeReceipt')} message={data.error ?? ''} /> : <ReceiptPanel r={data.data} me={{ id: me.id, roles: me.roles }} />}
    </>
  );
}
