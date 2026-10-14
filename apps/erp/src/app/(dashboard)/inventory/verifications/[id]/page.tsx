import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VerificationSheet } from '@/components/inventory/VerificationSheet';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Verification } from '@/lib/procurement';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ivd.view.verification') };
}

/** One stock verification's count sheet. */
export default async function VerificationPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('inventory');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const v = await load(() => api<Verification>(`/v1/inventory/verifications/${id}`));
  if (v.error !== undefined) return <ErrorState message={v.error} />;
  return <VerificationSheet data={v.data} canAdjust={(me?.roles ?? []).some((r) => r === 'principal' || r === 'tenant_admin')} />;
}
