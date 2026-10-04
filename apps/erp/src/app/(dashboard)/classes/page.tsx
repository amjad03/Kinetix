import type { Metadata } from 'next';
import { ClassesTable } from '@/components/ClassesTable';
import { DateNav } from '@/components/DateNav';
import { NoClasses } from '@/components/NoClasses';
import { PageHeader } from '@/components/PageHeader';
import BeachAccessOutlined from '@mui/icons-material/BeachAccessOutlined';
import { EmptyState, ErrorState } from '@/components/States';
import { HolidayBanner } from '@/components/HolidayBanner';
import { getI18n } from '@/i18n/server';
import { STATUS_ORDER } from '@/lib/status';
import { api, load, requireSection } from '@/lib/api';
import { dateParam, schoolToday } from '@/lib/school';
import type { ClassesDay, ClassStatus } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.classes') };
}

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ date?: string; status?: string }> }) {
  await requireSection('school');
  const sp = await searchParams;
  const date = dateParam(sp.date);
  const today = schoolToday();
  const day = await load(() => api<ClassesDay>(`/v1/admin/classes?date=${date}`));
  const { t, fmt } = await getI18n();
  const holiday = day.data?.holiday ?? null;
  const status = STATUS_ORDER.includes(sp.status as ClassStatus) ? (sp.status as ClassStatus) : undefined;

  return (
    <>
      <PageHeader
        title={t('nav.classes')}
        subtitle={`${fmt.date(date, 'long')}${date === today ? '' : ` · ${fmt.relativeDay(date, today)}`}`}
        actions={<DateNav date={date} today={today} />}
      />
      {holiday && <HolidayBanner title={holiday.title} date={date} />}
      {day.error !== undefined ? (
        <ErrorState message={day.error} />
      ) : day.data.classes.length === 0 && holiday ? (
        <EmptyState dense icon={<BeachAccessOutlined />} title={t('holiday.noClasses', { title: holiday.title })} testId="no-classes-holiday" />
      ) : day.data.classes.length === 0 ? (
        <NoClasses date={date} today={today} path="/classes" />
      ) : (
        <ClassesTable key={date} classes={day.data.classes} initialStatus={status} />
      )}
    </>
  );
}
