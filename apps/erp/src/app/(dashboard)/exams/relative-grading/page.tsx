import type { Metadata } from 'next';
import { CurveSettingsCard, CurveSubjects } from '@/components/exams/RelativeGrading';
import { ExamsTabs } from '@/components/exams/ExamsTabs';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { ExamSession } from '@/lib/exams';
import { canApplyCurve, type CurveSession, type RelativeSettings } from '@/lib/relative-grading';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('rg.title') };
}

/**
 * Relative (curve) grading where the regulation in force allows it: the exam office turns it on, then for a session's
 * subject previews the class mean and standard deviation, the cut-offs with a moderation shift and the grade
 * distribution against the absolute one, and applies or clears it.
 */
export default async function RelativeGradingPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const me = await requireSection('exams');
  const sp = await searchParams;
  const { t } = await getI18n();
  const roles = me?.roles ?? [];
  const base = await load(async () => {
    const [settings, sessions] = await Promise.all([api<RelativeSettings>('/v1/relative-grading/settings'), api<ExamSession[]>('/v1/exam-sessions')]);
    return { settings, sessions };
  });
  const header = (
    <>
      <PageHeader title={t('rg.title')} subtitle={t('rg.subtitle')} />
      <ExamsTabs current="curve" roles={roles} />
    </>
  );
  if (base.error !== undefined)
    return (
      <>
        {header}
        <ErrorState message={base.error} />
      </>
    );
  const { settings, sessions } = base.data;
  const pick = sessions.find((s) => s.id === sp.session) ?? sessions.find((s) => s.status !== 'draft' && s.status !== 'published' && s.status !== 'locked') ?? sessions[0];
  const detail = pick && settings.allowed ? await load(() => api<CurveSession>(`/v1/relative-grading/sessions/${pick.id}`)) : null;
  return (
    <>
      {header}
      <div className="grid gap-6">
        <CurveSettingsCard settings={settings} canEdit={canApplyCurve(roles)} />
        {settings.allowed && (
          <section className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="m-0 text-base font-semibold">{t('rg.subjects')}</h2>
              {sessions.length > 0 && <UrlSelect label={t('rg.session')} param="session" value={pick?.id ?? ''} options={sessions.map((s) => ({ value: s.id, label: s.name }))} testId="rg-session" />}
            </div>
            {!pick || !detail ? (
              <EmptyState title={t('rg.noSessions')} description={t('rg.noSessionsSub')} />
            ) : detail.error !== undefined ? (
              <ErrorState message={detail.error} />
            ) : (
              <CurveSubjects data={detail.data} canApply={canApplyCurve(roles)} />
            )}
          </section>
        )}
      </div>
    </>
  );
}
