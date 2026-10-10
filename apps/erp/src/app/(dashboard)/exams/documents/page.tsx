import type { Metadata } from 'next';
import { DocRequest, DocRequestsDesk } from '@/components/exams/DocRequestsDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.docRequests') };
}

/** Transcript, provisional certificate and grade card requests (exam controller, principal, admin). */
export default async function DocumentRequestsPage() {
  await requireSection('exams');
  const { t } = await getI18n();
  const data = await load(() => api<DocRequest[]>('/v1/academic-docs/inbox'));
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return (
    <>
      <PageHeader title={t('nav.docRequests')} subtitle={t('uni.doc.subtitle')} />
      <DocRequestsDesk rows={data.data} />
    </>
  );
}
