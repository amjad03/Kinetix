import type { Metadata } from 'next';
import NextLink from 'next/link';
import { DeskTable, Pill, Tiles } from '@/components/campus/Desk';
import { PageHeader } from '@/components/PageHeader';
import { ResearchList } from '@/components/research/ResearchLists';
import { OrcidImport, ResearchReports, type FacultyRow, type NaacC3, type NirfRp, type Profile } from '@/components/research/ResearchReports';
import { ResearchOfficeDesk } from '@/components/research/ResearchOfficeDesk';
import { StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { safe } from '@/lib/depth-ui';
import type { ResearchKpis, ResearchProject } from '@/lib/campus-life';
import type { DatasetRow, OfficeSummary, ScholarRow, SupervisorRow, ThesisRow } from '@/lib/pathways-a';
import type { RecordsPage } from '@/lib/records';
import { loadRecords } from '@/lib/records-server';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';

import { FlaskConical as ScienceOutlined } from 'lucide-react';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.research') };
}

/** Roles that decide (a head of department only reads), research.controller.ts RESEARCH_ROLES. */
const RESEARCH_STAFF = ['principal', 'tenant_admin', 'research_coordinator'];

const VIEWS = ['overview', 'outputs', 'funding', 'collab', 'scholars', 'facilities', 'reports'] as const;
type View = (typeof VIEWS)[number];
/** The registers of each view, in tab order. */
const LISTS: Partial<Record<View, string[]>> = {
  outputs: ['research-publications', 'research-patents', 'research-conferences', 'research-recognitions'],
  funding: ['research-calls', 'research-proposals', 'research-projects', 'research-grants', 'grant-ucs', 'research-seed-grants'],
  collab: ['research-consultancies', 'research-mous', 'research-mou-activities'],
  scholars: ['research-scholars', 'scholar-dc-meetings', 'scholar-coursework'],
  facilities: ['research-equipment', 'research-equipment-usage', 'research-ethics'],
};

/** Each register's name in the list switcher. */
const LIST_LABEL: Record<string, MessageKey> = {
  'research-publications': 'rsx.list.publications',
  'research-patents': 'rsx.list.patents',
  'research-conferences': 'rsx.list.conferences',
  'research-recognitions': 'rsx.list.recognitions',
  'research-calls': 'rsx.list.calls',
  'research-proposals': 'rsx.list.proposals',
  'research-projects': 'rsx.list.projects',
  'research-grants': 'rsx.list.grants',
  'grant-ucs': 'rsx.list.ucs',
  'research-seed-grants': 'rsx.list.seed',
  'research-consultancies': 'rsx.list.consultancy',
  'research-mous': 'rsx.list.mous',
  'research-mou-activities': 'rsx.list.activities',
  'research-scholars': 'rsx.list.scholars',
  'scholar-dc-meetings': 'rsx.list.dc',
  'scholar-coursework': 'rsx.list.coursework',
  'research-equipment': 'rsx.list.equipment',
  'research-equipment-usage': 'rsx.list.usage',
  'research-ethics': 'rsx.list.ethics',
};

type Sp = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * The research office: an overview with what needs attention, the registers (outputs and IPR, funding from calls to
 * utilisation certificates, consultancy and collaborations, scholars, facilities and ethics) as record kit lists, and
 * reports (faculty research profile, NIRF research and professional practice, NAAC criterion 3).
 */
