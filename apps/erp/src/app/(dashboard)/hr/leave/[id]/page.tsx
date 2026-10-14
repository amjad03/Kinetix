import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LeaveRecord } from '@/components/hr/Records';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { HrModuleSettings } from '@/lib/hr-flow';
import { historyFor } from '@/lib/hr-records';
import type { LeaveRequest } from '@/lib/hr-types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hf.leave.title') };
}

/** One leave application with its approval route (HoD, then principal when two levels are on). */
export default async function LeaveRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('hr');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<LeaveRequest>(`/v1/hr/leave/requests/${id}`), api<HrModuleSettings>('/v1/hr/module-settings').catch(() => null), historyFor('leave_request', id)]));
  if (data.error !== undefined) {
    return (
      <>
        <PageHeader title={t('hf.leave.title')} />
        <ErrorState message={data.error} />
      </>
    );
  }
  const [r, settings, activity] = data.data;
  const hr = !!me && me.roles.some((x) => x === 'principal' || x === 'tenant_admin' || x === 'hr_manager');
  const canDecide = !!me && me.id !== r.user.id && (r.status === 'pending' || (r.status === 'recommended' && hr));
  return <LeaveRecord r={r} twoLevel={settings?.leaveLevels === 2} canDecide={canDecide} activity={activity} canManage={hr || (!!me && me.roles.includes('hod'))} canRevoke={hr && me?.id !== r.user.id} />;
}
