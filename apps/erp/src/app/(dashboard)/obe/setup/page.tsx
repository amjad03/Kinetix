import type { Metadata } from 'next';
import { CoordinatorsList } from '@/components/obe/ObeKitLists';
import { FrameworkCard, PolicyEditor } from '@/components/obe/ObeDesks';
import { ObeTabs, ProgramYearBar } from '@/components/obe/ObeDepth';
import { OutcomesEditor } from '@/components/obe/OutcomesEditor';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card, SectionTitle } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { safe } from '@/lib/depth-ui';
import type { ProgramOutcome } from '@/lib/obe';
import type { Framework, PolicyView, Preset } from '@/lib/obe-flagship';
import { loadRecords } from '@/lib/records-server';
import { getI18n } from '@/i18n/server';
import { obePicks } from '../picks';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('obe.setup') };
}

/**
 * A programme's OBE set-up: its framework and outcome presets, statements, attainment rules (institution, programme and
 * course, each with its history) and OBE coordinators.
 */
export default async function ObeSetupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('obe');
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { t } = await getI18n();
  const picks = await obePicks({ programId: one(sp.programId), academicYearId: one(sp.academicYearId), subjectId: one(sp.subjectId) });
  const head = (
    <>
      <PageHeader title={t('obe.setup')} subtitle={t('obe.setupSubtitle')} />
      <ObeTabs value="setup" />
    </>
  );
  if (picks.error !== undefined) return <>{head}<ErrorState message={picks.error} /></>;
  const { programId, yearId, subjectId } = picks;
  if (!programId) return <>{head}<ErrorState message={t('obe.noProgram')} /></>;
  const admin = !!me && me.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'quality_officer');
  const [outcomes, fw, presets, programPolicy, institutionPolicy, coursePolicy, coordinators] = await Promise.all([
    load(() => api<ProgramOutcome[]>(`/v1/obe/programs/${programId}/outcomes`)),
    safe(api<{ framework: Framework }>(`/v1/obe/programs/${programId}/framework`), { framework: 'naac' as Framework }),
    safe(api<Preset[]>('/v1/obe/presets'), []),
    safe(api<PolicyView>(`/v1/obe/policies?programId=${programId}&academicYearId=${yearId}`), null),
    safe(api<PolicyView>('/v1/obe/policies'), null),
    subjectId ? safe(api<PolicyView>(`/v1/obe/policies?subjectId=${subjectId}&academicYearId=${yearId}`), null) : Promise.resolve(null),
    loadRecords('obe-assignments', { ...sp, ...(sp['f.programId'] ? {} : { 'f.programId': programId }) }),
  ]);
  const subject = picks.subjects.find((s) => s.id === subjectId);
  return (
    <>
      {head}
      <ProgramYearBar base="/obe/setup" programs={picks.programs} programId={programId} years={picks.years} yearId={yearId} />
      <div className="flex flex-col gap-6">
        <FrameworkCard key={`fw:${programId}`} programId={programId} framework={fw.framework} presets={presets} canEdit={admin} />
        <Card title={t('of.setup.statements')} subtitle={t('of.setup.statementsSub')}>
          {outcomes.error !== undefined ? <ErrorState message={outcomes.error} /> : <OutcomesEditor key={programId} programs={picks.programs} programId={programId} outcomes={outcomes.data} canEdit={admin} />}
        </Card>
        <div id="policy" className="grid items-start gap-4 2xl:grid-cols-2">
          {programPolicy && <PolicyEditor key={`p:${programId}:${programPolicy.history[0]?.id ?? ''}`} view={programPolicy} scope="program" programId={programId} years={picks.years} canEdit={admin} title={t('of.pol.programme')} />}
          {institutionPolicy && <PolicyEditor key={`i:${institutionPolicy.history[0]?.id ?? ''}`} view={institutionPolicy} scope="institution" years={picks.years} canEdit={admin} title={t('of.pol.institution')} />}
        </div>
        <ProgramYearBar base="/obe/setup" programs={picks.programs} programId={programId} subjects={picks.subjects} subjectId={subjectId} />
        {coursePolicy && subject && <PolicyEditor key={`s:${subjectId}:${coursePolicy.history[0]?.id ?? ''}`} view={coursePolicy} scope="subject" subjectId={subjectId} years={picks.years} canEdit={!!me && me.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'quality_officer' || r === 'hod')} title={t('of.pol.course', { course: `${subject.code} ${subject.name}` })} />}
        <div>
          <SectionTitle flush>{t('of.coord.title')}</SectionTitle>
          <p className="m-0 mb-3 text-[13px] text-muted-foreground">{t('of.coord.sub')}</p>
          {coordinators.error !== undefined ? <ErrorState message={coordinators.error} /> : <CoordinatorsList meta={coordinators.data.meta} page={coordinators.data.page} state={coordinators.data.state} />}
        </div>
      </div>
    </>
  );
}
