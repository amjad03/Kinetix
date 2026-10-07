import type { Metadata } from 'next';
import { AssetsDesk } from '@/components/assets/AssetsDesk';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { formatRupees } from '@/lib/money';
import { getI18n } from '@/i18n/server';
import type { Asset, MaintDue } from '@/lib/ops';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.assets') };
}

export default async function AssetsPage() {
  await requireSection('assets');
  const [assets, due] = await Promise.all([load(() => api<Asset[]>('/v1/assets')), load(() => api<MaintDue[]>('/v1/assets/maintenance-due'))]);
  const { t } = await getI18n();
  const a = assets.data ?? [];
  const live = a.filter((x) => x.status !== 'disposed');
  const failed = assets.error ?? due.error;

  return (
    <>
      <PageHeader title={t('nav.assets')} subtitle={t('as.subtitle')} />
      {failed !== undefined ? (
        <ErrorState message={failed} />
      ) : (
        <>
          <StatGrid min={120}>
            <StatTile label={t('as.registered')} value={live.length} testId="as-count" />
            <StatTile label={t('as.bookValue')} value={formatRupees(live.reduce((s, x) => s + x.bookValuePaise, 0))} testId="as-book" />
            <StatTile label={t('as.inMaintenance')} value={a.filter((x) => x.status === 'in_maintenance').length} testId="as-maint" />
            <StatTile label={t('as.serviceDue')} value={due.data!.length} tone={due.data!.length ? 'warning' : 'default'} testId="as-due" />
          </StatGrid>
          <AssetsDesk assets={a} due={due.data!} />
        </>
      )}
    </>
  );
}
