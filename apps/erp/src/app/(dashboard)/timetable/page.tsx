import type { Metadata } from 'next';
import { getI18n } from '@/i18n/server';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { TimetableEditor, type TimetableView } from '@/components/timetable/TimetableEditor';
import { UrlSelect } from '@/components/UrlSelect';
import { api, load, requireSection } from '@/lib/api';
import type { StaffMember, Structure, TimetableSlot } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.timetable') };
}

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ class?: string; teacher?: string }> }) {
  await requireSection('timetable');
  const sp = await searchParams;
  const [structure, staff] = await Promise.all([load(() => api<Structure>('/v1/admin/structure')), load(() => api<StaffMember[]>('/v1/admin/staff'))]);
  const sections = structure.data?.sections ?? [];
  const people = staff.data ?? [];

  const teacher = people.find((p) => p.id === sp.teacher);
  const section = teacher ? undefined : (sections.find((s) => s.id === sp.class) ?? sections[0]);
  const view: TimetableView | null = teacher
    ? { kind: 'teacher', id: teacher.id, name: teacher.fullName }
    : section
      ? { kind: 'class', id: section.id, name: section.displayName }
      : null;
  const slots = view ? await load(() => api<TimetableSlot[]>(`/v1/admin/timetable?${view.kind === 'class' ? 'sectionId' : 'teacherId'}=${view.id}`)) : null;

  const { t } = await getI18n();
  const options = [
    ...sections.map((s) => ({ value: `class=${s.id}`, label: s.displayName, group: t('tt.classes') })),
    ...people.map((p) => ({ value: `teacher=${p.id}`, label: p.fullName, group: t('tt.teachers') })),
  ];

  const error = structure.error ?? staff.error ?? slots?.error;
  return (
    <>
      <PageHeader
        title={t('nav.timetable')}
        subtitle={t('tt.subtitle')}
        actions={view ? <UrlSelect label={t('tt.of')} value={`${view.kind}=${view.id}`} options={options} minWidth={240} testId="timetable-of" /> : undefined}
      />
      {error !== undefined ? (
        <ErrorState message={error} />
      ) : !view ? (
        <ErrorState title={t('tt.noClasses')} message={t('tt.noClassesBody')} />
      ) : (
        <TimetableEditor
          key={`${view.kind}:${view.id}`}
          view={view}
          slots={slots?.data ?? []}
          sections={sections}
          subjects={structure.data!.subjects}
          rooms={structure.data!.rooms}
          staff={people}
        />
      )}
    </>
  );
}
