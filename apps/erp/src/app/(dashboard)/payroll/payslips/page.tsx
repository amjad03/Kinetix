import type { Metadata } from 'next';
import { MyPayslipsTable } from '@/components/payroll/MyPayslipsTable';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { Payslip } from '@/lib/hr-types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.payslips') };
}

export default async function MyPayslipsPage() {
  await requireSection('payslips');
  const { t } = await getI18n();
  const data = await load(() => api<Payslip[]>('/v1/payroll/payslips/me'));
  return (
    <>
      <PageHeader title={t('nav.payslips')} subtitle={t('pay.my.subtitle')} />
      {data.error !== undefined ? (
        <ErrorState message={data.error} />
      ) : data.data.length === 0 ? (
        <EmptyState icon={<span aria-hidden>₹</span>} title={t('pay.my.none')} />
      ) : (
        <MyPayslipsTable rows={data.data} />
      )}
    </>
  );
}
