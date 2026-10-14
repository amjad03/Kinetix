import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Archive, FileSpreadsheet, FileStack, FolderArchive, ListChecks } from 'lucide-react';
import { BenchmarksDesk, type BenchRow } from '@/components/accreditation/BenchmarksDesk';
import { CriteriaTree } from '@/components/accreditation/CriteriaTree';
import { DvvDesk } from '@/components/accreditation/DvvDesk';
import { Readiness } from '@/components/accreditation/Readiness';
import { TasksDesk } from '@/components/accreditation/TasksDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { FormRow, LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, ApiError, load, requireSection } from '@/lib/api';
import { safe } from '@/lib/depth-ui';
import { accDownload, cycleOptions, exportsOf, type DvvRow, type People, type Readiness as ReadinessData } from '@/lib/accreditation-ui';

const TABS = ['readiness', 'criteria', 'tasks', 'dvv', 'benchmarks'] as const;
type Tab = (typeof TABS)[number];
const FW = /^[a-z0-9-]{3,30}$/;
const MANAGE = ['tenant_admin', 'principal', 'quality_officer', 'hod'];
const ADMIN = ['tenant_admin', 'principal', 'quality_officer'];
const EXPORT_ICON = { ssr: FolderArchive, aqar: FileStack, xlsx: FileSpreadsheet, pack: Archive, dvv: ListChecks } as const;

interface TreeMetric {
  code: string;
  title: string;
  unit: string;
  bench: number | null;
  defaultBench: number | null;
  dir: 'high' | 'low';
}
interface Tree {
  criteria: { indicators: { metrics: TreeMetric[] }[] }[];
}

export async function generateMetadata({ params }: { params: Promise<{ body: string }> }): Promise<Metadata> {
  const { body } = await params;
  return { title: `${(await getI18n()).t('acx.h.title')} · ${body.toUpperCase()}` };
}

/** One framework: readiness, the criteria tree, tasks, DVV and benchmarks, with the official exports. */
export default async function FrameworkPage({ params, searchParams }: { params: Promise<{ body: string }>; searchParams: Promise<{ cycle?: string; tab?: string }> }) {
  const { body } = await params;
  if (!FW.test(body)) notFound();
  const me = await requireSection('accreditation');
  const { t } = await getI18n();
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'readiness';
  const canManage = !!me?.roles.some((r) => MANAGE.includes(r));
  const canAdmin = !!me?.roles.some((r) => ADMIN.includes(r));
  const q = sp.cycle && /^\d{4}-\d{2}$/.test(sp.cycle) ? `?cycle=${sp.cycle}` : '';
  const data = await load(async () => {
    try {
      return { r: await api<ReadinessData>(`/v1/accreditation/${body}/readiness${q}`) };
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  if (!data.data) notFound();
  const { r } = data.data;
  const fw = r.framework.key;
  const cyc = `cycle=${r.cycle}`;
  const extra =
    tab === 'tasks'
      ? { people: canManage ? await safe(api<People>('/v1/accreditation/people'), null) : null }
      : tab === 'dvv'
        ? { dvv: await safe(api<DvvRow[]>(`/v1/accreditation/dvv?framework=${fw}&${cyc}`), []) }
        : tab === 'benchmarks'
          ? { tree: await safe(api<Tree>(`/v1/accreditation/frameworks/${fw}`), null) }
          : {};
  const scopes = [
    ...r.criteria.map((c) => ({ value: c.id, label: c.id === 'EP' ? t('acx.r.ep') : `${t('acx.r.criterion')} ${c.id}: ${c.title}` })),
    ...r.metrics.map((m) => ({ value: m.code, label: `${m.code} ${m.title.length > 80 ? `${m.title.slice(0, 80)}…` : m.title}` })),
  ];
  const benchRows: BenchRow[] = (extra.tree?.criteria ?? []).flatMap((c) => c.indicators.flatMap((k) => k.metrics)).filter((m) => m.defaultBench !== null).map((m) => ({ code: m.code, title: m.title, unit: m.unit, bench: m.bench, catalogue: m.defaultBench, dir: m.dir }));
  const tabs = TABS.filter((x) => x !== 'benchmarks' || r.framework.scoring !== 'none').map((x) => ({ value: x, label: t(`acx.tab.${x}` as MessageKey), href: `/accreditation/${body}?${cyc}&tab=${x}` }));

  return (
    <>
      <PageHeader title={r.framework.title} subtitle={`${r.framework.variant} · ${t('acx.f.period', { from: r.window[0], to: r.window[r.window.length - 1] })}`} actions={<UrlSelect label={t('acx.f.cycle')} param="cycle" value={r.cycle} options={cycleOptions(r.cycle)} minWidth={150} testId="acx-cycle" />} />
      <FormRow labelled={false} className="mb-4 items-end" data-testid="acx-exports">
        {exportsOf(r.framework)
          .filter((x) => canAdmin || x === 'xlsx' || x === 'dvv')
          .map((x) => {
            const Icon = EXPORT_ICON[x];
            return (
              <a key={x} href={accDownload(fw, x, r.cycle)} className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-[13px] font-medium text-foreground no-underline shadow-xs hover:bg-accent" data-testid={`acx-export-${x}`}>
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {t((x === 'xlsx' ? `acx.x.xlsx.${r.framework.body}` : `acx.x.${x}`) as MessageKey)}
              </a>
            );
          })}
        <span className="ml-auto max-w-[520px] text-xs text-muted-foreground">{r.framework.source}</span>
      </FormRow>
      <div className="mb-4">
        <LinkTabs value={tab} label={t('acx.f.views')} items={tabs} />
      </div>
      {tab === 'readiness' && <Readiness r={r} fw={fw} canManage={canManage} />}
      {tab === 'criteria' && <CriteriaTree fw={fw} cycle={r.cycle} scoring={r.framework.scoring} criteria={r.criteria} metrics={r.metrics} />}
      {tab === 'tasks' && <TasksDesk fw={fw} cycle={r.cycle} tasks={r.tasks} people={extra.people ?? null} scopes={scopes} canManage={canManage} />}
      {tab === 'dvv' && <DvvDesk fw={fw} cycle={r.cycle} rows={extra.dvv ?? []} codes={r.metrics.map((m) => ({ value: m.code, label: m.code }))} canManage={canAdmin} />}
      {tab === 'benchmarks' && (canAdmin ? <BenchmarksDesk fw={fw} rows={benchRows} /> : <p className="text-[13px] text-muted-foreground">{t('acx.s.adminOnly')}</p>)}
    </>
  );
}
