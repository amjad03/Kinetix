import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PoView } from '@/components/procurement/PoView';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { PoDetail } from '@/lib/procurement';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('inv.po') };
}

/** One purchase order. */
export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('procurement');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const po = await load(() => api<PoDetail>(`/v1/inventory/purchase-orders/${id}`));
  if (po.error !== undefined) return <ErrorState message={po.error} />;
  const roles = me?.roles ?? [];
  return <PoView po={po.data} canStore={roles.some((r) => ['store_keeper', 'principal', 'tenant_admin'].includes(r))} canApprove={roles.some((r) => r === 'principal' || r === 'tenant_admin')} me={me?.id ?? ''} />;
}
