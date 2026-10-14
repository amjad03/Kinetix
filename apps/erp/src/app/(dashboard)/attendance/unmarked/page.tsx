import type { Metadata } from 'next';
import { AttendanceTabs, DateField, FilterForm, SelectField } from '@/components/attendance-desk/kit';
import { UnmarkedTable } from '@/components/attendance-desk/UnmarkedTable';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { StatGrid, StatTile } from '@/components/StatTile';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { isDay, isId, type DayPeriod } from '@/lib/attendance-desk';
import { schoolToday } from '@/lib/school';
import { CalendarX, UserRoundX } from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('atd.unmarked.title') };
}

const minus = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);

/** Attendance → Unmarked: periods that met without attendance (a teacher's own, a head's department, or all), with reminders. */
export default async function UnmarkedPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireSection('school');
  const sp = await searchParams;
  const { t, fmt } = await getI18n();
  const today = schoolToday();
  const to = isDay(sp.to) ? sp.to : today;
  const from = isDay(sp.from) ? sp.from : minus(to, 6);
  const roles = me?.roles ?? [];
  const lead = roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'hod');
  const res = await load(async () => {
    const q = new URLSearchParams({ from, to, ...(isId(sp.department) ? { departmentId: sp.department } : {}) });
    const [list, depts] = await Promise.all([api<{ rows: DayPeriod[]; byTeacher: { teacherId: string; teacher: string; count: number }[] }>(`/v1/attendance-desk/unmarked?${q.toString()}`), lead ? api<{ id: string; name: string }[]>('/v1/departments') : Promise.resolve([])]);
    return { list, depts };
  });
  return (
    <>
      <PageHeader title={t('atd.unmarked.title')} subtitle={t('atd.unmarked.subtitle')} />
      <AttendanceTabs value="unmarked" t={t} />
      <FilterForm submit={t('atd.show')} testId="unmarked-filters">
        <DateField label={t('atd.from')} name="from" value={from} />
        <DateField label={t('atd.to')} name="to" value={to} />
        {lead && res.data && res.data.depts.length > 0 && <SelectField label={t('atd.department')} name="department" value={sp.department} options={res.data.depts.map((d) => ({ value: d.id, label: d.name }))} empty={t('atd.all')} />}
      </FilterForm>
      {res.error !== undefined ? (
        <ErrorState message={res.error} />
      ) : (
        <>
          <StatGrid min={180}>
            <StatTile icon={<CalendarX />} label={t('atd.unmarked.periods')} value={fmt.number(res.data.list.rows.length)} caption={t('atd.unmarked.range', { from: fmt.date(from, 'short'), to: fmt.date(to, 'short') })} />
            <StatTile icon={<UserRoundX />} label={t('atd.unmarked.teachers')} value={fmt.number(res.data.list.byTeacher.length)} caption={res.data.list.byTeacher[0] ? t('atd.unmarked.most', { name: res.data.list.byTeacher[0].teacher, n: fmt.number(res.data.list.byTeacher[0].count) }) : t('atd.unmarked.allMarked')} />
          </StatGrid>
          <div className="mt-6">
            <UnmarkedTable rows={res.data.list.rows} canRemind={lead} />
          </div>
        </>
      )}
    </>
  );
}
