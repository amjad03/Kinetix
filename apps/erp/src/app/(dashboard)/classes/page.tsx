import type { Metadata } from 'next';
import { ClassesTable } from '@/components/ClassesTable';
import { DateNav } from '@/components/DateNav';
import { NoClasses } from '@/components/NoClasses';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { STATUS_ORDER } from '@/lib/status';
import { api, load, requireSection } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { dateParam, relativeDay, schoolToday } from '@/lib/school';
import type { ClassesDay, ClassStatus } from '@/lib/types';

export const metadata: Metadata = { title: 'Classes' };

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ date?: string; status?: string }> }) {
  await requireSection('school');
  const sp = await searchParams;
  const date = dateParam(sp.date);
  const today = schoolToday();
  const day = await load(() => api<ClassesDay>(`/v1/admin/classes?date=${date}`));
  const status = STATUS_ORDER.includes(sp.status as ClassStatus) ? (sp.status as ClassStatus) : undefined;

  return (
    <>
      <PageHeader
        title="Classes"
        subtitle={`${formatDate(date, 'long')}${date === today ? '' : ` · ${relativeDay(date, today)}`}`}
        actions={<DateNav date={date} today={today} />}
      />
      {day.error !== undefined ? (
        <ErrorState message={day.error} />
      ) : day.data.classes.length === 0 ? (
        <NoClasses date={date} today={today} path="/classes" />
      ) : (
        <ClassesTable key={date} classes={day.data.classes} initialStatus={status} />
      )}
    </>
  );
}
