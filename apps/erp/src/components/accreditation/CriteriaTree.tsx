'use client';

import { ChevronRight, MessageSquareWarning, Paperclip } from 'lucide-react';
import NextLink from 'next/link';
import { useMemo, useState } from 'react';
import { FormRow, SelectInput, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { fig, metricState, type AccCriterion, type BriefMetric, type Scoring } from '@/lib/accreditation-ui';
import { cn } from '@/lib/utils';
import { Meter, Ring } from './charts';

const STATUS_TONE = { assigned: 'neutral', in_progress: 'info', submitted: 'warning', approved: 'success', returned: 'danger' } as const;
type Filter = 'all' | 'missing' | 'partial' | 'complete' | 'unassigned' | 'dvv';

/**
 * The framework as a tree: criteria, key indicators and their metrics with type, filed value, score, completeness,
 * evidence, owner and review status. Search and a status filter narrow it; each metric opens its workbench.
 */
export function CriteriaTree({ fw, cycle, scoring, criteria, metrics }: { fw: string; cycle: string; scoring: Scoring; criteria: AccCriterion[]; metrics: BriefMetric[] }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return metrics.filter((m) => {
      if (s && !`${m.code} ${m.title}`.toLowerCase().includes(s)) return false;
      if (filter === 'unassigned') return !m.task;
      if (filter === 'dvv') return m.dvvOpen > 0;
      if (filter !== 'all') return metricState(m) === filter;
      return true;
    });
  }, [metrics, q, filter]);
  const valueOf = (m: BriefMetric) => {
    if (m.options) return m.options.selected === null ? '-' : t('acx.c.ticked', { n: m.options.selected, total: m.options.count });
    if (m.kind === 'QlM') return m.hasNarrative ? t('acx.c.written') : t('acx.c.notWritten');
    return m.value === null ? '-' : `${fig(m.value)} ${m.unit}`;
  };
  return (
    <div className="flex flex-col gap-4" data-testid="acx-tree">
      <FormRow labelled={false} className="items-end">
        <TextInput className="min-w-[240px] flex-1" placeholder={t('acx.c.search')} aria-label={t('acx.c.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <SelectInput
          className="w-[220px]"
          aria-label={t('acx.c.filter')}
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          options={(['all', 'missing', 'partial', 'complete', 'unassigned', 'dvv'] as const).map((v) => ({ value: v, label: t(`acx.c.f.${v}` as MessageKey) }))}
        />
      </FormRow>
      {criteria.map((c) => {
        const mine = shown.filter((m) => m.criterion === c.id);
        if (!mine.length) return null;
        return (
          <details key={c.id} id={`c-${c.id}`} open className="group scroll-mt-20 rounded-lg border bg-card shadow-card">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
              <Ring value={c.completeness} size={42} stroke={5} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted-foreground">
                  {c.id === 'EP' ? t('acx.r.ep') : `${t('acx.r.criterion')} ${c.id}`} · {t('acx.r.metricsOf', { n: c.complete, total: c.metrics })}
                  {c.weight > 0 ? ` · ${t('acx.c.weight', { n: c.weight })}` : ''}
                </span>
                <b className="block text-sm font-semibold">{c.title}</b>
              </span>
              {scoring !== 'none' && c.id !== 'EP' && <span className="hidden text-sm tabular-nums text-muted-foreground sm:block">{scoring === 'naac' ? `${fig(c.score)} / 4` : `${fig(c.score, 1)} / ${c.max}`}</span>}
            </summary>
            <div className="border-t">
              {c.indicators.map((k) => {
                const rows = mine.filter((m) => m.indicator === k.id);
                if (!rows.length) return null;
                return (
                  <div key={k.id}>
                    {c.indicators.length > 1 && (
                      <div className="bg-muted/50 px-4 py-1.5 text-xs font-semibold text-muted-foreground">
                        {k.id} {k.title}
                        {k.weight > 0 ? ` · ${t('acx.c.weight', { n: k.weight })}` : ''}
                      </div>
                    )}
                    <ul className="m-0 list-none p-0">
                      {rows.map((m) => (
                        <li key={m.code} className="border-t first:border-t-0">
                          <NextLink href={`/accreditation/${fw}/metrics/${encodeURIComponent(m.code)}?cycle=${cycle}`} className="grid grid-cols-[4.5rem_1fr] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-foreground no-underline hover:bg-accent/50 md:grid-cols-[4.5rem_1fr_9rem_6rem_8rem_9rem]" data-testid={`acx-metric-${m.code}`}>
                            <span className="text-[13px] font-semibold tabular-nums">{m.code}</span>
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <StatusPill tone={m.kind === 'QnM' ? 'info' : 'neutral'}>{m.kind === 'QnM' ? t('acx.c.qnm') : t('acx.c.qlm')}</StatusPill>
                                {m.weight > 0 && <span className="text-xs text-muted-foreground">{t('acx.c.weight', { n: m.weight })}</span>}
                                {m.dvvOpen > 0 && (
                                  <StatusPill tone="danger" icon={<MessageSquareWarning />}>
                                    {t('acx.c.dvv', { n: m.dvvOpen })}
                                  </StatusPill>
                                )}
                              </span>
                              <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug">{m.title}</span>
                            </span>
                            <span className={cn('col-start-2 text-[13px] tabular-nums md:col-start-auto', m.valueSource === 'auto' && 'text-teal-ink')}>
                              {valueOf(m)}
                              {m.valueSource === 'auto' && <span className="block text-[11px] text-muted-foreground">{t('acx.c.fromErp')}</span>}
                            </span>
                            <span className="col-start-2 text-[13px] tabular-nums text-muted-foreground md:col-start-auto">{scoring === 'none' || m.score === null ? '-' : `${fig(m.score)} / ${fig(m.maxScore)}`}</span>
                            <span className="col-start-2 flex items-center gap-2 md:col-start-auto">
                              <Meter value={m.completeness} />
                              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground" title={t('acx.c.evidence')}>
                                <Paperclip className="size-3" aria-hidden />
                                {m.evidence}
                              </span>
                            </span>
                            <span className="col-start-2 min-w-0 text-xs md:col-start-auto">
                              {m.task ? (
                                <>
                                  <StatusPill tone={STATUS_TONE[m.task.status]}>{t(`acx.ts.${m.task.status}` as MessageKey)}</StatusPill>
                                  <span className="mt-0.5 block truncate text-muted-foreground">{m.task.ownerName ?? m.task.departmentName}</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">{t('acx.c.unassigned')}</span>
                              )}
                            </span>
                          </NextLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
      {shown.length === 0 && <p className="m-0 rounded-lg border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground">{t('acx.c.none')}</p>}
    </div>
  );
}
