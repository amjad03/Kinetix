import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { TimetableEditor, type TimetableView } from '@/components/timetable/TimetableEditor';
import { UrlSelect } from '@/components/UrlSelect';
import { api, load, requireSection } from '@/lib/api';
import type { StaffMember, Structure, TimetableSlot } from '@/lib/types';

export const metadata: Metadata = { title: 'Timetable' };

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

  const options = [
    ...sections.map((s) => ({ value: `class=${s.id}`, label: s.displayName, group: 'Classes' })),
    ...people.map((p) => ({ value: `teacher=${p.id}`, label: p.fullName, group: 'Teachers' })),
  ];

  const error = structure.error ?? staff.error ?? slots?.error;
  return (
    <>
      <PageHeader
        title="Timetable"
        subtitle="The week for a class or a teacher. Add, move and remove periods; clashes are caught before saving."
        actions={view ? <UrlSelect label="Class or teacher" value={`${view.kind}=${view.id}`} options={options} minWidth={240} testId="timetable-of" /> : undefined}
      />
      {error !== undefined ? (
        <ErrorState message={error} />
      ) : !view ? (
        <ErrorState title="No classes yet" message="Add programs and classes to the school structure first." />
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
