import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DeskReport } from '@/components/fee-desk/DeskReport';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import { reportOf, type Row } from '@/lib/fee-desk';

export async function generateMetadata({ params }: { params: Promise<{ report: string }> }): Promise<Metadata> {
  const { report } = await params;
  return { title: (await getI18n()).t(`fd.rep.${report}` as MessageKey) };
}

const SAFE = /^[0-9a-zA-Z_-]{1,40}$/;

/** One accounts report; its filters live in the URL, so it can be bookmarked, shared and saved as a preset. */
export default async function DeskReportPage({ params, searchParams }: { params: Promise<{ report: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection('finance');
  const { report } = await params;
  const spec = reportOf(report);
  if (!spec) notFound();
  const sp = await searchParams;
  const query: Record<string, string> = {};
  for (const f of spec.filters) if (sp[f] && SAFE.test(sp[f])) query[f] = sp[f];
  const { t } = await getI18n();
  const data = await load(async () => ({
    report: await api<{ rows: Row[]; totals: Record<string, number> }>(`/v1/fee-accounts/reports/${report}?${new URLSearchParams(query)}`),
    students: spec.filters.includes('studentId') ? await api<{ id: string; student: string }[]>('/v1/fee-accounts/list/accounts') : undefined,
  }));
  if (data.error !== undefined) return <ErrorState title={t(`fd.rep.${report}` as MessageKey)} message={data.error} />;
  return <DeskReport spec={spec} rows={data.data.report.rows.map((r, i) => ({ ...r, id: String(r.id ?? i) }))} totals={data.data.report.totals} query={query} students={data.data.students?.map((s) => ({ id: s.id, student: s.student }))} />;
}
