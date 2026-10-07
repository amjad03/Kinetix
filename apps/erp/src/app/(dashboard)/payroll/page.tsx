import type { Metadata } from 'next';
import { PayrollDesk, type PayrollTab } from '@/components/payroll/PayrollDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { canApprovePayroll } from '@/lib/access';
import { getI18n } from '@/i18n/server';
import type { PayrollRunSummary, PayrollSettings, SalaryComponent, StaffSummary } from '@/lib/hr-types';
import { schoolToday } from '@/lib/school';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.payroll') };
}

const TABS: PayrollTab[] = ['runs', 'structures', 'components', 'settings'];

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireSection('payroll');
  const { t } = await getI18n();
  const { tab } = await searchParams;
  const data = await load(() =>
    Promise.all([api<PayrollRunSummary[]>('/v1/payroll/runs'), api<SalaryComponent[]>('/v1/payroll/components'), api<PayrollSettings>('/v1/payroll/settings'), api<StaffSummary[]>('/v1/hr/staff')]),
  );
  return (
    <>
      <PageHeader title={t('nav.payroll')} subtitle={t('pay.subtitle')} />
      {data.error !== undefined ? (
        <ErrorState message={data.error} />
      ) : (
        <PayrollDesk
          initialTab={TABS.find((x) => x === tab) ?? 'runs'}
          runs={data.data[0]}
          components={data.data[1]}
          settings={data.data[2]}
          staff={data.data[3]}
          thisMonth={schoolToday().slice(0, 7)}
          canApprove={!!me && canApprovePayroll(me.roles)}
        />
      )}
    </>
  );
}
