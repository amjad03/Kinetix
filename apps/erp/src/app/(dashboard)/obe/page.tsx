import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ObeDashboard } from '@/components/obe/ObeDashboard';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { YEAR_COOKIE } from '@/lib/config';
import { getI18n } from '@/i18n/server';
import type { Attainment, CoSet, ImprovementAction, MatrixData } from '@/lib/obe';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.obe') };
}

export default async function ObePage({ searchParams }: { searchParams: Promise<{ programId?: string; academicYearId?: string; subjectId?: string }> }) {
  const me = await requireSection('obe');
  const q = await searchParams;
  const structure = await load(() => api<Structure & { academicYears: { id: string; label: string; isCurrent: boolean }[] }>('/v1/admin/structure'));
  const { t } = await getI18n();
  const head = (
    <PageHeader
      title={t('nav.obe')}
      subtitle={t('obe.subtitle')}
      actions={
        <>
          <LinkButton href="/obe/setup" variant="outlined">{t('obe.setup')}</LinkButton>
          <LinkButton href="/obe/matrix" variant="outlined">{t('obe.matrix')}</LinkButton>
        </>
      }
    />
  );
  if (structure.error !== undefined)
    return (
      <>
        {head}
        <ErrorState message={structure.error} />
      </>
    );
  const years = structure.data.academicYears;
  const programId = q.programId ?? structure.data.programs[0]?.id ?? '';
  // The top bar's academic-year switcher chooses the year unless the URL says otherwise.
  const picked = (await cookies()).get(YEAR_COOKIE)?.value;
  const yearId = q.academicYearId ?? years.find((y) => y.id === picked)?.id ?? years.find((y) => y.isCurrent)?.id ?? years[0]?.id ?? '';
  const subjects = structure.data.subjects.filter((s) => s.programId === programId);
  const subjectId = subjects.find((s) => s.id === q.subjectId)?.id ?? subjects[0]?.id ?? '';
  const [att, actions, sets] = await Promise.all([
    programId && yearId ? load(() => api<Attainment>(`/v1/obe/programs/${programId}/attainment?academicYearId=${yearId}`)) : null,
    programId && yearId ? load(() => api<ImprovementAction[]>(`/v1/obe/programs/${programId}/actions`)) : null,
    subjectId ? load(() => api<CoSet[]>(`/v1/obe/subjects/${subjectId}/co-sets`)) : null,
  ]);
  const set = sets?.data?.find((s) => s.status === 'active') ?? sets?.data?.[0];
  const matrix = set ? await load(() => api<MatrixData>(`/v1/obe/co-sets/${set.id}/matrix`)) : null;
  return (
    <>
      {head}
      {att?.error !== undefined ? (
        <ErrorState message={att.error} />
      ) : (
        <ObeDashboard programs={structure.data.programs} years={years} subjects={subjects} programId={programId} yearId={yearId} subjectId={subjectId} attainment={att?.data ?? null} matrix={matrix?.data ?? null} actions={actions?.data ?? []} canManage={!!me} />
      )}
    </>
  );
}
