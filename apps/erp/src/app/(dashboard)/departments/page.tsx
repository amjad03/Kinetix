import type { Metadata } from 'next';
import { getI18n } from '@/i18n/server';
import { DepartmentRecords } from '@/components/department/DepartmentRecords';
import { DepartmentsManager } from '@/components/department/DepartmentsManager';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';
import type { AdminDepartment, StaffMember, Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.departments') };
}

/**
 * Departments: the list (record kit: add, edit, bulk head, reorder, duplicate, bin, import, export, history, views)
 * and, as a second view, the staff-and-subjects assignment cards.
 */
export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('departments');
  const sp = await searchParams;
  const { t } = await getI18n();
  const view = sp.view === 'assign' ? 'assign' : 'list';
  const tabs = (
    <LinkTabs
      value={view}
      label={t('nav.departments')}
      items={[
        { value: 'list', label: t('rk.depts.list'), href: '/departments' },
        { value: 'assign', label: t('rk.depts.assign'), href: '/departments?view=assign' },
      ]}
    />
  );

  if (view === 'assign') {
    const data = await load(() => Promise.all([api<AdminDepartment[]>('/v1/admin/departments'), api<StaffMember[]>('/v1/admin/staff'), api<Structure>('/v1/admin/structure')]));
    if (data.error !== undefined)
      return (
        <>
          <PageHeader title={t('nav.departments')} />
          <ErrorState message={data.error} />
        </>
      );
    const [departments, staff, structure] = data.data;
    const programs = new Map(structure.programs.map((p) => [p.id, p.name]));
    const subjects = structure.subjects.map((s) => ({ id: s.id, code: s.code, name: s.name, program: programs.get(s.programId) ?? '', term: s.term }));
    return <DepartmentsManager departments={departments} staff={staff} subjects={subjects} tabs={tabs} />;
  }

  const records = await loadRecords('departments', sp);
  return (
    <>
      <PageHeader title={t('nav.departments')} subtitle={t('depts.subtitle')} />
      {tabs}
      {records.error !== undefined ? <ErrorState message={records.error} /> : <DepartmentRecords meta={records.data.meta} page={records.data.page} state={records.data.state} />}
    </>
  );
}
