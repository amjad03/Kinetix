import type { Metadata } from 'next';
import { AppraisalDesk } from '@/components/hr/AppraisalDesk';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { HrList } from '@/components/hr/HrList';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { canSee } from '@/lib/access';
import { getI18n } from '@/i18n/server';
import type { Appraisal, AppraisalCategory, AppraisalCycle } from '@/lib/hr-lifecycle';
import { loadRecords } from '@/lib/records-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hl.tab.appraisal') };
}

export default async function AppraisalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('appraisal');
  const { t } = await getI18n();
  const sp = await searchParams;
  const roles = me?.roles ?? [];
  const isHr = canSee(roles, 'hr');
  const view = isHr && sp.view === 'cycles' ? 'cycles' : 'reviews';
  const head = (
    <>
      <PageHeader title={t('nav.appraisal')} subtitle={t('hl.appr.subtitle')} />
      {isHr && <SectionTabs tabs={HR_TABS} label="nav.hr" />}
      {isHr && (
        <LinkTabs
          value={view}
          label={t('nav.appraisal')}
          items={[
            { value: 'reviews', href: '/hr/appraisal', label: t('hk.appr.view.reviews') },
            { value: 'cycles', href: '/hr/appraisal?view=cycles', label: t('rk.entity.appraisal-cycles') },
          ]}
        />
      )}
    </>
  );
  if (view === 'cycles') {
    const list = await loadRecords('appraisal-cycles', sp);
    return (
      <>
        {head}
        {list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity="appraisal-cycles" data={list.data} extraParams={{ view }} />}
      </>
    );
  }
  const cycleParam = typeof sp.cycle === 'string' ? sp.cycle : undefined;
  const data = await load(async () => {
    const [cycles, cats] = await Promise.all([api<AppraisalCycle[]>('/v1/hr/appraisal-cycles'), api<{ categories: AppraisalCategory[] }>('/v1/hr/appraisal-categories')]);
    const cycleId = cycleParam && UUID.test(cycleParam) && cycles.some((c) => c.id === cycleParam) ? cycleParam : (cycles.find((c) => c.status === 'open') ?? cycles[0])?.id ?? null;
    const [mine, appraisals] = cycleId ? await Promise.all([api<Appraisal | null>(`/v1/hr/appraisals/me?cycleId=${cycleId}`), api<Appraisal[]>(`/v1/hr/appraisals?cycleId=${cycleId}`)]) : [null, [] as Appraisal[]];
    return { cycles, cats: cats.categories, cycleId, mine, appraisals };
  });
  return (
    <>
      {head}
      {data.error !== undefined ? (
        <ErrorState message={data.error} />
      ) : (
        <AppraisalDesk
          cycles={data.data.cycles}
          cycleId={data.data.cycleId}
          cats={data.data.cats}
          mine={data.data.mine}
          appraisals={data.data.appraisals}
          viewer={{ userId: me?.id ?? '', reviewer: true, principal: roles.includes('principal') || roles.includes('tenant_admin'), hr: canSee(roles, 'hr') }}
        />
      )}
    </>
  );
}
