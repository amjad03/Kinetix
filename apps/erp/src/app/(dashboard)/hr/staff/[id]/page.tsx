import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StaffRecord } from '@/components/hr/Records';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { ServiceBookEntry, StaffLoan } from '@/lib/hr-flow';
import type { TrainingRecord } from '@/lib/hr-lifecycle';
import { historyFor } from '@/lib/hr-records';
import type { LeaveRequest, StaffOverview, StaffProfile } from '@/lib/hr-types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hf.staff.title') };
}

/** An employee record: key facts, the service book, leave, loans, training and the audit history. */
export default async function StaffRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('hr');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { t } = await getI18n();
  const data = await load(() =>
    Promise.all([
      api<StaffProfile>(`/v1/hr/staff/${id}`),
      api<ServiceBookEntry[]>(`/v1/hr/staff/${id}/service-book`),
      api<LeaveRequest[]>(`/v1/hr/leave/requests?userId=${id}`),
      api<StaffLoan[]>('/v1/hr/loans').catch(() => [] as StaffLoan[]),
      api<TrainingRecord[]>(`/v1/hr/training-records?userId=${id}`).catch(() => [] as TrainingRecord[]),
      historyFor('user', id),
      api<StaffOverview>(`/v1/profiles/staff/${id}`).catch(() => null),
    ]),
  );
  if (data.error !== undefined) {
    return (
      <>
        <PageHeader title={t('hf.staff.title')} />
        <ErrorState message={data.error} />
      </>
    );
  }
  const [s, book, leave, loans, training, activity, overview] = data.data;
  const canAdd = !!me && me.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'hr_manager');
  return <StaffRecord s={s} book={book} leave={leave} loans={loans.filter((l) => l.user.id === id)} training={training} activity={activity} canAdd={canAdd} overview={overview} />;
}
