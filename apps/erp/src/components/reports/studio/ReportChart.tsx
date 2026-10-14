'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell as PieCell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/shadcn/chart';
import { Legend } from '@/components/ui/Charts';
import { useI18n } from '@/i18n/client';
import { chartPlan, SERIES_VARS, type ChartSpec, type ChartType, type OutColumn, type StudioResult } from '@/lib/report-studio';
import { cn } from '@/lib/utils';
import { axisTick, cellText, chartNumber } from './controls';

/**
 * A report result as a chart. The categorical palette is the validated 8-slot set (light and dark
 * steps, checked for colour-blind separation), assigned in a fixed order; one series uses slot 1.
 * Every chart has a legend for two or more series, a tooltip on hover and keyboard focus, and the
 * table under it is its accessible view. Clicking a bar, point or slice drills into its rows.
 */

/** Light and dark steps of the 8 categorical slots, as CSS variables on the chart root. */
const PALETTE =
  '[--rs-series-1:#2a78d6] [--rs-series-2:#eb6834] [--rs-series-3:#1baf7a] [--rs-series-4:#eda100] [--rs-series-5:#e87ba4] [--rs-series-6:#008300] [--rs-series-7:#6250d6] [--rs-series-8:#e34948] ' +
  'dark:[--rs-series-1:#3987e5] dark:[--rs-series-2:#d95926] dark:[--rs-series-3:#199e70] dark:[--rs-series-4:#c98500] dark:[--rs-series-5:#d55181] dark:[--rs-series-6:#008300] dark:[--rs-series-7:#9085e9] dark:[--rs-series-8:#e66767]';
const TICK = { fontSize: 11, fill: 'var(--muted-foreground)' } as const;
const MAX_BARS = 60;
const MAX_SLICES = 6;

