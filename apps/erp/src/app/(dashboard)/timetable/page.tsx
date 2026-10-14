import type { Metadata } from 'next';
import { getI18n } from '@/i18n/server';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { TimetableEditor, type TimetableView } from '@/components/timetable/TimetableEditor';
import { SubstitutionsPanel } from '@/components/timetable/SubstitutionsPanel';
import { TimetablePrint } from '@/components/timetable/TimetablePrint';
import { schoolToday } from '@/lib/school';
import { UrlSelect } from '@/components/UrlSelect';
import { api, load, requireSection } from '@/lib/api';
import type { StaffMember, Structure, TimetableSlot } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.timetable') };
}

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ class?: string; teacher?: string; room?: string }> }) {
  await requireSection('timetable');
  const sp = await searchParams;
  const [structure, staff] = await Promise.all([load(() => api<Structure>('/v1/admin/structure')), load(() => api<StaffMember[]>('/v1/admin/staff'))]);
  const sections = structure.data?.sections ?? [];
  const people = staff.data ?? [];

  const rooms = structure.data?.rooms ?? [];
  const teacher = people.find((p) => p.id === sp.teacher);
  const room = teacher ? undefined : rooms.find((r) => r.id === sp.room);
  const section = teacher || room ? undefined : (sections.find((s) => s.id === sp.class) ?? sections[0]);
  const view: TimetableView | null = teacher
    ? { kind: 'teacher', id: teacher.id, name: teacher.fullName }
    : room
      ? { kind: 'room', id: room.id, name: room.name }
      : section
        ? { kind: 'class', id: section.id, name: section.displayName }
        : null;
  const param = { class: 'sectionId', teacher: 'teacherId', room: 'roomId' } as const;
  const slots = view ? await load(() => api<TimetableSlot[]>(`/v1/admin/timetable?${param[view.kind]}=${view.id}`)) : null;

  const { t } = await getI18n();
  const options = [
    ...sections.map((s) => ({ value: `class=${s.id}`, label: s.displayName, group: t('tt.classes') })),
    ...people.map((p) => ({ value: `teacher=${p.id}`, label: p.fullName, group: t('tt.teachers') })),
    ...rooms.map((r) => ({ value: `room=${r.id}`, label: r.name, group: t('tt.rooms') })),
  ];
  const by = view?.kind === 'teacher' ? 'teacher' : view?.kind === 'room' ? 'room' : 'class';

  const error = structure.error ?? staff.error ?? slots?.error;
  return (
    <>
      <PageHeader
        title={t('nav.timetable')}
        subtitle={t('tt.subtitle')}
        actions={
          view ? (
            <div className="flex flex-wrap items-end gap-3">
              <UrlSelect label={t('tt.of')} value={`${view.kind}=${view.id}`} options={options} minWidth={240} testId="timetable-of" />
              <TimetablePrint pdf={`/api/download?kind=acad-report&report=timetable&format=pdf&by=${by}&id=${view.id}`} />
            </div>
          ) : undefined
        }
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
      <SubstitutionsPanel today={schoolToday()} />
    </>
  );
}
