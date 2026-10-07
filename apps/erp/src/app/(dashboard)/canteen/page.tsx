import type { Metadata } from 'next';
import { CanteenDesk } from '@/components/canteen/CanteenDesk';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { CItem } from '@/lib/ops';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.canteen') };
}

export default async function CanteenPage() {
  await requireSection('canteen');
  const items = await load(() => api<CItem[]>('/v1/canteen/items'));
  const { t } = await getI18n();
  const list = items.data ?? [];
  return (
    <>
      <PageHeader title={t('nav.canteen')} subtitle={t('ca.subtitle')} />
      {items.error !== undefined ? (
        <ErrorState message={items.error} />
      ) : (
        <>
          <StatGrid min={120}>
            <StatTile label={t('ca.items')} value={list.length} testId="ca-items" />
            <StatTile label={t('ca.available')} value={list.filter((x) => x.available).length} testId="ca-available" />
          </StatGrid>
          <CanteenDesk items={list} />
        </>
      )}
    </>
  );
}
