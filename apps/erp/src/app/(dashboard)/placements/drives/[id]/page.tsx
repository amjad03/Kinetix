import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DriveView } from '@/components/placements/DriveView';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { DriveDetail, DriveOffer, EligibleList, Registration, Slot } from '@/lib/placements-depth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('pl.col.drive') };
}

const PLACEMENT_STAFF = ['principal', 'tenant_admin', 'placement_officer'];

/** One placement drive. */
export default async function DrivePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('placements');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await load(async () => {
    const [d, regs, eligible, slots, offers, companies] = await Promise.all([
      api<DriveDetail>(`/v1/placements/drives/${id}`),
      api<Registration[]>(`/v1/placements/drives/${id}/registrations`),
      api<EligibleList>(`/v1/placements/drives/${id}/eligible`),
      api<Slot[]>(`/v1/placements/drives/${id}/slots`),
      api<DriveOffer[]>(`/v1/placements/offers?driveId=${id}`),
      api<{ id: string; name: string }[]>('/v1/placements/companies'),
    ]);
    return { d, regs, eligible, slots, offers, company: companies.find((c) => c.id === d.companyId)?.name ?? '' };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return <DriveView {...data.data} canEdit={(me?.roles ?? []).some((r) => PLACEMENT_STAFF.includes(r))} />;
}
