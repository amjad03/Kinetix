import type { Metadata } from 'next';
import { ObeTabs, ProgramYearBar, TargetsEditor } from '@/components/obe/ObeDepth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { Targets } from '@/lib/obe';
import { getI18n } from '@/i18n/server';
import { obePicks } from '../picks';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('obe2.tab.targets') };
}

/** Attainment targets per CO and PO/PSO for a year, against the programme's default, with a copy to the next offering. */
export default async function ObeTargetsPage({ searchParams }: { searchParams: Promise<{ programId?: string; academicYearId?: string }> }) {
  const me = await requireSection('obe');
  const { t } = await getI18n();
  const picks = await obePicks(await searchParams);
  const head = (
    <>
      <PageHeader title={t('obe2.tab.targets')} subtitle={t('obe2.tg.sub')} />
      <ObeTabs value="targets" />
    </>
  );
  if (picks.error !== undefined) return <>{head}<ErrorState message={picks.error} /></>;
  if (!picks.programId || !picks.yearId) return <>{head}<ErrorState message={t('obe.noProgram')} /></>;
  const data = await load(() => api<Targets>(`/v1/obe/programs/${picks.programId}/targets?academicYearId=${picks.yearId}`));
  return (
    <>
      {head}
      <ProgramYearBar base="/obe/targets" programs={picks.programs} programId={picks.programId} years={picks.years} yearId={picks.yearId} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <TargetsEditor key={`${picks.programId}:${picks.yearId}`} programId={picks.programId} yearId={picks.yearId} years={picks.years} data={data.data} canEdit={!!me} />}
    </>
  );
}
