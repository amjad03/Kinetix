import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AssessmentRecordView, type AssessmentDetail } from '@/components/academics/Records';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import type { AuditRow } from '@/lib/academics';
import { ApiError, api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('acad.tab.assessments') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('academics');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const res = await load(async () => {
    try {
      const [a, activity] = await Promise.all([api<AssessmentDetail>(`/v1/assessments/${id}`), api<AuditRow[]>(`/v1/academics/activity/${id}`)]);
      return { a, activity };
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
      throw e;
    }
  });
  if (res.error !== undefined) return <ErrorState message={res.error} />;
  const canLock = (me?.roles ?? []).some((r) => r === 'principal' || r === 'tenant_admin' || r === 'hod');
  return <AssessmentRecordView a={res.data.a} activity={res.data.activity} canLock={canLock} />;
}
