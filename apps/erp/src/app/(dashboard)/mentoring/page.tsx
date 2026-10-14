import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { AssignmentsList, ChannelView, LearnersView, MentoringReports } from '@/components/life/MentoringExtras';
import { PageHeader } from '@/components/PageHeader';
import { MentoringDesk } from '@/components/quality/MentoringDesk';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, getMe, load, requireSection } from '@/lib/api';
import type { LearnerRules, MentorChannel, MentorStat, OutcomeStats } from '@/lib/life';
import type { InterventionPlanRow, MentorAssignment, MentorRef, RiskRow } from '@/lib/quality';
import { loadRecords } from '@/lib/records-server';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.mentoring') };
}

const VIEWS = ['desk', 'assignments', 'learners', 'channel', 'reports'] as const;
type View = (typeof VIEWS)[number];

/**
 * Mentoring: the desk (risk, mentees, plans), mentor assignments as a record kit list, slow and advanced learners by
 * the institution's rules, the private mentor channel, and the mentoring and outcome reports.
 */
export default async function MentoringPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('mentoring');
  const sp = await searchParams;
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : 'desk';
  const { t } = await getI18n();
  const me = await getMe();
  const leader = me.roles.some((r) => r === 'principal' || r === 'tenant_admin');
  const header = <PageHeader title={t('nav.mentoring')} subtitle={t('mn.subtitle')} actions={<LinkButton href="/mentoring/interventions" variant="outlined">{t('dx.link.mentoring')}</LinkButton>} />;
  const tabs = <LinkTabs label={t('nav.mentoring')} value={view} items={VIEWS.map((v) => ({ value: v, label: t(`wd.view.${v}` as MessageKey), href: v === 'desk' ? '/mentoring' : `/mentoring?view=${v}` }))} />;

  if (view === 'assignments') {
    const records = await loadRecords('mentor-assignments', sp, { filters: { state: 'open' } });
    return <>{header}{tabs}{records.error !== undefined ? <ErrorState message={records.error} /> : <AssignmentsList meta={records.data.meta} page={records.data.page} state={records.data.state} />}</>;
  }
  if (view === 'learners') {
    const d = await load(() => Promise.all([api<Structure>('/v1/admin/structure'), api<LearnerRules>('/v1/mentoring/learner-rules')]));
    if (d.error !== undefined) return <>{header}{tabs}<ErrorState message={d.error} /></>;
    return <>{header}{tabs}<LearnersView sections={d.data[0].sections.map((s) => ({ id: s.id, name: s.displayName }))} rules={d.data[1]} canSetRules={leader} /></>;
  }
  if (view === 'channel') {
    const d = await load(() => api<MentorChannel[]>('/v1/mentoring/channels'));
    return <>{header}{tabs}{d.error !== undefined ? <ErrorState message={d.error} /> : <ChannelView channels={d.data} meId={me.id} />}</>;
  }
  if (view === 'reports') {
    const d = await load(() => Promise.all([api<MentorStat[]>('/v1/mentoring/reports/mentors'), api<OutcomeStats>('/v1/mentoring/reports/outcomes')]));
    return <>{header}{tabs}{d.error !== undefined ? <ErrorState message={d.error} /> : <MentoringReports mentors={d.data[0]} outcomes={d.data[1]} />}</>;
  }

  const tab = typeof sp.tab === 'string' ? sp.tab : undefined;
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
      {header}
      {tabs}
      <StatGrid min={140}>
        <StatTile label={t('mn.stat.mentees')} value={mentees.length} testId="mn-mentees" />
        <StatTile label={t('mn.stat.atRisk')} value={attention.length} tone={attention.length ? 'warning' : 'default'} caption={t('mn.stat.atRiskCaption', { high: risk.filter((r) => r.level === 'high').length })} testId="mn-at-risk" />
        <StatTile label={t('mn.stat.plans')} value={plans.filter((p) => p.plan.status !== 'closed').length} testId="mn-plans" />
      </StatGrid>
      <MentoringDesk risk={risk} mentees={mentees} plans={plans} mentors={mentors} sections={sections} initialTab={tab ?? 'risk'} />
    </>
  );
}
