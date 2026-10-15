import type { Metadata } from 'next';
import { AttainmentTree, ArticulationMatrix } from '@/components/obe/AttainmentDepth';
import { ObeDashboard } from '@/components/obe/ObeDashboard';
import { ObeReadinessCard, ObeTabs } from '@/components/obe/ObeDepth';
import { safe } from '@/lib/depth-ui';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { Attainment, CoSet, ImprovementAction, MatrixData, ObeReadiness, Trend } from '@/lib/obe';
import type { Articulation, Tree } from '@/lib/obe-flagship';
import { obePicks } from '../picks';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('obe2.tab.dashboard') };
}

/** A programme's attainment for a year: PO/PSO and CO levels, the PO attainment tree, the programme articulation matrix and readiness. */
export default async function ObeAttainmentPage({ searchParams }: { searchParams: Promise<{ programId?: string; academicYearId?: string; subjectId?: string }> }) {
  const me = await requireSection('obe');
  const q = await searchParams;
  const { t } = await getI18n();
  const picks = await obePicks(q);
  const head = (
    <>
      <PageHeader
        title={t('obe2.tab.dashboard')}
        subtitle={t('obe.subtitle')}
        actions={
          <>
            <LinkButton href="/obe/matrix" variant="outlined">{t('obe.matrix')}</LinkButton>
            <LinkButton href="/obe/classroom" variant="outlined">{t('as.cls.title')}</LinkButton>
            <LinkButton href="/obe/quality" variant="outlined">{t('dx.link.quality')}</LinkButton>
          </>
        }
      />
      <ObeTabs value="attainment" />
    </>
  );
  if (picks.error !== undefined) return <>{head}<ErrorState message={picks.error} /></>;
  const { programId, yearId, subjectId } = picks;
  const [att, actions, sets] = await Promise.all([
    programId && yearId ? load(() => api<Attainment>(`/v1/obe/programs/${programId}/attainment?academicYearId=${yearId}`)) : null,
    programId ? load(() => api<ImprovementAction[]>(`/v1/obe/programs/${programId}/actions`)) : null,
    subjectId ? load(() => api<CoSet[]>(`/v1/obe/subjects/${subjectId}/co-sets`)) : null,
  ]);
  const set = sets?.data?.find((s) => s.status === 'active') ?? sets?.data?.[0];
  const [readiness, trend, tree, pam] = programId
    ? await Promise.all([
        safe(api<ObeReadiness>(`/v1/obe/programs/${programId}/readiness${yearId ? `?academicYearId=${yearId}` : ''}`), null),
        safe(api<Trend>(`/v1/obe/programs/${programId}/attainment/trend`), null),
        yearId ? safe(api<Tree>(`/v1/obe/programs/${programId}/attainment/tree?academicYearId=${yearId}`), null) : Promise.resolve(null),
        safe(api<Articulation>(`/v1/obe/programs/${programId}/articulation`), null),
      ])
    : [null, null, null, null];
  const matrix = set ? await load(() => api<MatrixData>(`/v1/obe/co-sets/${set.id}/matrix`)) : null;
  return (
    <>
      {head}
      {att?.error !== undefined ? (
        <ErrorState message={att.error} />
      ) : (
        <ObeDashboard programs={picks.programs} years={picks.years} subjects={picks.subjects} programId={programId} yearId={yearId} subjectId={subjectId} attainment={att?.data ?? null} matrix={matrix?.data ?? null} actions={actions?.data ?? []} canManage={!!me} />
      )}
      {tree && tree.outcomes.length > 0 && <AttainmentTree tree={tree} yearId={yearId} />}
      {pam && <ArticulationMatrix pam={pam} />}
      {(readiness || trend) && <ObeReadinessCard readiness={readiness} trend={trend} />}
    </>
  );
}
