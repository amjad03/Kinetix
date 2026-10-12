import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CandidateRecord } from '@/components/hr/Records';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { JobApplicant, JobOpening } from '@/lib/hr-types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hf.rec.candidate') };
}

/** A candidate: pipeline stages, offers and offer letters. */
export default async function Page({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const me = await requireSection('hr');
  const { id, cid } = await params;
  if (![id, cid].every((x) => /^[0-9a-f-]{36}$/i.test(x))) notFound();
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<JobOpening[]>('/v1/hr/openings'), api<JobApplicant[]>(`/v1/hr/openings/${id}/applicants`), api<{ id: string; offerNo: string; position: string; annualCtcPaise: number; joiningOn: string; status: string }[]>(`/v1/hr/applicants/${cid}/offers`).catch(() => [])]));
  if (data.error !== undefined) {
    return (
      <>
        <PageHeader title={t('hf.rec.candidate')} />
        <ErrorState message={data.error} />
      </>
    );
  }
  const o = data.data[0].find((x) => x.id === id);
  const a = data.data[1].find((x) => x.id === cid);
  if (!o || !a || !me) notFound();
  return <CandidateRecord a={a} opening={o} offers={data.data[2]} />;
}
