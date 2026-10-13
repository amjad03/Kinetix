import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { HrReports } from '@/components/hr/HrReports';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { HR_REPORTS, type HrReport, type HrReportKind } from '@/lib/hr-flow';
import type { AdminDepartment } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hf.tab.reports') };
}

/** Staff strength, attendance, leave, payroll, statutory, Form 16, appraisal, FDP and attrition reports. */
export default async function HrReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection('hr');
  const { t } = await getI18n();
  const sp = await searchParams;
  const kind: HrReportKind = HR_REPORTS.includes(sp.kind as HrReportKind) ? (sp.kind as HrReportKind) : 'staff-strength';
  const q = new URLSearchParams();
  for (const k of ['month', 'fy', 'year', 'departmentId', 'cycleId']) if (sp[k]) q.set(k, sp[k]!);
  const data = await load(() => Promise.all([api<HrReport>(`/v1/hr/reports/${kind}?${q}`), api<AdminDepartment[]>('/v1/admin/departments').catch(() => [] as AdminDepartment[])]));
  if (data.error !== undefined) {
    return (
      <>
        <PageHeader title={t('hf.tab.reports')} />
        <SectionTabs tabs={HR_TABS} label="nav.hr" />
        <ErrorState message={data.error} />
      </>
    );
  }
  return (
    <>
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      <HrReports report={data.data[0]} departments={data.data[1].map((d) => ({ id: d.id, name: d.name }))} />
    </>
  );
}
