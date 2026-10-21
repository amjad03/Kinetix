'use client';
import Link from 'next/link';
import { DataTable, LineChart, SERIES, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { bucketLabel, STATUS_TONE, type AiLogItem, type AiSummary } from '@/lib/zynetix';

/** One page of the AI answer log; user, board and topic link to the log filtered by them. */
export function AiLogTable({ items, baseQuery }: { items: AiLogItem[]; /** The page's filters (without the page number). */ baseQuery: string }) {
  const { t, fmt } = useI18n();
  const by = (k: 'userId' | 'deviceId' | 'topicId') => (id: string) => {
    const q = new URLSearchParams(baseQuery);
    q.set(k, id);
    return `/zynetix/ai-log?${q}`;
  };
  const filterHref = { userId: by('userId'), deviceId: by('deviceId'), topicId: by('topicId') };
  const columns: Column<AiLogItem>[] = [
    { id: 'at', header: t('zx.ai.when'), sort: (r) => r.at, cell: (r) => fmt.dateTime(r.at) },
    { id: 'user', header: t('zx.ai.user'), sort: (r) => r.user?.fullName ?? '', cell: (r) => (r.user ? <Link className="hover:underline" href={filterHref.userId(r.user.id)}>{r.user.fullName}</Link> : '—') },
    { id: 'board', header: t('zx.ai.board'), hideBelow: 'md', sort: (r) => r.device?.name ?? '', cell: (r) => (r.device ? <Link className="hover:underline" href={filterHref.deviceId(r.device.id)}>{r.device.name}</Link> : '—') },
    { id: 'topic', header: t('zx.ai.topic'), hideBelow: 'md', sort: (r) => r.topic?.title ?? '', cell: (r) => (r.topic ? <Link className="hover:underline" href={filterHref.topicId(r.topic.id)}>{r.topic.title}</Link> : '—') },
    { id: 'kind', header: t('zx.ai.kind'), sort: (r) => r.kind, cell: (r) => r.kind },
    { id: 'model', header: t('zx.ai.model'), hideBelow: 'lg', sort: (r) => r.model ?? '', cell: (r) => [r.provider, r.model].filter(Boolean).join(' · ') || '—' },
    { id: 'latency', header: t('zx.ai.latency'), align: 'right', sort: (r) => r.latencyMs, cell: (r) => (r.latencyMs === null ? '—' : `${fmt.number(r.latencyMs)} ms`) },
    { id: 'tokens', header: t('zx.ai.tokens'), align: 'right', hideBelow: 'lg', sort: (r) => r.tokensIn + r.tokensOut, cell: (r) => `${fmt.number(r.tokensIn)} / ${fmt.number(r.tokensOut)}` },
    { id: 'status', header: t('zx.ai.outcome'), sort: (r) => r.status, cell: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{t(`zx.ai.s.${r.status}`)}</StatusPill> },
    { id: 'reason', header: t('zx.ai.reason'), hideBelow: 'md', sort: (r) => r.reason ?? r.outcome, cell: (r) => r.reason ?? (r.outcome !== 'ok' ? r.outcome : '—') },
  ];
  return <DataTable testId="zx-ai-log" label={t('nav.zxAiLog')} rows={items} rowId={(r) => r.id} columns={columns} pageSize={200} exportName="ai-log" rowAttrs={() => ({ 'data-testid': 'zx-ai-row' })} empty={<p className="py-6 text-center text-sm text-muted-foreground">{t('zx.ai.none')}</p>} />;
}

/** Requests and outcomes over time, latency p50/p95, and the load by hour of the day. */
export function AiCharts({ summary }: { summary: AiSummary }) {
  const { t } = useI18n();
  const labels = summary.buckets.map((b) => bucketLabel(b.at, summary.bucket, summary.timezone));
  const most = Math.max(1, ...summary.buckets.map((b) => b.requests));
  const slowest = Math.max(100, ...summary.buckets.map((b) => b.p95LatencyMs ?? 0));
  const busiest = Math.max(1, ...summary.byHourOfDay.map((h) => h.requests));
  if (summary.buckets.length === 0) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-2" data-testid="zx-ai-charts">
      <div>
        <h3 className="mb-2 text-sm font-semibold">{t('zx.ai.overTime')}</h3>
        <LineChart
          ariaLabel={t('zx.ai.overTime')}
          labels={labels}
          unit=""
          max={Math.ceil(most * 1.1)}
          area={false}
          series={[
            { key: 'requests', label: t('zx.ai.requests'), values: summary.buckets.map((b) => b.requests), color: SERIES[0] },
            { key: 'throttled', label: t('zx.ai.s.throttled'), values: summary.buckets.map((b) => b.throttled), color: SERIES[2] },
            { key: 'rejected', label: t('zx.ai.s.rejected'), values: summary.buckets.map((b) => b.rejected), color: SERIES[3] },
          ]}
        />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">{t('zx.ai.latencyChart')}</h3>
        <LineChart
          ariaLabel={t('zx.ai.latencyChart')}
          labels={labels}
          unit=" ms"
          max={Math.ceil(slowest * 1.1)}
          area={false}
          series={[
            { key: 'p50', label: t('zx.ai.p50'), values: summary.buckets.map((b) => b.p50LatencyMs), color: SERIES[0] },
            { key: 'p95', label: t('zx.ai.p95'), values: summary.buckets.map((b) => b.p95LatencyMs), color: SERIES[1] },
          ]}
        />
      </div>
      <div className="lg:col-span-2">
        <h3 className="mb-2 text-sm font-semibold">{t('zx.ai.byHour')}</h3>
        <LineChart
          ariaLabel={t('zx.ai.byHour')}
          labels={summary.byHourOfDay.map((h) => `${String(h.hour).padStart(2, '0')}:00`)}
          unit=""
          max={Math.ceil(busiest * 1.1)}
          series={[
            { key: 'requests', label: t('zx.ai.requests'), values: summary.byHourOfDay.map((h) => h.requests), color: SERIES[0] },
            { key: 'throttled', label: t('zx.ai.s.throttled'), values: summary.byHourOfDay.map((h) => h.throttled), color: SERIES[2] },
          ]}
        />
      </div>
    </div>
  );
}
