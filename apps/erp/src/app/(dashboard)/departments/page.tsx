import type { Metadata } from 'next';
import { getI18n } from '@/i18n/server';
import { DepartmentsManager } from '@/components/department/DepartmentsManager';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { AdminDepartment, StaffMember, Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.departments') };
}

export default async function DepartmentsPage() {
  await requireSection('departments');
  const data = await load(() =>
    Promise.all([api<AdminDepartment[]>('/v1/admin/departments'), api<StaffMember[]>('/v1/admin/staff'), api<Structure>('/v1/admin/structure')]),
  );
  if (data.error !== undefined)
    return (
      <>
        <PageHeader title={(await getI18n()).t('nav.departments')} />
        <ErrorState message={data.error} />
      </>
    );
  const [departments, staff, structure] = data.data;
  const programs = new Map(structure.programs.map((p) => [p.id, p.name]));
  const subjects = structure.subjects.map((s) => ({ id: s.id, code: s.code, name: s.name, program: programs.get(s.programId) ?? '', term: s.term }));
  return <DepartmentsManager departments={departments} staff={staff} subjects={subjects} />;
}
