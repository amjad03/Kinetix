import type { Metadata } from 'next';
import { TallyDesk, type LogData, type MapRow, type TallyConfig } from '@/components/gateway-books/TallyDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.tally') };
}

export default async function TallyPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('finance');
  const { tab } = await searchParams;
  const { t } = await getI18n();
  const data = await load(async () => ({ cfg: await api<TallyConfig | null>('/v1/tally/settings'), map: await api<MapRow[]>('/v1/tally/mapping'), log: await api<LogData>('/v1/tally/log') }));
  return (
    <>
      <PageHeader title={t('nav.tally')} subtitle={t('gb.tally.subtitle')} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <TallyDesk cfg={data.data.cfg} map={data.data.map} log={data.data.log} initialTab={tab ?? 'settings'} />}
    </>
  );
}
