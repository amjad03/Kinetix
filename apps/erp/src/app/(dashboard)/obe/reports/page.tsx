import type { Metadata } from 'next';
import { ObeTabs, ProgramYearBar } from '@/components/obe/ObeDepth';
import { ReportsDesk } from '@/components/obe/ObeDesks';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, requireSection } from '@/lib/api';
import { safe } from '@/lib/depth-ui';
import type { Framework } from '@/lib/obe-flagship';
import { getI18n } from '@/i18n/server';
import { obePicks } from '../picks';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('of.tab.reports') };
}

/** Course files, attainment reports, NBA SAR criteria 2 and 3, NAAC 2.6 and batch reports as branded PDFs and Excel. */
export default async function ObeReportsPage({ searchParams }: { searchParams: Promise<{ programId?: string; academicYearId?: string }> }) {
  await requireSection('obe');
  const { t } = await getI18n();
  const picks = await obePicks(await searchParams);
  const head = (
    <>
      <PageHeader title={t('of.tab.reports')} subtitle={t('of.rep.sub')} />
      <ObeTabs value="reports" />
    </>
  );
  if (picks.error !== undefined) return <>{head}<ErrorState message={picks.error} /></>;
  if (!picks.programId || !picks.yearId) return <>{head}<ErrorState message={t('obe.noProgram')} /></>;
  const fw = await safe(api<{ framework: Framework }>(`/v1/obe/programs/${picks.programId}/framework`), { framework: 'naac' as Framework });
  return (
    <>
      {head}
      <ProgramYearBar base="/obe/reports" programs={picks.programs} programId={picks.programId} years={picks.years} yearId={picks.yearId} />
      <ReportsDesk programId={picks.programId} yearId={picks.yearId} framework={fw.framework} courses={picks.subjects} />
    </>
  );
}
