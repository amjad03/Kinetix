import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { TransfersDesk } from '@/components/hr/TransfersDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { StaffSummary } from '@/lib/hr-types';
import type { Transfer, TransferOptions } from '@/lib/staff-changes';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('as.tab.transfers') };
}

export default async function TransfersPage() {
  await requireSection('hr');
  const { t } = await getI18n();
  const data = await load(async () => {
    const [transfers, options, staff] = await Promise.all([api<Transfer[]>('/v1/hr/transfers'), api<TransferOptions>('/v1/hr/transfers/options'), api<StaffSummary[]>('/v1/hr/staff')]);
    return { transfers, options, staff: staff.map((s) => ({ userId: s.userId, fullName: s.fullName })) };
  });
  return (
    <>
      <PageHeader title={t('as.tab.transfers')} subtitle={t('as.tr.subtitle')} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <TransfersDesk transfers={data.data.transfers} options={data.data.options} staff={data.data.staff} />}
    </>
  );
}
