import type { Metadata } from 'next';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { MetricWorkbench } from '@/components/accreditation/MetricWorkbench';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { getI18n } from '@/i18n/server';
import { api, ApiError, getMe, load } from '@/lib/api';
import { safe } from '@/lib/depth-ui';
import { cycleOptions, type MetricDetail, type People } from '@/lib/accreditation-ui';

const FW = /^[a-z0-9-]{3,30}$/;
const CODE = /^[A-Za-z0-9.-]{1,24}$/;
const MANAGE = ['tenant_admin', 'principal', 'quality_officer', 'hod', 'accreditation_reviewer'];

export async function generateMetadata({ params }: { params: Promise<{ body: string; code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: `${(await getI18n()).t('acx.m.title')} ${decodeURIComponent(code)}` };
}

/** The metric workbench: data grid, template rows, ERP records, evidence, assignment, comments and DVV for one metric. */
export default async function MetricPage({ params, searchParams }: { params: Promise<{ body: string; code: string }>; searchParams: Promise<{ cycle?: string }> }) {
  const { body, code: raw } = await params;
  const code = decodeURIComponent(raw);
  if (!FW.test(body) || !CODE.test(code)) notFound();
  const me = await getMe();
  const { t } = await getI18n();
  const sp = await searchParams;
  const q = sp.cycle && /^\d{4}-\d{2}$/.test(sp.cycle) ? `?cycle=${sp.cycle}` : '';
  const canManage = me.roles.some((r) => MANAGE.includes(r));
  const data = await load(async () => {
    try {
      return await api<MetricDetail>(`/v1/accreditation/${body}/metrics/${encodeURIComponent(code)}${q}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  if (!data.data) notFound();
  const d = data.data;
  const people = canManage ? await safe(api<People>('/v1/accreditation/people'), null) : null;
  return (
    <>
      <NextLink href={canManage ? `/accreditation/${d.framework.key}?cycle=${d.cycle}&tab=criteria#c-${d.metric.criterion}` : '/accreditation/my-tasks'} className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted-foreground no-underline hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {canManage ? d.framework.title : t('acx.my.title')}
      </NextLink>
      <PageHeader title={`${t('acx.m.title')} ${d.metric.code}`} subtitle={`${d.framework.title} · ${t('acx.f.period', { from: d.window[0], to: d.window[d.window.length - 1] })}`} actions={<UrlSelect label={t('acx.f.cycle')} param="cycle" value={d.cycle} options={cycleOptions(d.cycle)} minWidth={150} />} />
      <MetricWorkbench d={d} fw={d.framework.key} me={{ id: me.id, canManage: me.roles.some((r) => ['tenant_admin', 'principal', 'quality_officer'].includes(r)) }} people={people} />
    </>
  );
}
