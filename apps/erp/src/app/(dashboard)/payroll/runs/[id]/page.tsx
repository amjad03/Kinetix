import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RunRecord } from '@/components/hr/Records';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { canApprovePayroll } from '@/lib/access';
import { getI18n } from '@/i18n/server';
import { historyFor } from '@/lib/hr-records';
import type { PayrollRunDetail } from '@/lib/hr-types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.payroll') };
}

/** A payroll run: prepare → verify → approve → lock → bank file → publish payslips. */
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('payroll');
  const { id } = await params;
  const { t } = await getI18n();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await load(() => Promise.all([api<PayrollRunDetail>(`/v1/payroll/runs/${id}`), historyFor('payroll_run', id)]));
  if (data.error !== undefined) {
    return (
      <>
        <PageHeader title={t('nav.payroll')} />
        <ErrorState message={data.error} />
      </>
    );
  }
  return <RunRecord run={data.data[0]} canApprove={!!me && canApprovePayroll(me.roles)} activity={data.data[1]} />;
}