export function ReportChart({ result, type, spec, height = 300, title, onSelect }: { result: StudioResult; type: ChartType; spec?: ChartSpec | null; height?: number; title: string; onSelect?: (rowIndex: number, series?: OutColumn) => void }) {
  const { t, fmt } = useI18n();
  const plan = chartPlan(result, spec);
  const x = plan.x;
  const series = plan.series;
  if (type === 'table' || series.length === 0 || result.rows.length === 0) return null;
  if ((type === 'pie' || type === 'donut') && !plan.pieOk) return <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t('rs.viz.notFit')}</p>;

  const label = t('rs.chart.aria', { title });
  const colorOf = (i: number) => SERIES_VARS[i % SERIES_VARS.length];
  const tip = (col: OutColumn, raw: number | string | boolean | null) => cellText(col, raw, fmt, t);

  if (type === 'kpi') {
    const row = result.rows[0];
    return (
      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]" role="group" aria-label={label}>
        {series.slice(0, 4).map((s) => (
          <div key={s.key} className="rounded-lg border bg-card px-4 py-3">
            <div className="text-xs font-semibold text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-[28px] leading-9 font-semibold tabular-nums">{tip(s, row[s.key] ?? null)}</div>
          </div>
        ))}
      </div>
    );
  }

  if (!x) return null;

  const rows = result.rows.slice(0, type === 'line' || type === 'area' ? 400 : MAX_BARS);
  const data = rows.map((r, i) => {
    const d: Record<string, string | number | null> = { __i: i, name: cellText(x, r[x.key] ?? null, fmt, t) };
    series.forEach((s, k) => {
      d[`s${k}`] = chartNumber(s, r[s.key] ?? null);
      d[`o${k}`] = r[s.key] === undefined ? null : (r[s.key] as number | null);
    });
    return d;
  });
  const config: ChartConfig = Object.fromEntries(series.map((s, k) => [`s${k}`, { label: s.pivotValue !== undefined ? s.pivotValue || t('rs.blank') : s.label, color: colorOf(k) }]));
  const unitType = series[0].type;
  const expand = type === 'stacked100';
  const tickY = (v: number) => (expand ? `${Math.round(v * 100)}%` : axisTick(unitType, v, fmt, t));
  const tooltip = (
    <ChartTooltip
      cursor={{ fill: 'var(--muted)', stroke: 'var(--border)' }}
      content={
        <ChartTooltipContent
          labelKey="name"
          formatter={(_v, _name, item) => {
            const k = Number(String(item.dataKey).slice(1));
            const s = series[k];
            const raw = (item.payload as Record<string, number | null>)[`o${k}`];
            return (
              <div className="flex w-full items-center gap-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ background: colorOf(k) }} />
                <span className="flex-1 text-muted-foreground">{config[`s${k}`]?.label}</span>
                <span className="font-mono font-medium text-foreground tabular-nums">{s ? tip(s, raw) : ''}</span>
              </div>
            );
          }}
        />
      }
    />
  );
  const legend = series.length > 1 ? <Legend items={series.map((s, k) => ({ label: String(config[`s${k}`]?.label ?? s.label), color: colorOf(k) }))} /> : null;
  const select = (i: unknown, k?: number) => {
    if (onSelect && typeof i === 'number') onSelect(i, k === undefined ? undefined : series[k]);
  };

  if (type === 'pie' || type === 'donut') {
    const s = series[0];
    type Slice = { __i: number; name: string; v: number; o0: number | null };
    const sorted: Slice[] = data.map((d) => ({ __i: Number(d.__i), name: String(d.name), v: Number(d.s0 ?? 0), o0: d.o0 === null || d.o0 === undefined ? null : Number(d.o0) })).sort((a, b) => b.v - a.v);
    const head = sorted.slice(0, MAX_SLICES);
    const rest = sorted.slice(MAX_SLICES);
    const slices: Slice[] = rest.length ? [...head, { __i: -1, name: t('rs.chart.other'), v: rest.reduce((a, b) => a + b.v, 0), o0: rest.reduce((a, b) => a + Number(b.o0 ?? 0), 0) }] : head;
    const total = slices.reduce((a, b) => a + b.v, 0) || 1;
    const pieConfig: ChartConfig = Object.fromEntries(slices.map((d, k) => [`p${k}`, { label: String(d.name), color: colorOf(k) }]));
    return (
      <div className={cn('grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]', PALETTE)}>
        <ChartContainer config={pieConfig} role="img" aria-label={label} className="mx-auto aspect-square w-full max-w-[280px]" initialDimension={{ width: 280, height: 280 }}>
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel formatter={(_v, _n, item) => `${(item.payload as Slice).name}: ${tip(s, (item.payload as Slice).o0)}`} />} />
            <Pie data={slices} dataKey="v" nameKey="name" innerRadius={type === 'donut' ? '58%' : 0} outerRadius="100%" paddingAngle={1} stroke="var(--card)" strokeWidth={2} isAnimationActive={false} onClick={(d) => {
                const i = (d as unknown as { payload?: Slice }).payload?.__i;
                if (i !== undefined && i >= 0) select(i);
              }} className={onSelect ? 'cursor-pointer' : undefined}>
              {slices.map((_, k) => (
                <PieCell key={k} fill={colorOf(k)} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className="grid list-none gap-1.5 p-0 text-sm">
          {slices.map((d, k) => (
            <li key={k} className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: colorOf(k) }} />
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="tabular-nums text-muted-foreground">{fmt.number((d.v / total) * 100, { maximumFractionDigits: 1 })}%</span>
              <span className="w-28 text-right font-medium tabular-nums">{tip(s, d.o0)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (type === 'line' || type === 'area') {
    const Chart = type === 'area' ? AreaChart : LineChart;
    return (
      <div className={PALETTE}>
        <ChartContainer config={config} role="img" aria-label={label} className="aspect-auto w-full" style={{ height }} initialDimension={{ width: 720, height }}>
          <Chart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 4 }} onClick={(e: { activeTooltipIndex?: number | string | null }) => select(e?.activeTooltipIndex === undefined || e?.activeTooltipIndex === null ? undefined : Number(e.activeTooltipIndex))}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={TICK} tickMargin={8} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} tick={TICK} width={64} tickFormatter={tickY} />
            {tooltip}
            {series.map((s, k) =>
              type === 'area' ? (
                <Area key={s.key} dataKey={`s${k}`} type="linear" stroke={colorOf(k)} strokeWidth={2} fill={colorOf(k)} fillOpacity={series.length > 1 ? 0.12 : 0.18} stackId={undefined} connectNulls={false} isAnimationActive={false} activeDot={{ r: 4, fill: 'var(--card)', stroke: colorOf(k), strokeWidth: 2 }} />
              ) : (
                <Line key={s.key} dataKey={`s${k}`} type="linear" stroke={colorOf(k)} strokeWidth={2} dot={data.length <= 31 ? { r: 3, fill: colorOf(k), strokeWidth: 0 } : false} activeDot={{ r: 5, fill: 'var(--card)', stroke: colorOf(k), strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
              ),
            )}
          </Chart>
        </ChartContainer>
        {legend}
      </div>
    );
  }

  // Bars: vertical columns, horizontal bars for long labels and rankings, stacked and 100% stacked.
  const horizontal = type === 'hbar';
  const stacked = type === 'stacked' || type === 'stacked100';
  const barHeight = horizontal ? Math.max(height, data.length * 28 + 24) : height;
  const longest = Math.max(...data.map((d) => String(d.name).length));
  return (
    <div className={PALETTE}>
      <ChartContainer config={config} role="img" aria-label={label} className="aspect-auto w-full" style={{ height: barHeight }} initialDimension={{ width: 720, height: barHeight }}>
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} stackOffset={expand ? 'expand' : undefined} barCategoryGap={horizontal ? 6 : '18%'} margin={{ top: 12, right: 16, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke="var(--border)" />
          {horizontal ? (
            <>
              <XAxis type="number" tickLine={false} axisLine={false} tick={TICK} tickFormatter={tickY} />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ ...TICK, fill: 'var(--foreground)' }} width={Math.min(180, Math.max(60, longest * 6.5))} tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 25)}…` : v)} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={TICK} tickMargin={8} interval="preserveStartEnd" tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)} />
              <YAxis tickLine={false} axisLine={false} tick={TICK} width={64} tickFormatter={tickY} />
            </>
          )}
          {tooltip}
          {series.map((s, k) => {
            const last = k === series.length - 1;
            const radius: [number, number, number, number] = !stacked || last ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : [0, 0, 0, 0];
            return (
              <Bar
                key={s.key}
                dataKey={`s${k}`}
                stackId={stacked ? 'a' : undefined}
                fill={colorOf(k)}
                radius={radius}
                stroke="var(--card)"
                strokeWidth={stacked ? 1 : 0}
                maxBarSize={horizontal ? 22 : 48}
                isAnimationActive={false}
                className={onSelect ? 'cursor-pointer' : undefined}
                onClick={(d: { __i?: number; payload?: { __i?: number } }) => select(d.payload?.__i ?? d.__i, result.pivot ? k : undefined)}
                label={spec?.showValues && !stacked ? { position: horizontal ? 'right' : 'top', fontSize: 11, fill: 'var(--muted-foreground)', formatter: (v: unknown) => (typeof v === 'number' ? axisTick(unitType, v, fmt, t) : '') } : undefined}
              />
            );
          })}
        </BarChart>
      </ChartContainer>
      {legend}
      {result.rows.length > MAX_BARS && <p className="mt-2 text-xs text-muted-foreground">{t('rs.chart.firstN', { n: MAX_BARS })}</p>}
    </div>
  );
}
