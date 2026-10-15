import type { Metadata } from 'next';
import { PeoPoEditor } from '@/components/obe/ObeAudit';
import { ObeTabs, PeoMissionEditor, ProgramYearBar } from '@/components/obe/ObeDepth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { PeoPo } from '@/lib/obe-flagship';
import type { PeoMission, Versions } from '@/lib/obe';
import { getI18n } from '@/i18n/server';
import { obePicks } from '../picks';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('obe2.tab.peo') };
}

/** The PEO-mission consistency matrix, the PEO-PO/PSO matrix with PEO attainment, and the published versions of the programme's statements. */
export default async function ObePeoPage({ searchParams }: { searchParams: Promise<{ programId?: string; academicYearId?: string }> }) {
  const me = await requireSection('obe');
  const { t } = await getI18n();
  const picks = await obePicks(await searchParams);
  const head = (
    <>
      <PageHeader title={t('obe2.tab.peo')} subtitle={t('obe2.peo.sub')} />
      <ObeTabs value="peo" />
    </>
  );
  if (picks.error !== undefined) return <>{head}<ErrorState message={picks.error} /></>;
  if (!picks.programId) return <>{head}<ErrorState message={t('obe.noProgram')} /></>;
  const data = await load(() => Promise.all([api<PeoMission>(`/v1/obe/programs/${picks.programId}/peo-mission`), api<Versions>(`/v1/obe/programs/${picks.programId}/versions`), api<PeoPo>(`/v1/obe/programs/${picks.programId}/peo-po${picks.yearId ? `?academicYearId=${picks.yearId}` : ''}`)]));
  const canEdit = !!me?.roles.some((r) => ['principal', 'tenant_admin', 'quality_officer'].includes(r));
  return (
    <>
      {head}
      <ProgramYearBar base="/obe/peo" programs={picks.programs} programId={picks.programId} years={picks.years} yearId={picks.yearId} />
      {data.error !== undefined ? (
        <ErrorState message={data.error} />
      ) : (
        <div className="flex flex-col gap-6">
          <PeoMissionEditor key={picks.programId} programId={picks.programId} data={data.data[0]} versions={data.data[1]} canEdit={canEdit} />
          <PeoPoEditor key={`pp:${picks.programId}:${picks.yearId}`} programId={picks.programId} data={data.data[2]} canEdit={canEdit} />
        </div>
      )}
    </>
  );
}
