import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ErrorState, PageHeader } from '@/components/ui';
import { RunList } from '@/components/workflows/WorkflowList';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { RunRow } from '@/lib/workflow-builder';
import { ADMIN, BuilderTabs } from '../builder/tabs';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('wb.tab.runs') };
}

/** Every run of every workflow, newest first. */
export default async function WorkflowRunsPage() {
  const me = await requireSection('workflows');
  if (!(me?.roles ?? []).some((r) => ADMIN.includes(r))) redirect('/workflows');
  const { t } = await getI18n();
  const res = await load(() => api<RunRow[]>('/v1/workflows/builder/runs'));
  if (res.error !== undefined) return <ErrorState message={res.error} />;
  return (
    <>
      <PageHeader title={t('wb.title')} subtitle={t('wb.runs.subtitle')} />
      <BuilderTabs value="runs" />
      <RunList rows={res.data} />
    </>
  );
}
