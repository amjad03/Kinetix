'use client';
import { DataTable, LineChart, SERIES, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { computeSeries, type ComputeDevice, type ComputeUsage } from '@/lib/zynetix';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`);
const temp = (v: number | null) => (v === null ? '—' : `${Math.round(v)}°C`);

/** Boards, IFPs and edge boxes: online, load, temperatures, versions and last seen. */
export function DeviceTable({ devices }: { devices: ComputeDevice[] }) {
  const { t, fmt } = useI18n();
  const columns: Column<ComputeDevice>[] = [
    { id: 'name', header: t('zx.b.device'), rowHeader: true, sort: (d) => d.name, cell: (d) => <span className="font-medium">{d.name}</span> },
    { id: 'room', header: t('zx.b.room'), hideBelow: 'md', sort: (d) => d.room ?? '', cell: (d) => d.room ?? '—' },
    { id: 'kind', header: t('zx.b.kind'), hideBelow: 'md', sort: (d) => d.kind ?? '', cell: (d) => d.kind ?? '—' },
    { id: 'online', header: t('zx.b.status'), sort: (d) => (d.online ? 1 : 0), cell: (d) => <StatusPill tone={d.online ? 'success' : d.enrolled ? 'neutral' : 'warning'}>{t(d.online ? 'zx.b.online' : d.enrolled ? 'zx.b.offline' : 'zx.b.notEnrolled')}</StatusPill> },
    { id: 'cpu', header: 'CPU', align: 'right', sort: (d) => d.cpuPct, cell: (d) => pct(d.cpuPct) },
    { id: 'gpu', header: 'GPU', align: 'right', sort: (d) => d.gpuPct, cell: (d) => pct(d.gpuPct) },
    { id: 'npu', header: 'NPU', align: 'right', sort: (d) => d.npuPct, cell: (d) => pct(d.npuPct) },
    { id: 'ram', header: 'RAM', align: 'right', sort: (d) => d.ramPct, cell: (d) => pct(d.ramPct) },
    { id: 'temp', header: t('zx.b.temps'), align: 'right', hideBelow: 'lg', sort: (d) => d.cpuTempC, cell: (d) => `${temp(d.cpuTempC)} / ${temp(d.gpuTempC)}` },
    { id: 'ai', header: t('zx.b.ai24h'), align: 'right', hideBelow: 'lg', sort: (d) => d.ai24h.inferences, cell: (d) => (d.ai24h.inferences ? `${fmt.number(d.ai24h.inferences)} · ${d.ai24h.avgMs ?? '—'} ms` : '—') },
    { id: 'version', header: t('zx.b.version'), hideBelow: 'md', sort: (d) => d.appVersion ?? '', cell: (d) => [d.appVersion, [d.os, d.osVersion].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || '—' },
    { id: 'seen', header: t('zx.b.lastSeen'), sort: (d) => d.lastSeenAt ?? '', cell: (d) => (d.lastSeenAt ? fmt.dateTime(d.lastSeenAt) : t('zx.b.never')) },
  ];
  return <DataTable testId="zx-devices" label={t('zx.b.devices')} rows={devices} rowId={(d) => d.id} columns={columns} exportName="boards" rowAttrs={() => ({ 'data-testid': 'zx-device-row' })} />;
}

/** Compute load over time (average over the devices shown) and on-device AI inferences. */
export function ComputeChart({ usage }: { usage: ComputeUsage }) {
  const { t } = useI18n();
  const s = computeSeries(usage);
  if (s.at.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground" data-testid="zx-no-usage">{t('zx.b.noUsage')}</p>;
  const most = Math.max(1, ...s.inferences);
  return (
    <div className="grid gap-6" data-testid="zx-usage-chart">
      <LineChart
        ariaLabel={t('zx.b.loadChart')}
        labels={s.labels}
        area={false}
        series={[
          { key: 'cpu', label: 'CPU', values: s.cpu, color: SERIES[0] },
          { key: 'gpu', label: 'GPU', values: s.gpu, color: SERIES[1] },
          { key: 'npu', label: 'NPU', values: s.npu, color: SERIES[2] },
          { key: 'ram', label: 'RAM', values: s.ram, color: SERIES[3] },
        ]}
      />
      <LineChart ariaLabel={t('zx.b.inferChart')} labels={s.labels} unit="" max={Math.ceil(most * 1.1)} series={[{ key: 'inf', label: t('zx.b.inferences'), values: s.inferences, color: SERIES[4] }]} />
    </div>
  );
}
