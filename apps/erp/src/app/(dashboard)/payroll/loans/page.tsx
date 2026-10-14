import type { Metadata } from 'next';
import { HrList } from '@/components/hr/HrList';
import { ErrorState, LinkTabs, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hf.loan.title') };
}

/** Loans, salary advances and leave encashment: requests, approvals, early closure and recovery through payroll (staff see their own). */
export default async function LoansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('payslips');
  const { t } = await getI18n();
  const sp = await searchParams;
  const view = sp.view === 'encashments' ? 'encashments' : 'loans';
  const entity = view === 'encashments' ? 'leave-encashments' : 'staff-loans';
  const list = await loadRecords(entity, sp);
  return (
    <>
      <PageHeader title={t('hf.loan.title')} subtitle={t('hf.loan.subtitle')} />
      <LinkTabs
        value={view}
        label={t('hf.loan.title')}
        items={[
          { value: 'loans', href: '/payroll/loans', label: t('rk.entity.staff-loans') },
          { value: 'encashments', href: '/payroll/loans?view=encashments', label: t('rk.entity.leave-encashments') },
        ]}
      />
      {list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity={entity} data={list.data} extraParams={{ view }} />}
    </>
  );
}
