import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { IndentView } from '@/components/procurement/IndentView';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { IStore, IVendor } from '@/lib/ops';
import type { IndentDetail } from '@/lib/procurement';
import { optional } from '@/lib/procurement-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.indents') };
}

const STORE = ['store_keeper', 'principal', 'tenant_admin'];

/** One indent. */
export default async function IndentPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('indents');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const canOrder = (me?.roles ?? []).some((r) => STORE.includes(r));
  const data = await load(async () => {
    const [r, vendors, stores] = await Promise.all([api<IndentDetail>(`/v1/inventory/requisitions/${id}`), canOrder ? optional<IVendor[]>('/v1/inventory/vendors', []) : [], canOrder ? api<IStore[]>('/v1/inventory/stores') : []]);
    return { r, vendors, stores };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { r, vendors, stores } = data.data;
  return <IndentView r={r} canOrder={canOrder} vendors={vendors.filter((v) => v.active !== false && !v.blacklisted).map((v) => ({ value: v.id, label: v.name }))} stores={stores.map((s) => ({ value: s.id, label: s.name }))} />;
}
