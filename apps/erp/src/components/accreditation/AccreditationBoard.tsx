'use client';

import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/i18n/client';
import { evidenceStatus, type AccGroup, type AccOverview } from '@/lib/accreditation-ui';
import type { Panel } from '@/lib/depth';
import { cn } from '@/lib/utils';

const pctOf = (g: AccGroup) => (g.metrics > 0 ? Math.round((g.complete / g.metrics) * 100) : 0);
/** Rounded so the server and the browser print the same SVG numbers (no hydration mismatch). */
const rd = (n: number) => Math.round(n * 100) / 100;
const ringTone = (p: number) => (p < 50 ? 'stroke-red' : p < 70 ? 'stroke-amber' : 'stroke-teal');

/** A completeness ring: the share of a criterion's metrics that are complete. */
export function Ring({ value, size = 54, stroke = 6, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={rd(c)} strokeDashoffset={rd(c * (1 - Math.min(100, Math.max(0, value)) / 100))} className={ringTone(value)} />
      </svg>
      <b className={cn('absolute font-semibold tabular-nums', size > 80 ? 'text-2xl' : 'text-[12px]')}>{value}%</b>
    </span>
  );
}

/** NAAC grade bands on the 4-point scale (affiliated-college manual). */
const BANDS: [number, string][] = [
  [3.51, 'A++'],
  [3.26, 'A+'],
  [3.01, 'A'],
  [2.76, 'B++'],
  [2.51, 'B+'],
  [2.01, 'B'],
  [1.51, 'C'],
];
const TICKS: [number, string][] = [
  [1.51, 'C'],
  [2.01, 'B'],
  [2.51, 'B+'],
  [3.01, 'A'],
  [3.51, 'A++'],
];

/** A half-circle gauge of the predicted CGPA out of 4 with the grade ticks. */
function Gauge({ value, caption, label }: { value: number; caption: string; label: string }) {
  const cx = 130;
  const cy = 132;
  const r = 90;
  const pt = (v: number) => {
    const a = Math.PI * (1 - v / 4);
    return [rd(cx + r * Math.cos(a)), rd(cy - r * Math.sin(a))] as const;
  };
  const arc = (a: number, b: number) => {
    const [x0, y0] = pt(a);
    const [x1, y1] = pt(b);
    return `M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`;
  };
  const [nx, ny] = pt(value);
  return (
    <svg viewBox="0 0 260 172" className="mx-auto block w-full max-w-[320px]" role="img" aria-label={label}>
      <path d={arc(0, 4)} fill="none" strokeWidth={14} strokeLinecap="round" className="stroke-muted" />
      <path d={arc(0, Math.max(0.01, value))} fill="none" strokeWidth={14} strokeLinecap="round" className="stroke-teal" />
      <path d={arc(3.01, 4)} fill="none" strokeWidth={3} strokeLinecap="round" className="stroke-amber" />
      {TICKS.map(([b, l]) => {
        const a = Math.PI * (1 - b / 4);
        return (
          <text key={l} x={rd(cx + (r + 22) * Math.cos(a))} y={rd(cy - (r + 22) * Math.sin(a) + 3)} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {l}
          </text>
        );
      })}
      <circle cx={nx} cy={ny} r={9} className="fill-card stroke-foreground" strokeWidth={3} />
      <text x={cx} y={cy - 14} textAnchor="middle" className="fill-foreground text-[34px] font-bold">
        {value.toFixed(2)}
      </text>
      <text x={cx} y={cy + 30} textAnchor="middle" className="fill-muted-foreground text-[12px]">
        {caption}
      </text>
    </svg>
  );
}

/**
 * The accreditation board: criterion cards with completeness rings (a click filters the metric
 * table), the predicted grade, what is still missing, and the metric table with evidence status.
 */
