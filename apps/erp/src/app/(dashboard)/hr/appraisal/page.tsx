import type { Metadata } from 'next';
import { AppraisalDesk } from '@/components/hr/AppraisalDesk';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { canSee } from '@/lib/access';
import { getI18n } from '@/i18n/server';
import type { Appraisal, AppraisalCategory, AppraisalCycle } from '@/lib/hr-lifecycle';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hl.tab.appraisal') };
}

export default async function AppraisalPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const me = await requireSection('appraisal');
  const { t } = await getI18n();
  const sp = await searchParams;
  const roles = me?.roles ?? [];
  const data = await load(async () => {
    const [cycles, cats] = await Promise.all([api<AppraisalCycle[]>('/v1/hr/appraisal-cycles'), api<{ categories: AppraisalCategory[] }>('/v1/hr/appraisal-categories')]);
    const cycleId = sp.cycle && UUID.test(sp.cycle) && cycles.some((c) => c.id === sp.cycle) ? sp.cycle : (cycles.find((c) => c.status === 'open') ?? cycles[0])?.id ?? null;
    const [mine, appraisals] = cycleId ? await Promise.all([api<Appraisal | null>(`/v1/hr/appraisals/me?cycleId=${cycleId}`), api<Appraisal[]>(`/v1/hr/appraisals?cycleId=${cycleId}`)]) : [null, [] as Appraisal[]];
    return { cycles, cats: cats.categories, cycleId, mine, appraisals };
  });
  return (
    <>
      <PageHeader title={t('nav.appraisal')} subtitle={t('hl.appr.subtitle')} />
      {canSee(roles, 'hr') && <SectionTabs tabs={HR_TABS} label="nav.hr" />}
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
