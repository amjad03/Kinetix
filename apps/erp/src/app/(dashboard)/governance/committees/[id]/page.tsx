import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CommitteeDetailDesk } from '@/components/governance/CommitteeDetailDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import type { CommitteeDetail } from '@/lib/governance-pass';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('gp.title.committee') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One committee: its regulation, profile and public contact, members in office with what the composition lacks, and its meetings. */
export default async function CommitteePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('governance');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t } = await getI18n();
  const res = await load(async () => ({ c: await api<CommitteeDetail>(`/v1/governance/committees/${id}`), people: await api<{ id: string; name: string }[]>('/v1/governance/committees/people') }));
  if (res.error !== undefined)
    return (
      <>
        <PageHeader title={t('gp.title.committee')} />
        <ErrorState message={res.error} />
      </>
    );
  const { c, people } = res.data;
  return (
    <>
      <PageHeader title={c.name} subtitle={c.kind !== 'other' ? t(`gp.basis.${c.kind}` as MessageKey) : c.description || t('gp.title.committee')} />
      <CommitteeDetailDesk c={c} people={people} />
    </>
  );
}