export function AccreditationBoard({ ov, metrics, extra }: { ov: AccOverview; metrics: Panel; extra: Panel[] }) {
  const { t, fmt } = useI18n();
  const [group, setGroup] = useState<string | null>(null);
  const shown: Panel = { ...metrics, title: group ? `${metrics.title} · ${group}` : metrics.title, rows: group ? metrics.rows.filter((r) => r.group === group) : metrics.rows };
  const missing = ov.metrics.filter((m) => (!group || m.group === group) && (evidenceStatus(m) === 'missing' || evidenceStatus(m) === 'review'));
  const est = ov.estimate;
  const next = est && est.estimate !== null ? [...BANDS].reverse().find(([at]) => at > (est.estimate ?? 0)) : undefined;
  const focus = (grp: string) => {
    setGroup(grp);
    requestAnimationFrame(() => document.getElementById('acc-metrics')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="flex flex-col gap-4" data-testid="acc-board">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title={t('acc.b.criteria')}
          subtitle={t('acc.b.criteriaSub')}
          action={
            group ? (
              <button type="button" onClick={() => setGroup(null)} className="h-8 rounded-md border bg-card px-3 text-[13px] font-medium hover:bg-accent">
                {t('acc.b.showAll')}
              </button>
            ) : undefined
          }
          testId="acc-criteria"
        >
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))' }}>
            {ov.groups.map((c) => {
              const p = pctOf(c);
              const on = group === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setGroup(on ? null : c.id)}
                  className={cn('flex min-w-0 items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none', on && 'border-teal bg-teal-soft/60')}
                >
                  <Ring value={p} />
                  <span className="min-w-0">
                    <span className="block text-xs text-muted-foreground">
                      {c.id} · {t('acc.b.metricsOf', { n: c.complete, total: c.metrics })}
                    </span>
                    <b className="block text-[13px] leading-[1.3] font-[550]">{c.title}</b>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          {est && est.estimate !== null ? (
            <Card title={t('acc.predicted')} subtitle={t('acc.b.gaugeSub')} testId="acc-gauge">
              <Gauge value={est.estimate} caption={t('acc.b.gradeLine', { grade: est.grade })} label={`${t('acc.predicted')} ${fmt.number(est.estimate, { maximumFractionDigits: 2 })} · ${est.grade}`} />
              <div className="mt-3 rounded-lg bg-amber-soft px-3 py-2.5 text-[12.5px] text-amber-ink">
                {next ? <b>{t('acc.b.toNext', { gap: fmt.number(Math.max(0, next[0] - est.estimate), { maximumFractionDigits: 2 }), grade: next[1], at: next[0] })} </b> : null}
                {t('acc.b.floor', { value: fmt.number(est.floor, { maximumFractionDigits: 2 }), grade: est.floorGrade })}
              </div>
            </Card>
          ) : (
            <Card title={t('acc.b.overall')} subtitle={t('acc.b.overallSub', { done: ov.completeness.complete, total: ov.completeness.total })} testId="acc-overall">
              <div className="grid place-items-center py-2">
                <Ring value={Math.round(ov.completeness.percent)} size={132} stroke={14} label={t('acc.b.overallSub', { done: ov.completeness.complete, total: ov.completeness.total })} />
              </div>
            </Card>
          )}
          <Card title={t('acc.b.missing')} subtitle={t('acc.b.missingSub', { n: missing.length })} padded={false} testId="acc-missing">
            {missing.length === 0 ? (
              <p className="m-0 px-[18px] pb-4 text-[13px] text-muted-foreground">{t('acc.b.none')}</p>
            ) : (
              <ul className="m-0 mt-2 max-h-[320px] list-none overflow-y-auto p-0">
                {missing.slice(0, 40).map((m) => {
                  const st = evidenceStatus(m);
                  return (
                    <li key={m.code} className="flex items-center gap-3 border-t px-[18px] py-2.5">
                      <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4', st === 'missing' ? 'bg-red-soft text-red-ink' : 'bg-amber-soft text-amber-ink')}>
                        <AlertTriangle />
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[13px] font-semibold">
                          {m.code} {m.title}
                        </b>
                        <span className="block truncate text-xs text-muted-foreground">
                          {m.group} · {t(st === 'missing' ? 'acc.ev.missing' : 'acc.ev.review')}
                        </span>
                      </span>
                      <button type="button" onClick={() => focus(m.group)} className="h-8 shrink-0 rounded-md border bg-card px-2.5 text-[12.5px] font-medium hover:bg-accent">
                        {t('acc.b.fix')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div id="acc-metrics" className="min-w-0 scroll-mt-20">
        <DepthDesk panels={[shown]} />
      </div>
      {extra.length > 0 && <DepthDesk panels={extra} />}
    </div>
  );
}
