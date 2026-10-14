import type { Metadata } from 'next';
import { UserSearch } from 'lucide-react';
import { AttendanceTabs, DateField, FilterForm, SelectField } from '@/components/attendance-desk/kit';
import { StudentAttendanceView } from '@/components/attendance-desk/StudentAttendanceView';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { isDay, isId, type DeskClass, type StudentAttendance } from '@/lib/attendance-desk';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('atd.student.title') };
}

/** Attendance → Student: one student's attendance by subject and day, over the term or chosen dates. */
export default async function StudentAttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection('school');
  const sp = await searchParams;
  const { t } = await getI18n();
  const res = await load(async () => {
    const classes = await api<DeskClass[]>('/v1/attendance-desk/classes');
    const section = isId(sp.section) && classes.some((c) => c.id === sp.section) ? sp.section : classes[0]?.id;
    const roster = section ? (await api<{ students: { id: string; rollNo: string; fullName: string }[] }>(`/v1/academic-planning/batches?sectionId=${section}`)).students : [];
    const student = isId(sp.student) && roster.some((s) => s.id === sp.student) ? sp.student : undefined;
    const q = new URLSearchParams({ ...(isDay(sp.from) ? { from: sp.from } : {}), ...(isDay(sp.to) ? { to: sp.to } : {}) });
    const view = student ? await api<StudentAttendance>(`/v1/attendance-desk/students/${student}?${q.toString()}`) : null;
    return { classes, section, roster, student, view };
  });
  return (
    <>
      <PageHeader title={t('atd.student.title')} subtitle={t('atd.student.subtitle')} />
      <AttendanceTabs value="student" t={t} />
      {res.error !== undefined ? (
        <ErrorState message={res.error} />
      ) : (
        <>
          <FilterForm submit={t('atd.show')}>
            <SelectField label={t('atd.class')} name="section" value={res.data.section} options={res.data.classes.map((c) => ({ value: c.id, label: c.name, group: c.program }))} minWidth={220} />
            <SelectField label={t('atd.student')} name="student" value={res.data.student} options={res.data.roster.map((s) => ({ value: s.id, label: `${s.rollNo} ${s.fullName}` }))} empty={t('atd.chooseStudent')} minWidth={240} />
            <DateField label={t('atd.from')} name="from" value={sp.from} />
            <DateField label={t('atd.to')} name="to" value={sp.to} />
          </FilterForm>
          {res.data.view ? (
            <StudentAttendanceView data={res.data.view} />
          ) : (
            <EmptyState icon={<UserSearch />} title={t('atd.student.pick')}>
              {t('atd.student.pickBody')}
            </EmptyState>
          )}
        </>
      )}
    </>
  );
}
