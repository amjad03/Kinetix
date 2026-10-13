import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { QualityReport } from '@/components/quality-hub/QualityReport';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { REPORT_IDS, reportKey, type QhReport } from '@/lib/quality-hub';

type Params = Promise<{ report: string }>;
type Search = Promise<{ from?: string; to?: string; status?: string }>;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isReport = (r: string): r is (typeof REPORT_IDS)[number] => (REPORT_IDS as readonly string[]).includes(r);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { report } = await params;
  const { t } = await getI18n();
  return { title: isReport(report) ? t(reportKey(report)) : t('nav.qhReports') };
}

/** A report of the quality group: the URL holds its filters, so it can be shared and saved as a preset. */
export default async function QualityReportPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { report } = await params;
  if (!isReport(report)) notFound();
  await requireSection('qualityHub');
  const sp = await searchParams;
  const filters = { from: sp.from && DAY.test(sp.from) ? sp.from : '', to: sp.to && DAY.test(sp.to) ? sp.to : '', status: sp.status && /^[a-z_]{1,30}$/.test(sp.status) ? sp.status : '' };
  const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  const data = await load(() => api<QhReport>(`/v1/quality-hub/reports/${report}${q.size ? `?${q.toString()}` : ''}`));
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return <QualityReport report={{ ...data.data, id: report }} filters={filters} />;
}
