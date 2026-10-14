import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CompanyView } from '@/components/placements/CompanyView';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { CompanyDetail } from '@/lib/placements-depth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('pl.col.company') };
}

const PLACEMENT_STAFF = ['principal', 'tenant_admin', 'placement_officer'];

/** One recruiter. */
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('placements');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await load(() => api<CompanyDetail>(`/v1/placements/companies/${id}`));
  if (c.error !== undefined) return <ErrorState message={c.error} />;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const portalUrl = `${proto}://${host}/recruiters/${me?.tenant.slug ?? ''}`;
  return <CompanyView c={c.data} canEdit={(me?.roles ?? []).some((r) => PLACEMENT_STAFF.includes(r))} portalUrl={portalUrl} />;
}
