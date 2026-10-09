import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { type ApplicantOption, type Interview, InterviewsDesk } from '@/components/admissions/InterviewsDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { ApplicationRow } from '@/lib/admissions';
import { getI18n } from '@/i18n/server';

const CLOSED = ['rejected', 'withdrawn', 'declined', 'enrolled'];

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.interviews') };
}

export default async function InterviewsPage() {
  await requireSection('admissions');
  const [interviews, apps] = await Promise.all([load(() => api<Interview[]>('/v1/admissions/interviews')), load(() => api<ApplicationRow[]>('/v1/admissions/applications'))]);
  const { t } = await getI18n();
  const error = interviews.error ?? apps.error;
  const applicants: ApplicantOption[] = (apps.data ?? []).filter((a) => !CLOSED.includes(a.status)).map((a) => ({ id: a.id, applicationNo: a.applicationNo, applicantName: a.applicantName, cycleName: a.cycleName }));
  return (
    <>
      <PageHeader title={t('adm.tab.interviews')} subtitle={t('ag.int.subtitle')} />
      <AdmissionsTabs current="interviews" />
      {error !== undefined ? <ErrorState message={error} /> : <InterviewsDesk interviews={interviews.data!} applicants={applicants} />}
    </>
  );
}
