import type { Metadata } from 'next';
import { LhtLinks } from '@/components/lht/LhtRecordsPage';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LiveBoard } from '@/components/transport/LiveBoard';
import { TransportLinks } from '@/components/transport/TransportLinks';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { LiveBoard as Board } from '@/lib/transport-pass';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('tp.live.title') };
}

/** Every bus on the road now: on the map, with the next stop and the minutes to it, lateness, who is on board, alerts and SOS. */
export default async function TransportLivePage() {
  await requireSection('transport');
  const { t } = await getI18n();
  const board = await load(() => api<Board>('/v1/transport/live'));
  return (
    <>
      <PageHeader
        title={t('tp.live.title')}
        subtitle={t('tp.live.sub')}
        actions={
          <>
            <TransportLinks here="live" />
            <LhtLinks module="transport" here="records" />
          </>
        }
      />
      {board.error !== undefined ? <ErrorState message={board.error} /> : <LiveBoard initial={board.data} />}
    </>
  );
}
