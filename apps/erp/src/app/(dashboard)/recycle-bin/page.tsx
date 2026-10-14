import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { RecycleBin } from '@/components/records/RecycleBin';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { listSearch, readListState, type BinPage } from '@/lib/records';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.recycleBin') };
}

/** Settings → Recycle bin: deleted records by module, with restore and purge. */
export default async function RecycleBinPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('settings');
  const state = readListState(await searchParams);
  const qs = listSearch(state);
  for (const [k, v] of Object.entries(state.filters)) {
    qs.delete(`f.${k}`);
    if (k === 'module' || k === 'entity') qs.set(k, v);
  }
  qs.set('page', String(state.page));
  qs.set('pageSize', String(state.pageSize));
  const data = await load(() => api<BinPage>(`/v1/recycle-bin?${qs.toString()}`));
  const { t } = await getI18n();
  const canSettings = (me?.roles ?? []).some((r) => r === 'principal' || r === 'tenant_admin');
  return (
    <>
      <PageHeader title={t('nav.recycleBin')} subtitle={data.data ? t('rk.bin.subtitle', { n: data.data.retentionDays }) : undefined} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <RecycleBin data={data.data} state={{ ...state, page: data.data.page }} canSettings={canSettings} />}
    </>
  );
}
