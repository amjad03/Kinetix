import type { Metadata } from 'next';
import { ClipboardList } from 'lucide-react';
import { AttendanceTabs, DateField, FilterForm, SelectField } from '@/components/attendance-desk/kit';
import { RegisterGrid } from '@/components/attendance-desk/RegisterGrid';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { isId, isMonth, type DeskClass, type Register } from '@/lib/attendance-desk';
import { schoolToday } from '@/lib/school';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('atd.register.title') };
}

/** Attendance → Register: a class's monthly register, all subjects or one, on screen, printed, or as Excel or PDF. */
export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection('school');
  const sp = await searchParams;
  const { t } = await getI18n();
  const month = isMonth(sp.month) ? sp.month : schoolToday().slice(0, 7);
  const res = await load(async () => {
    const classes = await api<DeskClass[]>('/v1/attendance-desk/classes');
    const section = isId(sp.section) && classes.some((c) => c.id === sp.section) ? sp.section : classes[0]?.id;
    if (!section) return { classes, section: null, subjects: [], register: null };
    const subjects = await api<{ id: string; code: string; name: string }[]>(`/v1/attendance-desk/classes/${section}/subjects`);
    const subjectId = isId(sp.subject) && subjects.some((s) => s.id === sp.subject) ? sp.subject : undefined;
    const register = await api<Register>(`/v1/attendance-desk/register?sectionId=${section}&month=${month}${subjectId ? `&subjectId=${subjectId}` : ''}`);
    return { classes, section, subjects, subjectId, register };
  });
  return (
    <>
      <PageHeader title={t('atd.register.title')} subtitle={t('atd.register.subtitle')} />
      <AttendanceTabs value="register" t={t} />
      {res.error !== undefined ? (
        <ErrorState message={res.error} />
      ) : !res.data.section || !res.data.register ? (
        <EmptyState icon={<ClipboardList />} title={t('atd.noClasses')}>
          {t('atd.noClassesBody')}
        </EmptyState>
      ) : (
        <>
          <FilterForm submit={t('atd.show')} testId="register-filters">
            <SelectField label={t('atd.class')} name="section" value={res.data.section} options={res.data.classes.map((c) => ({ value: c.id, label: c.name, group: c.program }))} minWidth={240} />
            <DateField label={t('atd.month')} name="month" value={month} type="month" />
            <SelectField label={t('atd.subject')} name="subject" value={res.data.subjectId} options={res.data.subjects.map((s) => ({ value: s.id, label: `${s.code} ${s.name}` }))} empty={t('atd.allSubjects')} />
          </FilterForm>
          <RegisterGrid data={res.data.register} sectionId={res.data.section} subjectId={res.data.subjectId} />
        </>
      )}
    </>
  );
}
