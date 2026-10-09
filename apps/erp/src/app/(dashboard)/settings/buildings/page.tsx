import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { BuildingsAdmin } from '@/components/settings/BuildingsAdmin';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { BuildingsTree } from '@/lib/institution';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.buildings') };
}

/** Settings > Buildings and rooms. */
export default async function BuildingsPage() {
  await requireSection('settings');
  const { t } = await getI18n();
  const data = await load(() => api<BuildingsTree>('/v1/admin/institution/buildings'));
  return (
    <>
      <PageHeader title={t('nav.buildings')} subtitle={t('bld.subtitle')} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <BuildingsAdmin tree={data.data} />}
    </>
  );
}
