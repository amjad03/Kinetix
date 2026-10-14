import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CandidateFile } from '@/components/hr/Hiring';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { ApplicantFile } from '@/lib/hr-depth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hf.rec.candidate') };
}

/** A candidate's file: screening, interviews and panel scores, offers, hiring and the appointment order. */
export default async function Page({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const me = await requireSection('hr');
  const { id, cid } = await params;
  if (![id, cid].every((x) => /^[0-9a-f-]{36}$/i.test(x))) notFound();
  const { t } = await getI18n();
  const data = await load(() => api<ApplicantFile>(`/v1/hr/applicants/${cid}/file`));
  if (data.error !== undefined) {
    return (
      <>
        <PageHeader title={t('hf.rec.candidate')} />
        <ErrorState message={data.error} />
      </>
    );
  }
  if (!me || data.data.opening.id !== id) notFound();
  return <CandidateFile a={data.data} meId={me.id} canHire={me.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'hr_manager')} />;
}
