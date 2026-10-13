import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { HrSettingsForm } from '@/components/hr/HrSettingsForm';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { HrModuleSettings } from '@/lib/hr-flow';
import type { LeaveType, PayrollSettings } from '@/lib/hr-types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hf.set.title') };
}

/** HR and payroll module settings: numbering, leave policy, attendance rules, loans, salary and statutory setup. */
export default async function HrSettingsPage() {
  await requireSection('hr');
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<HrModuleSettings>('/v1/hr/module-settings'), api<LeaveType[]>('/v1/hr/leave-types'), api<PayrollSettings>('/v1/payroll/settings').catch(() => null)]));
  return (
    <>
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      {data.error !== undefined ? (
        <>
          <PageHeader title={t('hf.set.title')} />
          <ErrorState message={data.error} />
        </>
      ) : (
        <HrSettingsForm initial={data.data[0]} leaveTypes={data.data[1]} payroll={data.data[2]} />
      )}
    </>
  );
}
