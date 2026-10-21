import type { Metadata } from 'next';
import { Button } from '@/components/kx';
import { fieldClass } from '@/components/kx/form';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { AiCharts, AiLogTable } from '@/components/zynetix/AiLogView';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { AI_STATUSES, aiLogQuery, bucketLabel, type AiLogFilters, type AiLogPage, type AiSummary, type Compute } from '@/lib/zynetix';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.zxAiLog') };
}

/** Every AI answer: who asked, on which board, about which topic, the model, latency, tokens, and whether it was served, refused or throttled. */
export default async function AiLogPage({ searchParams }: { searchParams: Promise<AiLogFilters & { bucket?: string }> }) {
  await requireSection('zynetix');
  const { t, fmt } = await getI18n();
  const sp = await searchParams;
  const bucket = sp.bucket === 'hour' ? 'hour' : 'day';
  const query = aiLogQuery(sp);
  const [log, summary, compute] = await Promise.all([
    load(() => api<AiLogPage>(`/v1/ai/admin/logs?${aiLogQuery(sp, { pageSize: '50' })}`)),
    load(() => api<AiSummary>(`/v1/ai/admin/logs/summary?${aiLogQuery({ ...sp, page: undefined }, { bucket })}`)),
    load(() => api<Compute>('/v1/devices/compute')),
  ]);
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(query);
    q.delete('page');
    for (const [k, v] of Object.entries(patch)) if (v === undefined) q.delete(k);
    else q.set(k, v);
    if (bucket === 'hour') q.set('bucket', 'hour');
    return `/zynetix/ai-log${q.size ? `?${q}` : ''}`;
  };
  const s = summary.data;
  const tot = s?.totals;
  const kinds = s?.byKind.map((k) => k.kind) ?? [];
  const field = (name: keyof AiLogFilters, label: string, type = 'text') => (
    <label className="grid gap-1.5 text-[13px] font-semibold">
      {label}
      <input className={`${fieldClass} h-10`} type={type} name={name} defaultValue={sp[name] ?? ''} />
    </label>
  );
  const select = (name: string, label: string, value: string, options: { value: string; label: string }[]) => (
    <label className="grid gap-1.5 text-[13px] font-semibold">
      {label}
      <select className={`${fieldClass} h-10`} name={name} defaultValue={value} data-testid={`zx-ai-${name}`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const page = log.data?.page ?? 1;
  const pages = log.data ? Math.max(1, Math.ceil(log.data.total / log.data.pageSize)) : 1;

  return (
    <>
      <PageHeader title={t('nav.zxAiLog')} subtitle={t('zx.ai.subtitle')} />
      <form className="mb-6 flex flex-wrap items-end gap-3" method="get" data-testid="zx-ai-filters">
        {field('from', t('zx.ai.from'), 'date')}
        {field('to', t('zx.ai.to'), 'date')}
        {select('status', t('zx.ai.outcome'), sp.status ?? '', [{ value: '', label: t('common.all') }, ...AI_STATUSES.map((v) => ({ value: v, label: t(`zx.ai.s.${v}`) }))])}
        {select('kind', t('zx.ai.kind'), sp.kind ?? '', [{ value: '', label: t('common.all') }, ...[...new Set([...kinds, ...(sp.kind ? [sp.kind] : [])])].map((k) => ({ value: k, label: k }))])}
        {select('deviceId', t('zx.ai.board'), sp.deviceId ?? '', [{ value: '', label: t('common.all') }, ...(compute.data?.devices ?? []).map((d) => ({ value: d.id, label: d.name }))])}
        {select('bucket', t('zx.ai.bucket'), bucket, [
          { value: 'day', label: t('zx.byDay') },
          { value: 'hour', label: t('zx.byHour') },
        ])}
        {sp.userId && <input type="hidden" name="userId" value={sp.userId} />}
        {sp.topicId && <input type="hidden" name="topicId" value={sp.topicId} />}
        <Button type="submit" variant="outlined" data-testid="zx-ai-apply">
          {t('zx.apply')}
        </Button>
        {query && (
          <LinkButton href="/zynetix/ai-log" size="small">
            {t('zx.clear')}
          </LinkButton>
        )}
      </form>

      {summary.error !== undefined ? (
        <ErrorState message={summary.error} />
      ) : (
        <>
          <StatGrid>
            <StatTile label={t('zx.ai.requests')} value={fmt.number(tot!.requests)} caption={t('zx.ai.range', { from: s!.from.slice(0, 10), to: s!.to.slice(0, 10) })} testId="zx-ai-requests" />
            <StatTile label={t('zx.ai.s.served')} value={tot!.requests ? `${Math.round((tot!.served / tot!.requests) * 100)}%` : '—'} caption={fmt.number(tot!.served)} />
            <StatTile label={t('zx.ai.refused')} value={fmt.number(tot!.throttled + tot!.rejected)} tone={tot!.throttled ? 'warning' : 'default'} caption={t('zx.ai.refusedCaption', { throttled: tot!.throttled, rejected: tot!.rejected, error: tot!.error })} testId="zx-ai-refused" />
            <StatTile label={t('zx.ai.latency')} value={tot!.p50LatencyMs === null ? '—' : `${fmt.number(tot!.p50LatencyMs)} ms`} caption={t('zx.ai.p95Caption', { ms: tot!.p95LatencyMs ?? '—' })} />
            <StatTile label={t('zx.ai.peak')} value={s!.peakHour ? bucketLabel(s!.peakHour.at, 'hour', s!.timezone) : '—'} caption={s!.peakHour ? t('zx.ai.peakCaption', { n: s!.peakHour.requests, throttled: s!.peakHour.throttled }) : undefined} testId="zx-ai-peak" />
            <StatTile label={t('zx.ai.capacity')} value={`${s!.capacity.running} / ${s!.capacity.max}`} caption={t('zx.ai.waiting', { n: s!.capacity.waiting })} />
          </StatGrid>
          <SectionTitle>{t('zx.ai.charts')}</SectionTitle>
          <AiCharts summary={s!} />
          {s!.reasons.length > 0 && (
            <>
              <SectionTitle>{t('zx.ai.reasons')}</SectionTitle>
              <ul className="m-0 grid list-none gap-1 p-0 text-sm" data-testid="zx-ai-reasons">
                {s!.reasons.map((r) => (
                  <li key={`${r.status}-${r.reason}`}>
                    <b className="font-medium">{t(`zx.ai.s.${r.status}`)}</b> · {r.reason ?? '—'} · {fmt.number(r.n)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <SectionTitle>{t('zx.ai.log', { n: log.data?.total ?? 0 })}</SectionTitle>
      {log.error !== undefined ? (
        <ErrorState message={log.error} />
      ) : (
        <>
          <AiLogTable items={log.data.items} baseQuery={href({}).split('?')[1] ?? ''} />
          <div className="mt-3 flex items-center gap-2">
            {page > 1 && (
              <LinkButton size="small" href={`${href({})}${href({}).includes('?') ? '&' : '?'}page=${page - 1}`}>
                {t('zx.prev')}
              </LinkButton>
            )}
            <p className="text-[13px]" data-testid="zx-ai-page">{t('zx.pageOf', { n: page, of: pages })}</p>
            {page < pages && (
              <LinkButton size="small" href={`${href({})}${href({}).includes('?') ? '&' : '?'}page=${page + 1}`} data-testid="zx-ai-next">
                {t('zx.next')}
              </LinkButton>
            )}
          </div>
        </>
      )}
    </>
  );
}
