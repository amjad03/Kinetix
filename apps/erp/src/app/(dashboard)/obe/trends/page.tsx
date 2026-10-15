import type { Metadata } from 'next';
import { ObeTabs, ProgramYearBar } from '@/components/obe/ObeDepth';
import { TrendsDesk } from '@/components/obe/ObeDesks';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, requireSection } from '@/lib/api';
import { safe } from '@/lib/depth-ui';
import type { Trend } from '@/lib/obe';
import type { Batches } from '@/lib/obe-flagship';
import { getI18n } from '@/i18n/server';
import { obePicks } from '../picks';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('of.tab.trends') };
}

/** PO/PSO attainment year on year and batch by batch. */
export default async function ObeTrendsPage({ searchParams }: { searchParams: Promise<{ programId?: string }> }) {
  await requireSection('obe');
  const { t } = await getI18n();
  const picks = await obePicks(await searchParams);
  const head = (
    <>
      <PageHeader title={t('of.tab.trends')} subtitle={t('of.trend.page')} />
      <ObeTabs value="trends" />
    </>
  );
  if (picks.error !== undefined) return <>{head}<ErrorState message={picks.error} /></>;
  if (!picks.programId) return <>{head}<ErrorState message={t('obe.noProgram')} /></>;
  const [trend, batches] = await Promise.all([safe(api<Trend>(`/v1/obe/programs/${picks.programId}/attainment/trend`), null), safe(api<Batches>(`/v1/obe/programs/${picks.programId}/batches`), null)]);
  return (
    <>
      {head}
      <ProgramYearBar base="/obe/trends" programs={picks.programs} programId={picks.programId} />
      <TrendsDesk programId={picks.programId} trend={trend} batches={batches} />
    </>
  );
}
