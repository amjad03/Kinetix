import ScienceOutlined from '@mui/icons-material/ScienceOutlined';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { DeskTable, Pill, Tiles } from '@/components/campus/Desk';
import { PageHeader } from '@/components/PageHeader';
import { ResearchOfficeDesk } from '@/components/research/ResearchOfficeDesk';
import { StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { ResearchKpis, ResearchProject } from '@/lib/campus-life';
import type { DatasetRow, OfficeSummary, ScholarRow, SupervisorRow, ThesisRow } from '@/lib/pathways-a';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.research') };
}

/** Roles that decide (a head of department only reads), research.controller.ts RESEARCH_ROLES. */
const RESEARCH_STAFF = ['principal', 'tenant_admin', 'research_coordinator'];

export default async function ResearchPage() {
  const me = await requireSection('research');
  const { t, fmt } = await getI18n();
  const data = await load(async () => {
    const [kpis, projects] = await Promise.all([api<ResearchKpis>('/v1/research/kpis'), api<ResearchProject[]>('/v1/research/projects')]);
    return { kpis, projects };
  });
  // The research office: summary, supervisors, scholars, theses and datasets.
  const desk = await load(async () => {
    const [summary, supervisors, scholars, theses, datasets] = await Promise.all([
      api<OfficeSummary>('/v1/research/office/summary'),
      api<SupervisorRow[]>('/v1/research/supervisors'),
      api<ScholarRow[]>('/v1/research/scholars'),
      api<ThesisRow[]>('/v1/research/theses'),
      api<DatasetRow[]>('/v1/research/datasets'),
    ]);
    return { summary, supervisors, scholars, theses, datasets };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { kpis: k, projects } = data.data;
  return (
    <>
      <PageHeader title={t('nav.research')} subtitle={t('rs.subtitle', { from: k.fromYear, to: k.toYear })} />
      <Tiles>
        <StatTile label={t('rs.kpi.projects')} value={fmt.number(k.projects)} />
        <StatTile label={t('rs.kpi.publications')} value={fmt.number(k.publications.total)} caption={t('rs.kpi.publicationsCaption', { indexed: k.publications.indexed, perTeacher: k.publications.perTeacher })} testId="rs-publications" />
        <StatTile label={t('rs.kpi.grants')} value={fmt.rupeesShort(k.grants.totalSanctionedPaise)} caption={t('rs.kpi.grantsCaption', { count: k.grants.count })} />
        <StatTile label={t('rs.kpi.patents')} value={fmt.number(k.patents.total)} caption={t('rs.kpi.patentsCaption', { granted: k.patents.granted })} />
      </Tiles>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }} data-testid="naac">
        {t('rs.naac')}: {Object.entries(k.naac).map(([id, v]) => `${id} = ${v.value}`).join(', ')}
      </Typography>
      {projects.length === 0 ? (
        <EmptyState icon={<ScienceOutlined />} title={t('rs.empty')}>
          {t('rs.emptyHint')}
        </EmptyState>
      ) : (
        <DeskTable
          title={t('rs.projects')}
          testId="projects-table"
          head={[t('rs.col.code'), t('rs.col.title'), t('rs.col.kind'), t('rs.col.starts'), t('rs.col.status')]}
          rows={projects.map((p) => [p.code, p.title, t(`rs.kind.${p.kind}` as MessageKey), fmt.date(p.startsOn, 'short'), <Pill key="s" label={t(`rs.status.${p.status}` as MessageKey)} tone={p.status === 'active' ? 'success' : 'default'} />])}
        />
      )}
      {desk.error !== undefined ? <ErrorState message={desk.error} /> : <ResearchOfficeDesk data={desk.data} canEdit={(me?.roles ?? []).some((r) => RESEARCH_STAFF.includes(r))} />}
    </>
  );
}
