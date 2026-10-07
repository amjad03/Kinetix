import type { Metadata } from 'next';
import { ObeDashboard } from '@/components/obe/ObeDashboard';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { Attainment, ImprovementAction } from '@/lib/obe';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.obe') };
}

export default async function ObePage({ searchParams }: { searchParams: Promise<{ programId?: string; academicYearId?: string }> }) {
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
  const yearId = q.academicYearId ?? years.find((y) => y.isCurrent)?.id ?? years[0]?.id ?? '';
  const [att, actions] = programId && yearId ? await Promise.all([load(() => api<Attainment>(`/v1/obe/programs/${programId}/attainment?academicYearId=${yearId}`)), load(() => api<ImprovementAction[]>(`/v1/obe/programs/${programId}/actions`))]) : [null, null];
  return (
    <>
      {head}
      {att?.error !== undefined ? <ErrorState message={att.error} /> : <ObeDashboard programs={structure.data.programs} years={years} programId={programId} yearId={yearId} attainment={att?.data ?? null} actions={actions?.data ?? []} canManage={!!me} />}
    </>
  );
}
