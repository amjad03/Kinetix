import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ProjectsDesk } from '@/components/projects/ProjectsDesk';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { ImpactFramework, ProjectRow, ShowcaseRow } from '@/lib/pathways-a';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.projects') };
}

/** Projects with their workspaces, the showcase, and the institution's impact frameworks. */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('projects');
  const { tab } = await searchParams;
  const { t } = await getI18n();
  const [projects, showcase, frameworks] = await Promise.all([
    load(() => api<ProjectRow[]>('/v1/projects/mine')),
    load(() => api<ShowcaseRow[]>('/v1/projects/showcase')),
    load(() => api<ImpactFramework[]>('/v1/impact/frameworks')),
  ]);
  const failed = projects.error ?? showcase.error ?? frameworks.error;
  if (failed !== undefined) return <ErrorState message={failed} />;
  return (
    <>
      <PageHeader title={t('nav.projects')} subtitle={t('prj.subtitle')} />
      <ProjectsDesk projects={projects.data!} showcase={showcase.data!} frameworks={frameworks.data!} initialTab={tab ?? 'projects'} />
    </>
  );
}
