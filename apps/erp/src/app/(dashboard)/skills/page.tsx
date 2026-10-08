import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { SkillsDesk } from '@/components/skills/SkillsDesk';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { SdgDashboard, Skill } from '@/lib/skills';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.skills') };
}

export default async function SkillsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('skills');
  const { tab } = await searchParams;
  const [skills, sdg] = await Promise.all([load(() => api<Skill[]>('/v1/skills')), load(() => api<SdgDashboard>('/v1/sdg/dashboard'))]);
  const { t } = await getI18n();
  const failed = [skills, sdg].find((x) => x.error !== undefined)?.error;
  if (failed !== undefined) return <ErrorState message={failed} />;
  const s = skills.data!;
  const d = sdg.data!;
  return (
    <>
      <PageHeader title={t('nav.skills')} subtitle={t('sk.subtitle')} />
      <StatGrid min={120}>
        <StatTile label={t('sk.stat.skills')} value={s.length} caption={t('sk.stat.sources', { n: s.reduce((n, x) => n + x.sources, 0) })} testId="sk-skills-count" />
        <StatTile label={t('sk.stat.goals')} value={d.totals.goalsCovered} caption={t('sk.stat.goalsOf')} testId="sk-goals-covered" />
        <StatTile label={t('sk.stat.items')} value={d.totals.distinctItems} testId="sk-items" />
        <StatTile label={t('sk.stat.reach')} value={d.goals.reduce((n, g) => n + g.participation, 0)} testId="sk-reach" />
      </StatGrid>
      <SkillsDesk skills={s} sdg={d} initialTab={tab ?? 'skills'} />
    </>
  );
}
