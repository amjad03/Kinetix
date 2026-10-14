import type { Metadata } from 'next';
import { CurriculumDesk } from '@/components/curriculum/CurriculumDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';
import type { ImportRow, VersionRow } from '@/lib/curriculum';
import { getI18n } from '@/i18n/server';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.curriculum') };
}

const EDITORS = ['principal', 'tenant_admin', 'hod'];

/** Syllabus versions per programme and regulation year, with Board of Studies approval, revisions, diffs and the AI importer. */
export default async function CurriculumPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('curriculum');
  const { t } = await getI18n();
  const canEdit = !!me?.roles.some((r) => EDITORS.includes(r));
  const [list, versions, imports, structure] = await Promise.all([
    loadRecords('curriculum-versions', await searchParams),
    load(() => api<VersionRow[]>('/v1/curriculum/versions')),
    canEdit ? load(() => api<ImportRow[]>('/v1/curriculum/imports')) : Promise.resolve({ data: [] as ImportRow[], error: undefined }),
    load(() => api<Structure>('/v1/admin/structure')),
  ]);
  const failed = list.error ?? versions.error ?? imports.error ?? structure.error;
  return (
    <>
      <PageHeader title={t('nav.curriculum')} subtitle={t('cu.subtitle')} />
      {failed !== undefined ? (
        <ErrorState message={failed} />
      ) : (
        <CurriculumDesk versions={versions.data!} list={list.data!} imports={imports.data!} programs={structure.data!.programs.map((p) => ({ id: p.id, name: p.name }))} canEdit={canEdit} />
      )}
    </>
  );
}
