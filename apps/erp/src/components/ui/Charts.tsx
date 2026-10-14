'use client';

import type { ReactNode } from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, Pie, PieChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/shadcn/chart';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n/client';

// Charts on shadcn ChartContainer + recharts, styled on the design tokens (--chart-*, see app/globals.css).
// Every chart has an aria-label, never relies on colour alone (values are printed or in a table
// for screen readers), and recharts' accessibility layer gives keyboard navigation.

export const SERIES = ['var(--chart-1)', 'var(--chart-3)', 'var(--chart-5)', 'var(--chart-4)', 'var(--chart-2)'] as const;

const TICK = { fontSize: 11, fill: 'var(--muted-foreground)' } as const;

export interface LineSeries {
  key: string;
  label: string;
  values: (number | null)[];
  color?: string;
}

/** Tooltip row: colour dot, series name, value with unit. */
function tipRow(color: string | undefined, name: ReactNode, value: ReactNode) {
  return (
    <div className="flex w-full items-center gap-2">
      <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />
      <span className="flex-1 text-muted-foreground">{name}</span>
      <span className="font-mono font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

/**
 * A multi-series line chart with a hover and keyboard tooltip. Gaps (null) break the line.
 * Arrow keys move between x positions when the chart has focus.
 */
export function LineChart({
  labels,
  series,
  height = 240,
  min = 0,
  max = 100,
  unit = '%',
  ariaLabel,
  area = true,
  target,
  targetLabel,
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  min?: number;
  max?: number;
  unit?: string;
  ariaLabel: string;
  area?: boolean;
  /** Optional dashed reference (target) line at this y value. */
  target?: number;
  targetLabel?: string;
}) {
  const { t } = useI18n();
  const hasData = series.some((s) => s.values.some((v) => v !== null));

  if (!hasData) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground" style={{ height }}>
        {t('ui.chart.noData')}
      </div>
    );
  }

  const keyed = series.map((s, i) => ({ s, dk: `s${i}`, color: s.color ?? SERIES[i % SERIES.length] }));
  const config: ChartConfig = Object.fromEntries(keyed.map(({ s, dk, color }) => [dk, { label: s.label, color }]));
  const data = labels.map((label, i) => {
    const row: Record<string, string | number | null> = { label };
    keyed.forEach(({ s, dk }) => {
      row[dk] = s.values[i] ?? null;
    });
    return row;
  });
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(min + f * (max - min)));
  const fmt = (v: unknown) => (v === null || v === undefined ? '—' : `${v}${unit}`);

  return (
    <div className="relative">
      <ChartContainer config={config} role="img" aria-label={ariaLabel} className="aspect-auto w-full" style={{ height }} initialDimension={{ width: 640, height }}>
        <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <defs>
            {area && keyed[0] && (
              <linearGradient id="kx-line-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={keyed[0].color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={keyed[0].color} stopOpacity={0} />
              </linearGradient>
            )}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} tickMargin={8} />
          <YAxis domain={[min, max]} ticks={ticks} allowDataOverflow tickLine={false} axisLine={false} tick={TICK} width={44} tickFormatter={(v: number) => `${v}${unit}`} />
          <ChartTooltip
            cursor={{ stroke: 'var(--border)' }}
            content={<ChartTooltipContent formatter={(value, _name, item) => tipRow(item.color, config[String(item.dataKey)]?.label, fmt(value))} />}
          />
          {target !== undefined && (
            <ReferenceLine
              y={target}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={targetLabel ? { value: targetLabel, position: 'insideTopRight', fontSize: 11, fill: 'var(--muted-foreground)' } : undefined}
            />
          )}
          {area && keyed[0] && <Area dataKey={keyed[0].dk} type="linear" stroke="none" fill="url(#kx-line-area)" connectNulls={false} isAnimationActive={false} tooltipType="none" activeDot={false} />}
          {keyed.map(({ dk, color }) => (
            <Line
              key={dk}
              dataKey={dk}
              type="linear"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--card)', stroke: color, strokeWidth: 2 }}
              connectNulls={false}
            />
          ))}
        </ComposedChart>
      </ChartContainer>
      <Legend items={keyed.map(({ s, color }) => ({ label: s.label, color }))} />
      <div className="sr-only">
        <table>
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col" />
              {series.map((s) => (
                <th scope="col" key={s.key}>
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={l + i}>
                <th scope="row">{l}</th>
                {series.map((s) => (
                  <td key={s.key}>{fmt(s.values[i])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul aria-hidden className="mt-3 flex list-none flex-wrap gap-4 p-0 text-xs text-muted-foreground">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** A ring with the value in the middle (0–100); the arc is drawn from 12 o'clock. */
export function DonutChart({
  value,
  size = 112,
  stroke = 11,
  color = 'var(--chart-1)',
  label,
  caption,
  center,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  color?: string;
  /** Accessible name, e.g. "PO1 attainment". */
  label: string;
  caption?: ReactNode;
  center?: ReactNode;
}) {
  const v = value === null ? 0 : Math.min(Math.max(value, 0), 100);
  const outer = size / 2;
  const inner = outer - stroke;
  const config: ChartConfig = { value: { label, color } };
  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div role="img" aria-label={`${label}: ${value === null ? '—' : `${Math.round(v)}%`}`} className="relative" style={{ width: size, height: size }}>
        <ChartContainer config={config} aria-hidden className="aspect-square" style={{ width: size, height: size }} initialDimension={{ width: size, height: size }}>
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie data={[{ v: 100 }]} dataKey="v" cx="50%" cy="50%" innerRadius={inner} outerRadius={outer} startAngle={90} endAngle={-270} fill="var(--muted)" stroke="none" isAnimationActive={false} />
            {v > 0 && (
              <Pie
                data={[{ v }]}
                dataKey="v"
                cx="50%"
                cy="50%"
                innerRadius={inner}
                outerRadius={outer}
                startAngle={90}
                endAngle={90 - (v / 100) * 360}
                cornerRadius={stroke / 2}
                fill={color}
                stroke="none"
              />
            )}
          </PieChart>
        </ChartContainer>
        <div className="absolute inset-0 grid place-items-center font-semibold tabular-nums text-foreground" style={{ fontSize: size * 0.22 }}>
          {center ?? (value === null ? '—' : `${Math.round(v)}%`)}
        </div>
      </div>
      {caption && <div className="text-center text-sm text-muted-foreground">{caption}</div>}
    </div>
  );
}

/** Horizontal stacked bars: direct plus indirect per row (0–100 each is not needed; the bar is the combined 0–100). */
export function StackedBars({
  rows,
  ariaLabel,
  parts,
}: {
  rows: { label: string; values: (number | null)[]; total?: number | null }[];
  ariaLabel: string;
  /** One entry per value: its legend label and colour. */
  parts: { label: string; color: string }[];
}) {
  const config: ChartConfig = Object.fromEntries(parts.map((p, i) => [`p${i}`, { label: p.label, color: p.color }]));
  const totalText = (r: (typeof rows)[number]) => {
    const total = r.total ?? r.values.reduce<number>((s, v) => s + (v ?? 0), 0);
    return total ? `${Math.round(total * 10) / 10}%` : '—';
  };
  const data = rows.map((r) => {
    const row: Record<string, string | number | null> = { label: r.label, total: totalText(r) };
    parts.forEach((_, i) => {
      row[`p${i}`] = r.values[i] === null || r.values[i] === undefined ? null : Math.min(r.values[i] as number, 100);
    });
    return row;
  });
  const height = Math.max(rows.length, 1) * 36 + 8;
  return (
    <div role="group" aria-label={ariaLabel}>
      <ul className="sr-only">
        {rows.map((r) => (
          <li key={r.label}>{`${r.label}: ${r.values.map((v, i) => `${parts[i]?.label} ${v === null ? '—' : `${v}%`}`).join(', ')}; ${totalText(r)}`}</li>
        ))}
      </ul>
      <ChartContainer config={config} aria-hidden className="aspect-auto w-full" style={{ height }} initialDimension={{ width: 480, height }}>
        <BarChart data={data} layout="vertical" barCategoryGap={10} margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
          <CartesianGrid horizontal={false} vertical={false} />
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis yAxisId="l" type="category" dataKey="label" tickLine={false} axisLine={false} width={96} tick={{ ...TICK, fill: 'var(--foreground)', fontWeight: 600, fontSize: 13 }} />
          <YAxis yAxisId="r" orientation="right" type="category" dataKey="total" tickLine={false} axisLine={false} width={52} tick={{ ...TICK, fill: 'var(--foreground)', fontWeight: 600, fontSize: 13 }} />
          <ChartTooltip cursor={{ fill: 'var(--muted)' }} content={<ChartTooltipContent formatter={(value, _n, item) => tipRow(item.color, config[String(item.dataKey)]?.label, value === null ? '—' : `${value}%`)} />} />
          {parts.map((p, i) => (
            <Bar key={i} yAxisId="l" dataKey={`p${i}`} stackId="a" fill={p.color} radius={4} />
          ))}
        </BarChart>
      </ChartContainer>
      <Legend items={parts} />
    </div>
  );
}

/** Heat level 0 (no correlation) to 3 (high), as in a CO–PO matrix. Numbers are always printed. */
export type HeatLevel = 0 | 1 | 2 | 3;

const HEAT: Record<HeatLevel, string> = {
  0: 'bg-transparent text-muted-foreground',
  1: 'bg-teal-soft/60 text-teal-ink',
  2: 'bg-teal-soft text-teal-ink',
  3: 'bg-teal text-white',
};

export function HeatCell({ level, children }: { level: HeatLevel; children?: ReactNode }) {
  return (
    <span data-level={level} className={cn('inline-grid h-8 min-w-10 place-items-center rounded-lg px-2 font-semibold tabular-nums', HEAT[level])}>
      {children ?? level}
    </span>
  );
}

/** The key under a heat matrix. */
export function HeatLegend({ labels }: { labels: [string, string, string, string] }) {
  return (
    <ul className="flex list-none flex-wrap gap-4 p-0 text-xs text-muted-foreground">
      {([3, 2, 1, 0] as HeatLevel[]).map((l, i) => (
        <li key={l} className="flex items-center gap-1.5">
          <span className={cn('size-4 rounded border border-border', l === 0 ? 'bg-card' : HEAT[l])} />
          {l} · {labels[i]}
        </li>
      ))}
    </ul>
  );
}

/** A tiny trend line for a stat tile. */
export function Sparkline({ values, width = 96, height = 28, color = 'var(--chart-1)', label }: { values: (number | null)[]; width?: number; height?: number; color?: string; label?: string }) {
  const pts = values.filter((v): v is number => v !== null);
  if (pts.length < 2) return null;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const span = hi - lo || 1;
  const step = width / (pts.length - 1);
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${(height - 3 - ((v - lo) / span) * (height - 6)).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
