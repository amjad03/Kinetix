import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OpeningRecord } from '@/components/hr/Records';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { historyFor } from '@/lib/hr-records';
import type { JobApplicant, JobOpening } from '@/lib/hr-types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hr.tab.recruitment') };
}

/** A job opening or staff requisition: approval, applicants and history. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('hr');
  const { id } = await params;
  if (![id].every((x) => /^[0-9a-f-]{36}$/i.test(x))) notFound();
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<JobOpening[]>('/v1/hr/openings'), api<JobApplicant[]>(`/v1/hr/openings/${id}/applicants`), historyFor('job_opening', id)]));
  if (data.error !== undefined) {
    return (
      <>
        <PageHeader title={t('hr.tab.recruitment')} />
        <ErrorState message={data.error} />
      </>
    );
  }
  const o = data.data[0].find((x) => x.id === id);
  if (!o) notFound();
  const canDecide = !!me && me.roles.some((r) => r === 'principal' || r === 'tenant_admin');
  return <OpeningRecord o={o} applicants={data.data[1]} canDecide={canDecide} activity={data.data[2]} />;
}
