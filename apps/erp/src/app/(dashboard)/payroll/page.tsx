import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { PayrollDesk } from '@/components/payroll/PayrollDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { canApprovePayroll } from '@/lib/access';
import { PAYROLL_TABS, type PayrollTab } from '@/lib/hr';
import { getI18n } from '@/i18n/server';
import type { PayrollRunSummary, PayrollSettings, SalaryComponent, StaffSummary } from '@/lib/hr-types';
import { loadRecords } from '@/lib/records-server';
import { schoolToday } from '@/lib/school';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.payroll') };
}

const LIST_OF: Partial<Record<PayrollTab, 'payroll-runs' | 'salary-components' | 'tds-challans'>> = { runs: 'payroll-runs', components: 'salary-components', challans: 'tds-challans' };

/** Payroll: runs (regular and supplementary), salary structures, components with rate history, TDS challans, returns and settings. */
export default async function PayrollPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('payroll');
  const { t } = await getI18n();
  const sp = await searchParams;
  const tab = PAYROLL_TABS.find((x) => x === sp.tab) ?? 'runs';
  const entity = LIST_OF[tab];
  const [data, list] = await Promise.all([
    load(() =>
      Promise.all([
        tab === 'runs' ? api<PayrollRunSummary[]>('/v1/payroll/runs') : Promise.resolve([] as PayrollRunSummary[]),
        tab === 'structures' ? api<SalaryComponent[]>('/v1/payroll/components') : Promise.resolve([] as SalaryComponent[]),
        tab === 'settings' ? api<PayrollSettings>('/v1/payroll/settings') : Promise.resolve(null),
        tab === 'runs' || tab === 'structures' ? api<StaffSummary[]>('/v1/hr/staff') : Promise.resolve([] as StaffSummary[]),
      ]),
    ),
    entity ? loadRecords(entity, sp) : Promise.resolve(null),
  ]);
  const error = data.error ?? (list && list.error !== undefined ? list.error : undefined);
  return (
    <>
      <PageHeader title={t('nav.payroll')} subtitle={t('pay.subtitle')} actions={<><LinkButton href="/payroll/adjustments" variant="outlined">{t('dx.link.pay')}</LinkButton></>} />
      {error !== undefined || data.error !== undefined ? (
        <ErrorState message={error ?? t('error.generic')} />
      ) : (
        <PayrollDesk
          tab={tab}
          runs={data.data[0]}
          list={list && list.error === undefined ? list.data : undefined}
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
