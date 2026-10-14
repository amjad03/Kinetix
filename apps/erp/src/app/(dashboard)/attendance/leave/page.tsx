import type { Metadata } from 'next';
import { AttendanceTabs } from '@/components/attendance-desk/kit';
import { LeaveRecords } from '@/components/attendance-desk/LeaveRecords';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { DeskClass } from '@/lib/attendance-desk';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('atd.leave.title') };
}

/** Attendance → Leave and on duty: requests from families and staff, decided one by one or in bulk; on duty for groups. */
export default async function LeavePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('school');
  const sp = await searchParams;
  const { t } = await getI18n();
  const [records, classes] = await Promise.all([loadRecords('attendance-leaves', sp), load(() => api<DeskClass[]>('/v1/attendance-desk/classes'))]);
  return (
    <>
      <PageHeader title={t('atd.leave.title')} subtitle={t('atd.leave.subtitle')} />
      <AttendanceTabs value="leave" t={t} />
      {records.error !== undefined ? <ErrorState message={records.error} /> : <LeaveRecords meta={records.data.meta} page={records.data.page} state={records.data.state} classes={classes.data ?? []} />}
    </>
  );
}
