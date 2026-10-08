import ScienceOutlined from '@mui/icons-material/ScienceOutlined';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { DeskTable, Pill, Tiles } from '@/components/campus/Desk';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { ResearchKpis, ResearchProject } from '@/lib/campus-life';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.research') };
}

export default async function ResearchPage() {
  await requireSection('research');
  const { t, fmt } = await getI18n();
  const data = await load(async () => {
    const [kpis, projects] = await Promise.all([api<ResearchKpis>('/v1/research/kpis'), api<ResearchProject[]>('/v1/research/projects')]);
    return { kpis, projects };
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
    </>
  );
}
