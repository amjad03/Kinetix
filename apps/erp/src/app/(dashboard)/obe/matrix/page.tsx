import type { Metadata } from 'next';
import { MatrixEditor } from '@/components/obe/MatrixEditor';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { CoSet, MatrixData } from '@/lib/obe';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('obe.matrix') };
}

export default async function MatrixPage({ searchParams }: { searchParams: Promise<{ subjectId?: string; setId?: string }> }) {
  await requireSection('obe');
  const q = await searchParams;
  const structure = await load(() => api<Structure>('/v1/admin/structure'));
  const { t } = await getI18n();
  const head = <PageHeader title={t('obe.matrix')} subtitle={t('obe.matrixSubtitle')} />;
  if (structure.error !== undefined) return <>{head}<ErrorState message={structure.error} /></>;
  const subjectId = q.subjectId ?? structure.data.subjects[0]?.id ?? '';
  if (!subjectId) return <>{head}<ErrorState message={t('obe.noSubject')} /></>;
  const sets = await load(() => api<CoSet[]>(`/v1/obe/subjects/${subjectId}/co-sets`));
  if (sets.error !== undefined) return <>{head}<ErrorState message={sets.error} /></>;
  const chosen = sets.data.find((s) => s.id === q.setId) ?? sets.data.find((s) => s.status === 'draft') ?? sets.data.find((s) => s.status === 'active') ?? sets.data[0];
  const matrix = chosen ? await load(() => api<MatrixData>(`/v1/obe/co-sets/${chosen.id}/matrix`)) : null;
  return (
    <>
      {head}
      <MatrixEditor key={chosen?.id ?? subjectId} subjects={structure.data.subjects} subjectId={subjectId} sets={sets.data} setId={chosen?.id ?? null} matrix={matrix?.data ?? null} canEdit />
    </>
  );
}
