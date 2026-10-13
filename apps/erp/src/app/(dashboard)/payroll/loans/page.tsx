import type { Metadata } from 'next';
import { LoansDesk } from '@/components/hr/HrFlow';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { LeaveEncashment, StaffLoan } from '@/lib/hr-flow';
import type { LeaveType, StaffSummary } from '@/lib/hr-types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hf.loan.title') };
}

/** Loans, salary advances and leave encashment: requests, approvals and recovery through payroll. */
export default async function LoansPage() {
  const me = await requireSection('payslips');
  const { t } = await getI18n();
  const payroll = !!me && me.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'hr_manager' || r === 'accountant');
  const data = await load(() => Promise.all([api<StaffLoan[]>('/v1/hr/loans'), api<LeaveEncashment[]>('/v1/hr/leave/encashments'), api<LeaveType[]>('/v1/hr/leave-types'), payroll ? api<StaffSummary[]>('/v1/hr/staff') : Promise.resolve([] as StaffSummary[])]));
  return (
    <>
      <PageHeader title={t('hf.loan.title')} subtitle={t('hf.loan.subtitle')} />
      {data.error !== undefined || !me ? (
        <ErrorState message={data.error ?? t('error.generic')} />
      ) : (
        <LoansDesk loans={data.data[0]} encashments={data.data[1]} leaveTypes={data.data[2].filter((x) => x.encashable && x.active).map((x) => ({ id: x.id, name: x.name }))} staff={data.data[3].filter((s) => s.employeeCode).map((s) => ({ userId: s.userId, fullName: s.fullName }))} canRaiseForOthers={payroll} meId={me.id} />
      )}
    </>
  );
}
