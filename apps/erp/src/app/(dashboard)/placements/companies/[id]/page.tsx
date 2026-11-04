import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CompanyView } from '@/components/placements/CompanyView';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { CompanyDetail, Interaction } from '@/lib/placements-depth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('pl.col.company') };
}

const PLACEMENT_STAFF = ['principal', 'tenant_admin', 'placement_officer'];

/** One recruiter. */
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('placements');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await load(async () => {
    const [company, log] = await Promise.all([api<CompanyDetail>(`/v1/placements/companies/${id}`), api<{ rows: Interaction[] }>(`/v1/records/placement-interactions?f.company=${id}&pageSize=100&sort=happened:desc`)]);
    return { company, interactions: log.rows };
  });
  if (c.error !== undefined) return <ErrorState message={c.error} />;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const portalUrl = `${proto}://${host}/recruiters/${me?.tenant.slug ?? ''}`;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return <CompanyView c={c.data.company} interactions={c.data.interactions} today={today} canEdit={(me?.roles ?? []).some((r) => PLACEMENT_STAFF.includes(r))} portalUrl={portalUrl} />;
}
