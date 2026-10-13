import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LoanRecord } from '@/components/hr/Records';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { historyFor } from '@/lib/hr-records';
import type { StaffLoan } from '@/lib/hr-flow';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hf.loan.title') };
}

/** A loan or salary advance: approval, recovery schedule and history. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('payslips');
  const { id } = await params;
  if (![id].every((x) => /^[0-9a-f-]{36}$/i.test(x))) notFound();
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<StaffLoan>(`/v1/hr/loans/${id}`), historyFor('staff_loan', id)]));
  if (data.error !== undefined) {
    return (
      <>
        <PageHeader title={t('hf.loan.title')} />
        <ErrorState message={data.error} />
      </>
    );
  }
  const l = data.data[0];
  const canDecide = !!me && me.id !== l.user.id && l.status === 'pending' && me.roles.some((r) => r === 'principal' || r === 'tenant_admin');
  return <LoanRecord l={l} canDecide={canDecide} activity={data.data[1]} />;
}
