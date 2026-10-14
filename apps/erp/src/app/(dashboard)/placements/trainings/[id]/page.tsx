import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TrainingView } from '@/components/placements/TrainingView';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { TrainingDetail } from '@/lib/placements-depth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('pd.view.training') };
}

const PLACEMENT_STAFF = ['principal', 'tenant_admin', 'placement_officer'];

/** One placement training programme. */
export default async function TrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('placements');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const tr = await load(() => api<TrainingDetail>(`/v1/placements/trainings/${id}`));
  if (tr.error !== undefined) return <ErrorState message={tr.error} />;
  return <TrainingView tr={tr.data} canEdit={(me?.roles ?? []).some((r) => PLACEMENT_STAFF.includes(r))} />;
}
