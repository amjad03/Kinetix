import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { MentoringDesk } from '@/components/quality/MentoringDesk';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { InterventionPlanRow, MentorAssignment, MentorRef, RiskRow } from '@/lib/quality';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.mentoring') };
}

export default async function MentoringPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('mentoring');
  const { tab } = await searchParams;
  const { t } = await getI18n();
  const data = await load(async () => {
    const [risk, mentees, plans, mentors, structure] = await Promise.all([
      api<RiskRow[]>('/v1/mentoring/risk'),
      api<MentorAssignment[]>('/v1/mentoring/assignments'),
      api<InterventionPlanRow[]>('/v1/mentoring/plans'),
      api<MentorRef[]>('/v1/mentoring/mentors'),
      api<Structure>('/v1/admin/structure'),
    ]);
    return { risk, mentees, plans, mentors, sections: structure.sections.map((s) => ({ id: s.id, name: s.displayName })) };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { risk, mentees, plans, mentors, sections } = data.data;
  const attention = risk.filter((r) => r.level === 'medium' || r.level === 'high');
  return (
    <>
      <PageHeader title={t('nav.mentoring')} subtitle={t('mn.subtitle')} />
      <StatGrid min={140}>
        <StatTile label={t('mn.stat.mentees')} value={mentees.length} testId="mn-mentees" />
        <StatTile label={t('mn.stat.atRisk')} value={attention.length} tone={attention.length ? 'warning' : 'default'} caption={t('mn.stat.atRiskCaption', { high: risk.filter((r) => r.level === 'high').length })} testId="mn-at-risk" />
        <StatTile label={t('mn.stat.plans')} value={plans.filter((p) => p.plan.status !== 'closed').length} testId="mn-plans" />
      </StatGrid>
      <MentoringDesk risk={risk} mentees={mentees} plans={plans} mentors={mentors} sections={sections} initialTab={tab ?? 'risk'} />
    </>
  );
}
