import type { Metadata } from 'next';
import { LhtLinks } from '@/components/lht/LhtRecordsPage';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { SafetyBoard } from '@/components/transport/SafetyBoard';
import { TransportLinks } from '@/components/transport/TransportLinks';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Optimisation, Safety, SlabPreview } from '@/lib/transport-pass';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('tp.safe.title') };
}

/** Safety and capacity: the school-bus safety matrix, capacity against occupancy with suggestions, fares by distance. */
export default async function TransportSafetyPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('transport');
  const { t } = await getI18n();
  const { tab } = await searchParams;
  const data = await load(async () => {
    const [safety, opt, slabs] = await Promise.all([
      api<Safety>('/v1/transport/safety'),
      api<Optimisation>('/v1/transport/optimisation'),
      // A preview only (nothing is saved); no slabs yet answers 409, shown as "add the slabs first".
      api<SlabPreview>('/v1/transport/fare-slabs/apply', { method: 'POST', body: { dryRun: true } }).catch(() => null),
    ]);
    return { safety, opt, slabs };
  });
  return (
    <>
      <PageHeader
        title={t('tp.safe.title')}
        subtitle={t('tp.safe.sub')}
        actions={
          <>
            <TransportLinks here="safety" />
            <LhtLinks module="transport" here="records" />
          </>
        }
      />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <SafetyBoard safety={data.data.safety} opt={data.data.opt} slabs={data.data.slabs} initialTab={tab === 'capacity' || tab === 'fares' ? tab : 'safety'} />}
    </>
  );
}
