import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { EnquiryRecords } from '@/components/admissions/EnquiryRecords';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { Counsellor } from '@/lib/admissions';
import type { LeadTemplate } from '@/lib/admissions-desk';
import { loadRecords } from '@/lib/records-server';
import { schoolToday } from '@/lib/school';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adk.tab.enquiries') };
}

/** Every enquiry as a list (the pipeline board shows the same enquiries by stage). */
export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('admissions');
  const { t } = await getI18n();
  const [loaded, templates, counsellors] = await Promise.all([loadRecords('enquiries', await searchParams), load(() => api<LeadTemplate[]>('/v1/admissions/lead-templates')), load(() => api<Counsellor[]>('/v1/admissions/counsellors'))]);
  return (
    <>
      <PageHeader title={t('adk.tab.enquiries')} subtitle={t('adk.enq.subtitle')} />
      <AdmissionsTabs current="enquiries" />
      {loaded.error !== undefined ? (
        <ErrorState message={loaded.error} />
      ) : (
        <EnquiryRecords meta={loaded.data.meta} page={loaded.data.page} state={loaded.data.state} templates={templates.data ?? []} counsellors={counsellors.data ?? []} today={schoolToday()} />
      )}
    </>
  );
}
