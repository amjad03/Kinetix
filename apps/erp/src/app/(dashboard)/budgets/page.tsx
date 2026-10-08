import type { Metadata } from 'next';
import { BudgetsDesk } from '@/components/finance/BudgetsDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { fiscalYearOf, recentFiscalYears, type BudgetReport } from '@/lib/finance';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.budgets') };
}

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  await requireSection('finance');
  const { fy } = await searchParams;
  const year = fy && /^\d{4}-\d{2}$/.test(fy) ? fy : fiscalYearOf(new Date());
  const { t } = await getI18n();
  const data = await load(() => api<BudgetReport>(`/v1/finance/budgets?fiscalYear=${year}`));
  return (
    <>
      <PageHeader title={t('nav.budgets')} subtitle={t('fin.bud.subtitle')} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <BudgetsDesk report={data.data} years={recentFiscalYears()} />}
    </>
  );
}
