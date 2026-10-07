import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { TransportDesk } from '@/components/transport/TransportDesk';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { TCompliance, TDriver, TRoute, TTripRow, TVehicle } from '@/lib/ops';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.transport') };
}

export default async function TransportPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('transport');
  const { tab } = await searchParams;
  const [routes, vehicles, drivers, trips, compliance] = await Promise.all([
    load(() => api<TRoute[]>('/v1/transport/routes')),
    load(() => api<TVehicle[]>('/v1/transport/vehicles')),
    load(() => api<TDriver[]>('/v1/transport/drivers')),
    load(() => api<TTripRow[]>('/v1/transport/trips')),
    load(() => api<TCompliance>('/v1/transport/compliance')),
  ]);
  const { t } = await getI18n();
  const failed = routes.error ?? vehicles.error ?? drivers.error ?? trips.error ?? compliance.error;
  const r = routes.data ?? [];
  const tr = trips.data ?? [];
  const due = compliance.data?.items ?? [];

  return (
    <>
      <PageHeader title={t('nav.transport')} subtitle={t('tr.subtitle')} />
      {failed !== undefined ? (
        <ErrorState message={failed} />
      ) : (
        <>
          <StatGrid min={120}>
            <StatTile label={t('tr.routes')} value={r.filter((x) => x.active).length} caption={t('tr.stopsN', { n: r.reduce((s, x) => s + x.stops, 0) })} testId="tr-routes" />
            <StatTile label={t('tr.riders')} value={r.reduce((s, x) => s + x.riders, 0)} testId="tr-riders" />
            <StatTile label={t('tr.vehicles')} value={vehicles.data!.length} testId="tr-vehicles" />
            <StatTile label={t('tr.live')} value={tr.filter((x) => x.trip.status === 'running').length} tone="live" testId="tr-live" />
            <StatTile label={t('tr.expiring')} value={due.length} tone={due.length ? 'warning' : 'default'} caption={due.some((x) => x.expired) ? t('tr.someExpired') : undefined} testId="tr-expiring" />
          </StatGrid>
          <TransportDesk routes={r} vehicles={vehicles.data!} drivers={drivers.data!} trips={tr} compliance={compliance.data!} initialTab={tab ?? 'routes'} />
        </>
      )}
    </>
  );
}
