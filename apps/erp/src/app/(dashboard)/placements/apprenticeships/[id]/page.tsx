import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApprenticeshipView, type ApprenticeshipRow } from '@/components/placements/ApprenticeshipView';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { StipendSheet } from '@/lib/placements-depth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('pp.ap.title') };
}

const PLACEMENT_STAFF = ['principal', 'tenant_admin', 'placement_officer'];

/** One NATS apprenticeship: its enrolment and contract, and the stipend month by month with the DBT share. */
export default async function ApprenticeshipPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('placements');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await load(async () => {
    const [row, sheet] = await Promise.all([api<ApprenticeshipRow>(`/v1/records/apprenticeships/${id}`), api<StipendSheet>(`/v1/placements/apprenticeships/${id}/stipends`)]);
    return { row, sheet };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return <ApprenticeshipView row={data.data.row} sheet={data.data.sheet} canEdit={(me?.roles ?? []).some((r) => PLACEMENT_STAFF.includes(r))} />;
}
