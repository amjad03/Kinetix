import type { Metadata } from 'next';
import { GlExport } from '@/components/finance/GlExport';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { Voucher } from '@/lib/finance';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.glExport') };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function GlExportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireSection('finance');
  const { from, to } = await searchParams;
  const { t } = await getI18n();
  const range = from && to && DAY.test(from) && DAY.test(to) ? { from, to } : null;
  const data = range ? await load(() => api<{ vouchers: Voucher[] }>(`/v1/finance/gl?from=${range.from}&to=${range.to}`)) : null;
  return (
    <>
      <PageHeader title={t('nav.glExport')} subtitle={t('fin.gl.subtitle')} />
      {data?.error !== undefined ? <ErrorState message={data.error} /> : <GlExport range={range} vouchers={data?.data?.vouchers ?? null} />}
    </>
  );
}
