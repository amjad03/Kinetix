import BusinessCenterOutlined from '@mui/icons-material/BusinessCenterOutlined';
import type { Metadata } from 'next';
import { DeskTable, Pill, Tiles } from '@/components/campus/Desk';
import { PageHeader } from '@/components/PageHeader';
import { InternshipsDesk } from '@/components/placements/InternshipsDesk';
import { StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { lakhs, type PlacementDrive, type PlacementStats } from '@/lib/campus-life';
import type { InternshipRow } from '@/lib/pathways-a';
import type { Skill } from '@/lib/skills';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.placements') };
}

/** Roles that move internships on and issue certificates (a head of department only reads), placements.access.ts PLACEMENT_ROLES. */
const PLACEMENT_STAFF = ['principal', 'tenant_admin', 'placement_officer'];

export default async function PlacementsPage() {
  const me = await requireSection('placements');
  const { t, fmt } = await getI18n();
  const data = await load(async () => {
    const [stats, drives] = await Promise.all([api<PlacementStats>('/v1/placements/stats'), api<PlacementDrive[]>('/v1/placements/drives')]);
    return { stats, drives };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { stats, drives } = data.data;
  // The internship register; the skills list lets a skill be picked when linking an internship (it may be out of reach for some roles).
  const [internships, skills] = await Promise.all([load(() => api<InternshipRow[]>('/v1/placements/internships')), load(() => api<Skill[]>('/v1/skills'))]);
  return (
    <>
      <PageHeader title={t('nav.placements')} subtitle={t('pl.subtitle', { year: stats.year })} />
      <Tiles>
        <StatTile label={t('pl.stat.students')} value={fmt.number(stats.activeStudents)} testId="pl-students" />
        <StatTile label={t('pl.stat.registered')} value={fmt.number(stats.registeredStudents)} />
        <StatTile label={t('pl.stat.placed')} value={fmt.number(stats.placedStudents)} caption={`${t('pl.stat.rate')}: ${stats.placementPercent}%`} testId="pl-placed" />
        <StatTile label={t('pl.stat.ctc')} value={lakhs(stats.ctc.median)} unit={t('pl.lakhs')} caption={t('pl.stat.ctcCaption', { highest: lakhs(stats.ctc.highest) })} />
      </Tiles>
      {drives.length === 0 ? (
        <EmptyState icon={<BusinessCenterOutlined />} title={t('pl.empty')}>
          {t('pl.emptyHint')}
        </EmptyState>
      ) : (
        <DeskTable
          title={t('pl.drives')}
          testId="drives-table"
          head={[t('pl.col.drive'), t('pl.col.company'), t('pl.col.role'), t('pl.col.package'), t('pl.col.cgpa'), t('pl.col.date'), t('pl.col.registered'), t('pl.col.status')]}
          rows={drives.map((d) => [d.title, d.company, d.roleTitle, d.ctcLpa === null ? '-' : `${lakhs(d.ctcLpa)} ${t('pl.lakhs')}`, String(d.minCgpa), d.driveDate ? fmt.date(d.driveDate, 'short') : '-', fmt.number(d.registrations), <Pill key="s" label={t(`pl.status.${d.status}` as MessageKey)} tone={d.status === 'open' ? 'success' : d.status === 'cancelled' ? 'error' : 'default'} />])}
        />
      )}
      {stats.byCompany.length > 0 && <DeskTable title={t('pl.byCompany')} head={[t('pl.col.company'), t('pl.stat.placed'), t('pl.stat.ctc')]} rows={stats.byCompany.map((c) => [c.name, fmt.number(c.placed), `${lakhs(c.median)} ${t('pl.lakhs')}`])} />}
      {internships.error !== undefined ? (
        <ErrorState message={internships.error} />
      ) : (
        <InternshipsDesk rows={internships.data} skills={(skills.data ?? []).filter((x) => x.active).map((x) => ({ id: x.id, name: x.name }))} canEdit={(me?.roles ?? []).some((r) => PLACEMENT_STAFF.includes(r))} />
      )}
    </>
  );
}
