import type { Metadata } from 'next';
import { AttendanceDesk } from '@/components/hr/AttendanceDesk';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { isIsoDate } from '@/lib/dates';
import { getI18n } from '@/i18n/server';
import type { StaffAttendanceRow } from '@/lib/hr-types';
import { schoolToday, TIMEZONE } from '@/lib/school';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hr.tab.attendance') };
}

export default async function StaffAttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireSection('hr');
  const { t } = await getI18n();
  const today = schoolToday();
  const { date: q } = await searchParams;
  const date = q && isIsoDate(q) && q <= today ? q : today;
  const rows = await load(() => api<StaffAttendanceRow[]>(`/v1/hr/attendance?date=${date}`));
  return (
    <>
      <PageHeader title={t('nav.hr')} subtitle={t('hr.att.subtitle')} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      {rows.error !== undefined ? <ErrorState message={rows.error} /> : <AttendanceDesk date={date} today={today} timeZone={TIMEZONE} rows={rows.data} />}
    </>
  );
}
