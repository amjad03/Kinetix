import type { Metadata } from 'next';
import { AuditDesk } from '@/components/ai/AuditDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { AiActionRow, AiActionSummary } from '@/lib/governance';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.aiAudit') };
}

/** The AI action audit: who asked what, what grounded the answer, and what they did with it. */
export default async function AiAuditPage() {
  await requireSection('aiAudit');
  const { t } = await getI18n();
  const [actions, summary] = await Promise.all([load(() => api<AiActionRow[]>('/v1/ai/admin/actions')), load(() => api<AiActionSummary>('/v1/ai/admin/actions/summary'))]);
  const failed = actions.error ?? summary.error;
  return (
    <>
      <PageHeader title={t('nav.aiAudit')} subtitle={t('aa.subtitle')} />
      {failed !== undefined ? <ErrorState message={failed} /> : <AuditDesk actions={actions.data!} summary={summary.data!} />}
    </>
  );
}
