import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VendorView } from '@/components/procurement/VendorView';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { VendorProfile } from '@/lib/procurement';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('inv.vendor') };
}

/** One vendor's profile. */
export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('procurement');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const v = await load(() => api<VendorProfile>(`/v1/inventory/vendors/${id}`));
  if (v.error !== undefined) return <ErrorState message={v.error} />;
  const roles = me?.roles ?? [];
  return <VendorView v={v.data} canStore={roles.some((r) => ['store_keeper', 'principal', 'tenant_admin'].includes(r))} canApprove={roles.some((r) => r === 'principal' || r === 'tenant_admin')} />;
}
