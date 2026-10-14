import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { HrList } from '@/components/hr/HrList';
import { TransfersDesk } from '@/components/hr/TransfersDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { StaffSummary } from '@/lib/hr-types';
import { loadRecords } from '@/lib/records-server';
import type { Transfer, TransferOptions } from '@/lib/staff-changes';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('as.tab.transfers') };
}

/** Transfers and promotions on a date, and the service book entries (orders, increments, awards, penalties) of every staff member. */
export default async function TransfersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('hr');
  const { t } = await getI18n();
  const sp = await searchParams;
  const view = sp.view === 'book' ? 'book' : 'transfers';
  const head = (
    <>
      <PageHeader title={t('as.tab.transfers')} subtitle={t('as.tr.subtitle')} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      <LinkTabs
        value={view}
        label={t('as.tab.transfers')}
        items={[
          { value: 'transfers', href: '/hr/transfers', label: t('hk.tr.view.transfers') },
          { value: 'book', href: '/hr/transfers?view=book', label: t('rk.entity.service-book') },
        ]}
      />
    </>
  );
  if (view === 'book') {
    const list = await loadRecords('service-book', sp);
    return (
      <>
        {head}
        {list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity="service-book" data={list.data} extraParams={{ view }} />}
      </>
    );
  }
  const [data, list] = await Promise.all([
    load(async () => {
      const [transfers, options, staff] = await Promise.all([api<Transfer[]>('/v1/hr/transfers'), api<TransferOptions>('/v1/hr/transfers/options'), api<StaffSummary[]>('/v1/hr/staff')]);
      return { transfers, options, staff: staff.map((s) => ({ userId: s.userId, fullName: s.fullName })) };
    }),
    loadRecords('staff-transfers', sp),
  ]);
  return (
    <>
      {head}
      {data.error !== undefined ? <ErrorState message={data.error} /> : <TransfersDesk transfers={data.data.transfers} options={data.data.options} staff={data.data.staff} formOnly />}
      <div className="mt-6">{list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity="staff-transfers" data={list.data} />}</div>
    </>
  );
}
