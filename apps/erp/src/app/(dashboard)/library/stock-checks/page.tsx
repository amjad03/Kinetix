import type { Metadata } from 'next';
import { StockCheckDesk, type StockCheck } from '@/components/campus-ops/StockCheckDesk';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('cops.sc.title') };
}

export default async function StockChecksPage() {
  await requireSection('library');
  const checks = await load(() => api<StockCheck[]>('/v1/library/stock-checks'));
  if (!checks.data) return <ErrorState message={checks.error ?? ''} />;
  return <StockCheckDesk checks={checks.data} />;
}
