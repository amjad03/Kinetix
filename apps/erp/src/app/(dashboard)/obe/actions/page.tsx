import type { Metadata } from 'next';
import { ObeActionsList } from '@/components/obe/ObeActionsList';
import { GapsButton, ObeTabs, ProgramYearBar } from '@/components/obe/ObeDepth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';
import { getI18n } from '@/i18n/server';
import { obePicks } from '../picks';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('obe2.tab.actions') };
}

/** Improvement actions: opened from the year's attainment gaps, then owned, tracked, closed with the root cause and re-measured. */
export default async function ObeActionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('obe');
  const sp = await searchParams;
  const { t } = await getI18n();
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const picks = await obePicks({ programId: one(sp.programId), academicYearId: one(sp.academicYearId) });
  const records = await loadRecords('obe-actions', sp);
  return (
    <>
      <PageHeader title={t('obe2.tab.actions')} subtitle={t('obe2.act.sub')} />
      <ObeTabs value="actions" />
      {picks.error !== undefined ? (
        <ErrorState message={picks.error} />
      ) : (
        picks.programId && (
          <>
            <ProgramYearBar base="/obe/actions" programs={picks.programs} programId={picks.programId} years={picks.years} yearId={picks.yearId} />
            <GapsButton programId={picks.programId} yearId={picks.yearId} />
          </>
        )
      )}
      {records.error !== undefined ? <ErrorState message={records.error} /> : <ObeActionsList meta={records.data.meta} page={records.data.page} state={records.data.state} />}
    </>
  );
}
