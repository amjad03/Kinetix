import type { Metadata } from 'next';
import { PlacementReport } from '@/components/placements/PlacementReport';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, getMe, load, requireSection } from '@/lib/api';
import type { ReportData, ReportList } from '@/lib/placements-depth';
import { param } from '@/lib/procurement-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('pd.reports') };
}

/**
 * Placement reports for a year: placement by programme, the NIRF graduation outcome table with median salary,
 * company-wise results, the offer list, internships, progression to higher studies, training and feedback; each on
 * screen and as CSV or Excel.
 */
export default async function PlacementReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // The IQAC (quality officer) reads these tables for NAAC 5.2, NIRF and AISHE without the rest of the placement desk.
  const me = await getMe().catch(() => null);
  if (!me?.roles.includes('quality_officer')) await requireSection('placements');
  const sp = await searchParams;
  const { t } = await getI18n();
  const list = await load(() => api<ReportList>('/v1/placements/reports'));
  if (list.error !== undefined) return <ErrorState message={list.error} />;
  const ids = list.data.reports.map((r) => r.id);
  const asked = param(sp, 'report') ?? '';
  const id = ids.includes(asked) ? asked : (ids[0] ?? 'branch');
  const thisYear = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 4));
  const y = Number(param(sp, 'year'));
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : thisYear;
  const data = await load(() => api<ReportData>(`/v1/placements/reports/${id}?year=${year}`));
  return (
    <>
      <PageHeader title={t('pd.reports')} subtitle={t('pd.rp.subtitle')} actions={<LinkButton href={`/api/download?kind=placement-brochure&year=${year}`} variant="outlined" data-testid="pl-brochure">{t('pp.brochure', { year })}</LinkButton>} />
      <LinkTabs value={id} label={t('pd.reports')} items={ids.map((r) => ({ value: r, label: t(`pd.rp.${r as 'branch'}`), href: `/placements/reports?report=${r}&year=${year}` }))} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <PlacementReport data={data.data} years={Array.from({ length: 6 }, (_, i) => thisYear - i)} criteria={list.data.criteria} />}
    </>
  );
}
