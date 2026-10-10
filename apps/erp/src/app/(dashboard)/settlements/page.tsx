import type { Metadata } from 'next';
import { SettlementsDesk, type Batch, type Exception, type GatewayView } from '@/components/gateway-books/SettlementsDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.settlements') };
}

export default async function SettlementsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('finance');
  const { tab } = await searchParams;
  const { t } = await getI18n();
  const data = await load(async () => ({
    gateway: await api<GatewayView>('/v1/admin/payments/gateway'),
    batches: await api<Batch[]>('/v1/fees/settlements'),
    exceptions: await api<Exception[]>('/v1/fees/settlements/exceptions'),
  }));
  return (
    <>
      <PageHeader title={t('nav.settlements')} subtitle={t('gb.set.subtitle')} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <SettlementsDesk {...data.data} initialTab={tab ?? 'batches'} />}
    </>
  );
}
