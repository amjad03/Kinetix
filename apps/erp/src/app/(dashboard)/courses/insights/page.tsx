import type { Metadata } from 'next';
import { EvidenceTab, OverviewTab, PathsTab, SettingsTab } from '@/components/lms/LmsInsights';
import { Tabbed } from '@/components/ops/kit';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, getMe, load, requireSection } from '@/lib/api';
import type { LmsCourseRow } from '@/lib/lms';
import type { Evidence, LearningPath, LmsOverview, LmsSettings } from '@/lib/lms-pass';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('lp.insights') };
}

/** The institution's LMS: overview, NAAC 2.3.2 evidence, learning paths and the LMS settings. */
export default async function LmsInsightsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('courses');
  const { tab } = await searchParams;
  const { t } = await getI18n();
  const data = await load(async () => {
    const [overview, evidence, paths, settings, courses, me] = await Promise.all([
      api<LmsOverview>('/v1/lms/overview'),
      api<Evidence>('/v1/lms/reports/evidence'),
      api<LearningPath[]>('/v1/lms/paths'),
      api<{ settings: LmsSettings; canEdit: boolean }>('/v1/lms/settings'),
      api<LmsCourseRow[]>('/v1/lms/courses'),
      getMe(),
    ]);
    return { overview, evidence, paths, settings, courses, me };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const d = data.data;
  const pathAdmin = (d.me.roles as string[]).some((r) => ['principal', 'tenant_admin', 'hod'].includes(r));
  return (
    <>
      <PageHeader title={t('lp.insights')} subtitle={t('lp.insightsSub')} />
      <Tabbed
        initial={tab ?? 'overview'}
        label={t('lp.insights')}
        tabs={[
          { id: 'overview', label: t('lp.tab.overview'), node: <OverviewTab o={d.overview} /> },
          { id: 'evidence', label: t('lp.tab.evidence'), node: <EvidenceTab e={d.evidence} /> },
          { id: 'paths', label: t('lp.tab.paths'), node: <PathsTab paths={d.paths} courses={d.courses.map((c) => ({ id: c.id, title: c.title, section: c.section }))} canEdit={pathAdmin} /> },
          { id: 'settings', label: t('lp.tab.settings'), node: <SettingsTab s={d.settings.settings} canEdit={d.settings.canEdit} /> },
        ]}
      />
    </>
  );
}
