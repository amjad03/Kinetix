import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { ComputeChart, DeviceTable } from '@/components/zynetix/ComputeView';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Compute, ComputeUsage } from '@/lib/zynetix';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.zxBoards') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Boards and edge devices: status, CPU/GPU/NPU/RAM, temperatures, versions, last seen, and compute over time. */
export default async function BoardsPage({ searchParams }: { searchParams: Promise<{ bucket?: string; device?: string }> }) {
  await requireSection('zynetix');
  const { t } = await getI18n();
  const sp = await searchParams;
  const bucket = sp.bucket === 'day' ? 'day' : 'hour';
  const device = sp.device && UUID.test(sp.device) ? sp.device : '';
  const [compute, usage] = await Promise.all([
    load(() => api<Compute>('/v1/devices/compute')),
    load(() => api<ComputeUsage>(`/v1/devices/compute/usage?bucket=${bucket}${device ? `&deviceId=${device}` : ''}`)),
  ]);
  if (compute.error !== undefined) return <ErrorState message={compute.error} />;
  const c = compute.data;
  const hot = c.devices.filter((d) => (d.cpuTempC ?? 0) >= 80 || (d.gpuTempC ?? 0) >= 80).length;
  const ai = c.devices.reduce((s, d) => s + d.ai24h.inferences, 0);
  return (
    <>
      <PageHeader title={t('nav.zxBoards')} subtitle={t('zx.b.subtitle')} actions={<><LinkButton href="/boards">{t('zx.b.register')}</LinkButton><LinkButton href="/devices" variant="outlined">{t('zx.b.console')}</LinkButton></>} />
      <StatGrid>
        <StatTile label={t('zx.b.online')} value={`${c.online} / ${c.total}`} testId="zx-boards-online" tone={c.online < c.total ? 'warning' : 'default'} />
        <StatTile label={t('zx.b.offline')} value={c.total - c.online} />
        <StatTile label={t('zx.b.hot')} value={hot} caption={t('zx.b.hotCaption')} tone={hot ? 'warning' : 'default'} />
        <StatTile label={t('zx.b.ai24h')} value={ai.toLocaleString('en-IN')} />
      </StatGrid>
      <SectionTitle>{t('zx.b.devices')}</SectionTitle>
      <DeviceTable devices={c.devices} />
      <SectionTitle>{t('zx.b.usage')}</SectionTitle>
      <div className="mb-4 flex flex-wrap gap-4">
        <UrlSelect
          label={t('zx.b.bucket')}
          value={`bucket=${bucket}${device ? `&device=${device}` : ''}`}
          options={(['hour', 'day'] as const).map((b) => ({ value: `bucket=${b}${device ? `&device=${device}` : ''}`, label: t(b === 'hour' ? 'zx.byHour' : 'zx.byDay') }))}
        />
        <UrlSelect
          label={t('zx.b.device')}
          value={`bucket=${bucket}${device ? `&device=${device}` : ''}`}
          options={[{ value: `bucket=${bucket}`, label: t('zx.b.allDevices') }, ...c.devices.map((d) => ({ value: `bucket=${bucket}&device=${d.id}`, label: d.name }))]}
        />
      </div>
      {usage.error !== undefined ? <ErrorState message={usage.error} /> : <ComputeChart usage={usage.data} />}
    </>
  );
}
