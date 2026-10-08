import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { SurveyDesk } from '@/components/surveys/SurveyDesk';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { Structure } from '@/lib/types';
import type { SurveyRow } from '@/lib/work';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.surveys') };
}

export default async function SurveysPage() {
  await requireSection('surveys');
  const { t } = await getI18n();
  const surveys = await load(() => api<SurveyRow[]>('/v1/surveys'));
  const structure = await load(() => api<Structure>('/v1/admin/structure'));
  if (surveys.error !== undefined) return <ErrorState message={surveys.error} />;
  const list = surveys.data;
  const sections = (structure.data?.sections ?? []).map((s) => ({ value: s.id, label: s.displayName }));
  return (
    <>
      <PageHeader title={t('nav.surveys')} subtitle={t('wk.sv.subtitle')} />
      <StatGrid min={120}>
        <StatTile label={t('wk.sv.stat.open')} value={list.filter((s) => s.status === 'open').length} testId="sv-open" />
        <StatTile label={t('wk.sv.stat.draft')} value={list.filter((s) => s.status === 'draft').length} />
        <StatTile label={t('wk.sv.stat.responses')} value={list.reduce((n, s) => n + s.responses, 0)} />
      </StatGrid>
      <SurveyDesk surveys={list} sections={sections} />
    </>
  );
}
