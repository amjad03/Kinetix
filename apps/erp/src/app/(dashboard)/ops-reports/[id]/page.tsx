import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReportView } from '@/components/campus-ops/ReportView';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { isReportId } from '@/lib/campus-ops';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('cops.reports') };
}

/** The status choices each report's filter offers. */
const STATUSES: Record<string, string[]> = {
  'admissions.register': ['submitted', 'under_review', 'eligible', 'ineligible', 'waitlisted', 'offered', 'accepted', 'declined', 'rejected', 'enrolled', 'withdrawn'],
  'library.circulation': ['open', 'returned'],
  'hostel.outpasses': ['requested', 'approved', 'issued', 'out', 'returned', 'rejected', 'cancelled'],
  'hostel.complaints': ['open', 'in_progress', 'resolved'],
  'transport.compliance': ['active', 'inactive'],
  'library.accession': ['available', 'on_loan', 'in_transit', 'missing', 'damaged', 'binding', 'lost', 'withdrawn'],
  'hostel.mess-bills': ['draft', 'charged'],
  'transport.maintenance': ['scheduled', 'done', 'cancelled'],
  'transport.incidents': ['open', 'resolved'],
  'inventory.stock': ['ok', 'reorder'],
  'assets.register': ['active', 'disposed'],
  'procurement.orders': ['issued', 'partially_received', 'received', 'cancelled'],
};

interface Report {
  id: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null>[];
}
interface Def {
  id: string;
  filters: string[];
}

export default async function OpsReportRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; status?: string }> }) {
  await requireSection('campusOps');
  const { id } = await params;
  if (!isReportId(id)) notFound();
  const sp = await searchParams;
  const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const values = { from: day(sp.from), to: day(sp.to), status: sp.status && /^[a-z_]{1,40}$/.test(sp.status) ? sp.status : undefined };
  const q = new URLSearchParams(Object.entries(values).filter((e): e is [string, string] => !!e[1]));
  const [defs, report] = await Promise.all([load(() => api<Def[]>('/v1/ops-reports')), load(() => api<Report>(`/v1/ops-reports/${id}?${q.toString()}`))]);
  if (!report.data) return <ErrorState message={report.error ?? ''} />;
  const def = defs.data?.find((d) => d.id === id);
  return <ReportView id={id} columns={report.data.columns} rows={report.data.rows} filters={def?.filters ?? []} statuses={STATUSES[id] ?? []} values={values} />;
}
