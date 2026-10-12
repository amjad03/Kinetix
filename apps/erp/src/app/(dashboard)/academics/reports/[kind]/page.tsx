import type { Metadata } from 'next';
import type { MessageKey } from '@/i18n/messages';
import { notFound } from 'next/navigation';
import { AcademicReport } from '@/components/academics/AcademicReport';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { REPORT_FILTERS, REPORT_KINDS, type Directory, type ReportData, type ReportKind } from '@/lib/academics';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  return { title: (await getI18n()).t(`acad.report.${REPORT_KINDS.includes(kind as ReportKind) ? kind : 'strength'}` as MessageKey) };
}

export default async function ReportRoute({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection('academics');
  const { kind } = await params;
  if (!REPORT_KINDS.includes(kind as ReportKind)) notFound();
  const sp = await searchParams;
  const q: Record<string, string> = {};
  for (const k of REPORT_FILTERS[kind as ReportKind]) if (sp[k]) q[k] = sp[k]!;
  const res = await load(async () => {
    const [data, directory] = await Promise.all([api<ReportData>(`/v1/academics/reports/${kind}?${new URLSearchParams(q).toString()}`), api<Directory>('/v1/academics/directory')]);
    return { data, directory };
  });
  if (res.error !== undefined) return <ErrorState message={res.error} />;
  return <AcademicReport kind={kind as ReportKind} data={res.data.data} q={q} directory={res.data.directory} />;
}
