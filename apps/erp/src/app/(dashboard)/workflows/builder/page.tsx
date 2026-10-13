import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ErrorState, PageHeader, StatGrid, StatTile } from '@/components/ui';
import { NewWorkflowButton, WorkflowList } from '@/components/workflows/WorkflowList';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { WorkflowListRow } from '@/lib/workflow-builder';
import { ADMIN, BuilderTabs } from './tabs';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('wb.title') };
}

/** Workflow builder home: every workflow with its module, trigger, status, version and runs. */
export default async function WorkflowBuilderPage() {
  const me = await requireSection('workflows');
  if (!(me?.roles ?? []).some((r) => ADMIN.includes(r))) redirect('/workflows');
  const { t } = await getI18n();
  const res = await load(() => api<WorkflowListRow[]>('/v1/workflows/builder'));
  if (res.error !== undefined) return <ErrorState message={res.error} />;
  const rows = res.data;
  return (
    <>
      <PageHeader title={t('wb.title')} subtitle={t('wb.subtitle')} actions={<NewWorkflowButton />} />
      <BuilderTabs value="workflows" />
      <StatGrid min={150}>
        <StatTile label={t('wb.stat.total')} value={rows.length} />
        <StatTile label={t('wb.stat.active')} value={rows.filter((r) => r.status === 'active').length} />
        <StatTile label={t('wb.stat.drafts')} value={rows.filter((r) => r.status === 'draft' || r.hasDraft).length} />
        <StatTile label={t('wb.stat.open')} value={rows.reduce((s, r) => s + r.openRuns, 0)} />
      </StatGrid>
      <div className="mt-5">
        <WorkflowList rows={rows} />
      </div>
    </>
  );
}
