import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PayslipRecord } from '@/components/hr/Records';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { historyFor } from '@/lib/hr-records';
import type { Payslip } from '@/lib/hr-types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.payslips') };
}

/** One payslip: earnings, deductions, employer contributions, the PDF and who opened it. */
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('payslips');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<Payslip>(`/v1/payroll/payslips/${id}`), historyFor('payslip', id)]));
  if (data.error !== undefined) {
    return (
      <>
        <PageHeader title={t('nav.payslips')} />
        <ErrorState message={data.error} />
      </>
    );
  }
  return <PayslipRecord p={data.data[0]} activity={data.data[1]} />;
}
