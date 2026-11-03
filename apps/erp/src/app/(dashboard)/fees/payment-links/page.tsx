import type { Metadata } from 'next';
import { PaymentLinks, type LinkRow } from '@/components/fee-flagship/PaymentLinks';
import { FeesNav } from '@/components/fees/FeesNav';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ff.link.title') };
}

const STATUSES = ['active', 'paid', 'expired', 'cancelled'];

/** Payment links sent by SMS, WhatsApp and e-mail; paged on the server, newest first. */
export default async function PaymentLinksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection('fees');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const status = STATUSES.includes(sp.status ?? '') ? `&status=${sp.status}` : '';
  const { t } = await getI18n();
  const data = await load(() => api<{ rows: LinkRow[]; total: number }>(`/v1/fees/payment-links?page=${page}${status}`));
  return (
    <>
      <PageHeader title={t('ff.link.title')} subtitle={t('ff.link.subtitle')} />
      <FeesNav value="links" />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <PaymentLinks rows={data.data.rows} total={data.data.total} page={page} />}
    </>
  );
}
