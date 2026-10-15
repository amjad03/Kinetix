import type { Metadata } from 'next';
import { InstrumentsWithRatings } from '@/components/obe/ObeKitLists';
import { ObeTabs, ProgramYearBar } from '@/components/obe/ObeDepth';
import { SurveysDesk } from '@/components/obe/ObeDesks';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { SectionTitle } from '@/components/ui';
import { api, requireSection } from '@/lib/api';
import { safe } from '@/lib/depth-ui';
import type { ProgramOutcome } from '@/lib/obe';
import type { ExitSurvey } from '@/lib/obe-flagship';
import { loadRecords } from '@/lib/records-server';
import { getI18n } from '@/i18n/server';
import { obePicks } from '../picks';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('of.tab.surveys') };
}

/** Indirect assessment: exit surveys in the Student App with response rates and reminders, and alumni and employer ratings. */
export default async function ObeSurveysPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('obe');
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { t } = await getI18n();
  const picks = await obePicks({ programId: one(sp.programId), academicYearId: one(sp.academicYearId) });
  const head = (
    <>
      <PageHeader title={t('of.tab.surveys')} subtitle={t('of.sv.page')} />
      <ObeTabs value="surveys" />
    </>
  );
  if (picks.error !== undefined) return <>{head}<ErrorState message={picks.error} /></>;
  const [surveys, outcomes, records] = await Promise.all([
    picks.programId ? safe(api<ExitSurvey[]>(`/v1/obe/programs/${picks.programId}/exit-surveys?academicYearId=${picks.yearId}`), []) : Promise.resolve([] as ExitSurvey[]),
    picks.programId ? safe(api<ProgramOutcome[]>(`/v1/obe/programs/${picks.programId}/outcomes`), []) : Promise.resolve([] as ProgramOutcome[]),
    loadRecords('obe-surveys', { ...sp, ...(picks.programId && !sp['f.programId'] ? { 'f.programId': picks.programId } : {}) }),
  ]);
  return (
    <>
      {head}
      <ProgramYearBar base="/obe/surveys" programs={picks.programs} programId={picks.programId} years={picks.years} yearId={picks.yearId} />
      <SurveysDesk surveys={surveys} sections={picks.sections} />
      <div className="mt-8">
        <SectionTitle flush>{t('of.inst.title')}</SectionTitle>
        <p className="m-0 mb-3 text-[13px] text-muted-foreground">{t('of.inst.sub')}</p>
        {records.error !== undefined ? <ErrorState message={records.error} /> : <InstrumentsWithRatings meta={records.data.meta} page={records.data.page} state={records.data.state} outcomes={outcomes} />}
      </div>
    </>
  );
}
