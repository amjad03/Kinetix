import type { Metadata } from 'next';
import { AttendanceDesk } from '@/components/hr/AttendanceDesk';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { HrList } from '@/components/hr/HrList';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { isIsoDate } from '@/lib/dates';
import { getI18n } from '@/i18n/server';
import type { StaffAttendanceRow } from '@/lib/hr-types';
import { loadRecords } from '@/lib/records-server';
import { schoolToday, TIMEZONE } from '@/lib/school';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hr.tab.attendance') };
}

/** Staff attendance: the day's register (app, biometric and manual marks with late and early minutes) and correction requests. */
export default async function StaffAttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('hr');
  const { t } = await getI18n();
  const today = schoolToday();
  const sp = await searchParams;
  const view = sp.view === 'corrections' ? 'corrections' : 'register';
  const head = (
    <>
      <PageHeader title={t('nav.hr')} subtitle={t('hr.att.subtitle')} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      <LinkTabs
        value={view}
        label={t('hr.tab.attendance')}
        items={[
          { value: 'register', href: '/hr/attendance', label: t('hk.att.view.register') },
          { value: 'corrections', href: '/hr/attendance?view=corrections', label: t('hk.att.view.corrections') },
        ]}
      />
    </>
  );
  if (view === 'corrections') {
    const list = await loadRecords('attendance-regularisations', sp);
    return (
      <>
        {head}
        {list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity="attendance-regularisations" data={list.data} extraParams={{ view }} />}
      </>
    );
  }
  const q = typeof sp.date === 'string' ? sp.date : undefined;
  const date = q && isIsoDate(q) && q <= today ? q : today;
  const rows = await load(() => api<StaffAttendanceRow[]>(`/v1/hr/attendance?date=${date}`));
  return (
    <>
      {head}
      {rows.error !== undefined ? <ErrorState message={rows.error} /> : <AttendanceDesk date={date} today={today} timeZone={TIMEZONE} rows={rows.data} />}
    </>
  );
}
