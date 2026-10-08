import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { WorkflowDesk } from '@/components/workflows/WorkflowDesk';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { DefinitionRow, RequestRow } from '@/lib/workflows';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.workflows') };
}

const ADMIN = ['principal', 'tenant_admin'];

export default async function WorkflowsPage() {
  const me = await requireSection('workflows');
  const { t } = await getI18n();
  const isAdmin = (me?.roles ?? []).some((r) => ADMIN.includes(r));
  const inbox = await load(() => api<RequestRow[]>('/v1/workflows/requests/inbox'));
  const mine = await load(() => api<RequestRow[]>('/v1/workflows/requests/mine'));
  const defs = await load(() => api<DefinitionRow[]>('/v1/workflows/definitions'));
  const all = isAdmin ? await load(() => api<RequestRow[]>('/v1/workflows/requests')) : null;
  const failed = inbox.error ?? mine.error ?? defs.error ?? all?.error;
  if (failed !== undefined) return <ErrorState message={failed} />;
  return (
    <>
      <PageHeader title={t('nav.workflows')} subtitle={t('wf.subtitle')} />
      <StatGrid min={140}>
        <StatTile label={t('wf.stat.inbox')} value={inbox.data!.length} tone={inbox.data!.length ? 'warning' : 'default'} testId="wf-inbox-count" />
        <StatTile label={t('wf.stat.mine')} value={mine.data!.filter((r) => r.status === 'pending' || r.status === 'returned').length} testId="wf-open-count" />
        <StatTile label={t('wf.stat.defs')} value={defs.data!.filter((d) => d.active).length} />
      </StatGrid>
      <WorkflowDesk inbox={inbox.data!} mine={mine.data!} all={all?.data ?? null} definitions={defs.data!} isAdmin={isAdmin} />
    </>
  );
}
