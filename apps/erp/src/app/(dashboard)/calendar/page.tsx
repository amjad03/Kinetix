import type { Metadata } from 'next';
import { CalendarView } from '@/components/calendar/CalendarView';
import { TermsSection } from '@/components/calendar/TermsSection';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { canEditCalendar } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import { addMonths, gridRange, monthParam, type CalendarList } from '@/lib/calendar';
import { addDays } from '@/lib/dates';
import { schoolToday } from '@/lib/school';
import type { Term } from '@/lib/terms';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.calendar') };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; view?: string }> }) {
  const me = await requireSection('calendar');
  const { t } = await getI18n();
  const sp = await searchParams;
  const today = schoolToday();
  const month = monthParam(sp.month, today);
  const view = sp.view === 'list' ? 'list' : 'month';
  const canEdit = !!me && canEditCalendar(me.roles);
  // Month: the weeks shown. List: twelve months from the chosen month.
  const range = view === 'month' ? gridRange(month) : { from: `${month}-01`, to: addDays(`${addMonths(month, 12)}-01`, -1) };
  const [cal, structure, terms] = await Promise.all([
    load(() => api<CalendarList>(`/v1/calendar?from=${range.from}&to=${range.to}`)),
    canEdit ? load(() => api<Structure>('/v1/admin/structure')) : Promise.resolve(null),
    load(() => api<Term[]>('/v1/terms')),
  ]);
  if (cal.error !== undefined) {
    return (
      <>
        <PageHeader title={t('nav.calendar')} />
        <ErrorState message={cal.error} />
      </>
    );
  }
  const programs = structure?.data?.programs.map((p) => ({ id: p.id, name: p.name })) ?? [];
  return (
    <>
      <CalendarView month={month} view={view} today={today} events={cal.data.events} canEdit={canEdit} programs={programs} />
      {terms.error !== undefined ? <ErrorState message={terms.error} /> : <TermsSection terms={terms.data} today={today} canEdit={canEdit} programs={programs} />}
    </>
  );
}
