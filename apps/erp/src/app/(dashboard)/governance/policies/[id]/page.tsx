import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PolicyDesk } from '@/components/governance/PolicyDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import type { PolicyDetail } from '@/lib/governance-pass';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('gp.title.policy') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One policy: every version with its author, approver and acknowledgements, and the steps of the open version. */
export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('governance');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t } = await getI18n();
  const res = await load(() => api<PolicyDetail>(`/v1/governance/policies/${id}`));
  if (res.error !== undefined)
    return (
      <>
        <PageHeader title={t('gp.title.policy')} />
        <ErrorState message={res.error} />
      </>
    );
  const p = res.data;
  return (
    <>
      <PageHeader title={`${p.code} · ${p.title}`} subtitle={t(`rk.o.governance-policies.category.${p.category}` as MessageKey)} />
      <PolicyDesk p={p} />
    </>
  );
}
