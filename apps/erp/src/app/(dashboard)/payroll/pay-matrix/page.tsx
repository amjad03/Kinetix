import type { Metadata } from 'next';
import { HrList } from '@/components/hr/HrList';
import { PayMatrixDesk } from '@/components/payroll/PayPass';
import { ErrorState, LinkTabs, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { canApprovePayroll } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import type { MatrixLevel, MatrixStaff } from '@/lib/hr-pass';
import { loadRecords } from '@/lib/records-server';
import { schoolToday } from '@/lib/school';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hp.mx.title') };
}

/** The 7th CPC pay matrix (UGC/AICTE academic levels): staff on it, placement, promotion, the annual increment and the levels. */
export default async function PayMatrixPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('payroll');
  const { t } = await getI18n();
  const sp = await searchParams;
  const view = sp.view === 'levels' ? 'levels' : 'staff';
  const [data, list] = await Promise.all([
    load(() => Promise.all([api<MatrixLevel[]>('/v1/payroll/pay-matrix'), api<MatrixStaff[]>('/v1/payroll/pay-matrix/staff'), api<{ id: string; fullName: string; employeeCode: string }[]>('/v1/hr/payroll/staff-options')])),
    view === 'levels' ? loadRecords('pay-matrix-levels', sp) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader title={t('hp.mx.title')} subtitle={t('hp.mx.subtitle')} />
      <LinkTabs
        value={view}
        label={t('hp.mx.title')}
        items={[
          { value: 'staff', href: '/payroll/pay-matrix', label: t('hp.mx.staff') },
          { value: 'levels', href: '/payroll/pay-matrix?view=levels', label: t('rk.entity.pay-matrix-levels') },
        ]}
      />
      {data.error !== undefined ? (
        <ErrorState message={data.error} />
      ) : view === 'levels' && list ? (
        list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity="pay-matrix-levels" data={list.data} extraParams={{ view }} />
      ) : (
        <PayMatrixDesk levels={data.data[0]} staff={data.data[1]} staffOptions={data.data[2]} canApprove={!!me && canApprovePayroll(me.roles)} today={schoolToday()} />
      )}
    </>
  );
}
