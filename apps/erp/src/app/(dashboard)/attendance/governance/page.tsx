import type { Metadata } from 'next';
import { ApprovalRecords, type ApprovalEntity } from '@/components/attendance-desk/ApprovalRecords';
import { AttendanceTabs } from '@/components/attendance-desk/kit';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.attendanceGov') };
}

const TABS = { corrections: 'attendance-corrections', condonations: 'attendance-condonations' } as const satisfies Record<string, ApprovalEntity>;
type Tab = keyof typeof TABS;

/** Attendance approvals: corrections to locked registers and condonation requests (with the condonation fee). */
export default async function AttendanceGovernancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('school');
  const sp = await searchParams;
  const tab: Tab = sp.tab === 'condonations' ? 'condonations' : 'corrections';
  const { t } = await getI18n();
  const records = await loadRecords(TABS[tab], sp);
  return (
    <>
      <PageHeader title={t('nav.attendanceGov')} subtitle={t('agv.subtitle')} />
      <AttendanceTabs value="governance" t={t} />
      <LinkTabs value={tab} label={t('nav.attendanceGov')} items={(Object.keys(TABS) as Tab[]).map((x) => ({ value: x, label: t(`agv.${x}`), href: `/attendance/governance?tab=${x}` }))} />
      {records.error !== undefined ? <ErrorState message={records.error} /> : <ApprovalRecords entity={TABS[tab]} meta={records.data.meta} page={records.data.page} state={records.data.state} />}
    </>
  );
}