export default async function ResearchPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const me = await requireSection('research');
  const sp = await searchParams;
  const { t } = await getI18n();
  const view: View = VIEWS.includes(one(sp.view) as View) ? (one(sp.view) as View) : 'overview';
  const tabs = (
    <LinkTabs
      value={view}
      label={t('nav.research')}
      items={VIEWS.map((v) => ({ value: v, label: t(`rsx.view.${v}` as MessageKey), href: v === 'overview' ? '/research' : `/research?view=${v}` }))}
    />
  );

  const lists = LISTS[view];
  if (lists) {
    const entity = lists.includes(one(sp.list) ?? '') ? one(sp.list)! : lists[0];
    const records = await loadRecords(entity, sp);
    const faculty = entity === 'research-publications' ? await safe(api<FacultyRow[]>('/v1/research/reports/faculty'), []) : [];
    return (
      <>
        <PageHeader title={t('nav.research')} subtitle={t(`rsx.viewSub.${view}` as MessageKey)} />
        {tabs}
        <nav aria-label={t(`rsx.view.${view}` as MessageKey)} className="-mt-3 mb-4 flex flex-wrap gap-2" data-testid="rsx-lists">
          {lists.map((l) => (
            <NextLink
              key={l}
              href={`/research?view=${view}&list=${l}`}
              aria-current={l === entity ? 'page' : undefined}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] no-underline ${l === entity ? 'border-transparent bg-teal-soft font-semibold text-teal-ink' : 'bg-card text-foreground hover:bg-accent'}`}
            >
              {t(LIST_LABEL[l])}
            </NextLink>
          ))}
        </nav>
        {records.error !== undefined ? (
          <ErrorState message={records.error} />
        ) : (
          <ResearchList entity={entity} meta={records.data.meta} page={records.data.page} state={records.data.state} extraParams={{ view, list: entity }} toolbar={entity === 'research-publications' && records.data.meta.can.write ? <OrcidImport key="orcid" faculty={faculty.map((f) => ({ value: f.id, label: f.name }))} /> : undefined} />
        )}
      </>
    );
  }

  if (view === 'reports') {
    const user = one(sp.user);
    const userId = user && /^[0-9a-f-]{36}$/i.test(user) ? user : null;
    const data = await load(async () => {
      const [faculty, nirf, naac, profile] = await Promise.all([
        api<FacultyRow[]>('/v1/research/reports/faculty'),
        api<NirfRp>('/v1/research/reports/nirf-rp'),
        api<NaacC3>('/v1/research/reports/naac-c3'),
        userId ? safe(api<Profile>(`/v1/research/reports/faculty-profile?userId=${userId}`), null) : Promise.resolve(null),
      ]);
      return { faculty, nirf, naac, profile };
    });
    return (
      <>
        <PageHeader title={t('nav.research')} subtitle={t('rsx.viewSub.reports')} />
        {tabs}
        {data.error !== undefined ? <ErrorState message={data.error} /> : <ResearchReports faculty={data.data.faculty} userId={userId} profile={data.data.profile} nirf={data.data.nirf} naac={data.data.naac} />}
      </>
    );
  }

  const { fmt } = await getI18n();
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
  // What needs attention: calls closing soon, ethics approvals running out, doctoral committees overdue, MoUs expiring.
  const count = (path: string) => safe(api<RecordsPage>(path).then((p) => p.total), 0);
  const [callsDue, ethicsExpiring, dcOverdue, mousExpiring] = await Promise.all([count('/v1/records/research-calls?f.due=next_14_days&pageSize=10'), count('/v1/records/research-ethics?f.validity=expiring&pageSize=10'), count('/v1/records/research-scholars?f.dcDue=overdue&pageSize=10'), count('/v1/records/research-mous?f.validity=expiring&pageSize=10')]);
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { kpis: k, projects } = data.data;
  const attention: [MessageKey, number, string][] = [
    ['rsx.att.calls', callsDue, '/research?view=funding&list=research-calls&f.due=next_14_days'],
    ['rsx.att.ethics', ethicsExpiring, '/research?view=facilities&list=research-ethics&f.validity=expiring'],
    ['rsx.att.dc', dcOverdue, '/research?view=scholars&list=research-scholars&f.dcDue=overdue'],
    ['rsx.att.mous', mousExpiring, '/research?view=collab&list=research-mous&f.validity=expiring'],
  ];
  return (
    <>
      <PageHeader title={t('nav.research')} subtitle={t('rs.subtitle', { from: String(k.fromYear), to: String(k.toYear) })} />
      {tabs}
      <Tiles>
        <StatTile label={t('rs.kpi.projects')} value={fmt.number(k.projects)} />
        <StatTile label={t('rs.kpi.publications')} value={fmt.number(k.publications.total)} caption={t('rs.kpi.publicationsCaption', { indexed: k.publications.indexed, perTeacher: k.publications.perTeacher })} testId="rs-publications" />
        <StatTile label={t('rs.kpi.grants')} value={fmt.rupeesShort(k.grants.totalSanctionedPaise)} caption={t('rs.kpi.grantsCaption', { count: k.grants.count })} />
        <StatTile label={t('rs.kpi.patents')} value={fmt.number(k.patents.total)} caption={t('rs.kpi.patentsCaption', { granted: k.patents.granted })} />
      </Tiles>
      <section aria-label={t('rsx.att.title')} className="mb-6 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))' }} data-testid="rsx-attention">
        {attention.map(([label, n, href]) => (
          <NextLink key={label} href={href} className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-[13px] no-underline ${n > 0 ? 'bg-amber-soft text-amber-ink' : 'bg-card text-muted-foreground'}`}>
            <span>{t(label)}</span>
            <b className="text-lg tabular-nums">{fmt.number(n)}</b>
          </NextLink>
        ))}
      </section>
      <p className="text-[13px] leading-[19px] text-muted-foreground mb-6" data-testid="naac">
        {t('rs.naac')}: {Object.entries(k.naac).map(([id, v]) => `${id} = ${v.value}`).join(', ')}
      </p>
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
