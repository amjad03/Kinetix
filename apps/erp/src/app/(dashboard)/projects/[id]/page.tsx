import Button from '@mui/material/Button';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { ProjectWorkspace } from '@/components/projects/ProjectWorkspace';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Workspace } from '@/lib/pathways-a';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.projects') };
}

/** One project's workspace: team, milestones, files, discussion, reviews, viva, showcase settings and join requests. */
export default async function ProjectWorkspacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  await requireSection('projects');
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const { t } = await getI18n();
  const ws = await load(() => api<Workspace>(`/v1/projects/${encodeURIComponent(id)}/workspace`));
  if (ws.error !== undefined) return <ErrorState message={ws.error} />;
  const w = ws.data;
  return (
    <>
      <PageHeader
        title={`${w.project.code}: ${w.project.title}`}
        subtitle={t('prj.ws.subtitle', { pi: w.project.pi })}
        actions={<Button component={Link} href="/projects" variant="outlined">{t('prj.back')}</Button>}
      />
      <ProjectWorkspace ws={w} initialTab={tab ?? 'overview'} />
    </>
  );
}
