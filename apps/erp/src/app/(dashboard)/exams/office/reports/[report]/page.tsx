import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { OfficeReport } from '@/components/exam-office/OfficeViews';
import { LinkButton } from '@/components/LinkButton';
import { ErrorState } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import { label, reportFromSlug, type ListRow, type ReportData } from '@/lib/exam-office';

export async function generateMetadata({ params }: { params: Promise<{ report: string }> }): Promise<Metadata> {
  const report = reportFromSlug((await params).report);
  const { t } = await getI18n();
  return { title: report ? label(t, 'xo.r.', report) : t('xo.reports') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BY = new Set(['subject', 'section', 'topper']);

/** An exam office report for one session; the session and options are the URL's query string. */
export default async function OfficeReportPage({ params, searchParams }: { params: Promise<{ report: string }>; searchParams: Promise<{ sessionId?: string; by?: string }> }) {
  await requireSection('exams');
  const report = reportFromSlug((await params).report);
  if (!report) notFound();
  const sp = await searchParams;
  const { t } = await getI18n();
  const sessions = await load(() => api<ListRow[]>('/v1/exam-office/records/session'));
  const sessionId = sp.sessionId && UUID.test(sp.sessionId) ? sp.sessionId : (sessions.data?.[0]?.id ?? '');
  const by = sp.by && BY.has(sp.by) ? sp.by : '';
  const data = sessionId ? await load(() => api<ReportData>(`/v1/exam-office/reports/${report}?sessionId=${sessionId}${by ? `&by=${by}` : ''}`)) : { data: { columns: [], rows: [] } as ReportData };
  return (
    <>
      <div className="-ml-2 mb-1">
        <LinkButton href="/exams/office" size="small" startIcon={<ArrowLeft />}>
          {t('xo.back')}
        </LinkButton>
      </div>
      {data.error !== undefined || sessions.error !== undefined ? (
        <ErrorState message={(data.error ?? sessions.error)!} />
      ) : (
        <OfficeReport report={report} data={data.data!} sessions={(sessions.data ?? []).map((s) => ({ id: s.id, name: s.title }))} sessionId={sessionId} by={by} />
      )}
    </>
  );
}
