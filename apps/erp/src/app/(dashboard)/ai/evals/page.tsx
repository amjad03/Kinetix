import type { Metadata } from 'next';
import { EvalDesk } from '@/components/ai/EvalDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { EvalCase, EvalRun } from '@/lib/governance';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.aiEvals') };
}

/** The AI evaluation harness: saved questions with checks, and the history of runs. */
export default async function AiEvalsPage() {
  await requireSection('aiAudit');
  const { t } = await getI18n();
  const [cases, runs] = await Promise.all([load(() => api<EvalCase[]>('/v1/ai/admin/evals/cases')), load(() => api<EvalRun[]>('/v1/ai/admin/evals/runs'))]);
  const failed = cases.error ?? runs.error;
  return (
    <>
      <PageHeader title={t('nav.aiEvals')} subtitle={t('ae.subtitle')} />
      {failed !== undefined ? <ErrorState message={failed} /> : <EvalDesk cases={cases.data!} runs={runs.data!} />}
    </>
  );
}
