'use client';

import { Eye } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/shadcn/chart';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';
import { cn } from '@/lib/utils';

export type InboxKind = 'approval' | 'alert' | 'task';
export type InboxTone = 'amber' | 'red' | 'blue' | 'teal' | 'slate';

export interface InboxItem {
  key: string;
  kind: InboxKind;
  tone: InboxTone;
  icon: ReactNode;
  title: string;
  detail?: string;
  action: string;
  href: string;
}

const TONE: Record<InboxTone, string> = {
  amber: 'bg-amber-soft text-amber-ink',
  red: 'bg-red-soft text-red-ink',
  blue: 'bg-blue-soft text-blue-ink',
  teal: 'bg-teal-soft text-teal-ink',
  slate: 'bg-slate-soft text-slate-ink',
};

/** "Needs your attention": approvals, alerts and tasks sorted by urgency, each with one action. */
export function AttentionInbox({ items, testId = 'attention-inbox' }: { items: InboxItem[]; testId?: string }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'all' | InboxKind>('all');
  const shown = items.filter((i) => tab === 'all' || i.kind === tab);
  const tabs: ('all' | InboxKind)[] = ['all', 'approval', 'alert', 'task'];
  return (
    <section data-testid={testId} aria-labelledby="inbox-h" className="flex min-w-0 flex-col rounded-lg border bg-card shadow-card">
      <div className="flex items-start justify-between gap-3 px-[18px] pt-4">
        <div>
          <h2 id="inbox-h" className="m-0 text-[15px] font-semibold">
            {t('home.attention')}
          </h2>
          <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">{t('home.attentionSub', { n: items.length })}</p>
        </div>
        {items.length > 0 && <span className="rounded-full bg-red-soft px-[7px] text-[11px] font-semibold text-red-ink">{items.length}</span>}
      </div>
      <div className="px-[18px] pt-2.5">
        <div role="tablist" aria-label={t('home.attention')} className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-md border bg-card p-[3px]">
          {tabs.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn('rounded-[7px] px-2.5 py-1 text-[12.5px] font-medium whitespace-nowrap text-muted-foreground hover:text-foreground', tab === k && 'bg-accent font-semibold text-foreground')}
            >
              {t(`home.tab.${k}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2">
        {shown.length === 0 ? (
          <div className="p-4">
            <EmptyState dense icon={<Eye />} title={t('home.allClear')}>
              {t('home.allClearSub')}
            </EmptyState>
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {shown.map((i) => (
              <li key={i.key} className="flex items-start gap-3 border-t px-[18px] py-3 first:border-t-0">
                <span aria-hidden className={cn('grid size-[34px] shrink-0 place-items-center rounded-[10px] [&_svg]:!size-4', TONE[i.tone])}>
                  {i.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block text-[13.5px] font-[550]">{i.title}</b>
                  {i.detail && <span className="block text-[12.5px] text-muted-foreground">{i.detail}</span>}
                </div>
                <Link href={i.href} className="inline-flex h-[30px] shrink-0 items-center rounded-lg border bg-card px-2.5 text-[12.5px] font-[550] hover:bg-muted">
                  {i.action}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** A chart card: title, subtitle and the "click to drill down" hint. */
export function ChartCard({ title, subtitle, children, className, testId, drill = true }: { title: string; subtitle?: string; children: ReactNode; className?: string; testId?: string; drill?: boolean }) {
  const { t } = useI18n();
  return (
    <section data-testid={testId} className={cn('flex min-w-0 flex-col rounded-lg border bg-card shadow-card', className)}>
      <div className="flex items-start justify-between gap-3 px-[18px] pt-4">
        <div className="min-w-0">
          <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
          {subtitle && <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</p>}
        </div>
        {drill && (
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <Eye className="size-3.5" />
            {t('home.drill')}
          </span>
        )}
      </div>
      <div className="px-[18px] pt-4 pb-[18px]">{children}</div>
    </section>
  );
}

/** Attendance by month as a line with the 75 % minimum; a click opens the attendance register. */
export function TrendLine({ labels, values, href, ariaLabel, targetLabel }: { labels: string[]; values: (number | null)[]; href: string; ariaLabel: string; targetLabel: string }) {
  const router = useRouter();
  const data = labels.map((l, i) => ({ l, v: values[i] }));
  const nums = values.filter((v): v is number => v !== null);
  const lo = Math.max(0, Math.floor(Math.min(70, ...nums) / 5) * 5);
  const config: ChartConfig = { v: { label: ariaLabel, color: 'var(--chart-1)' } };
  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full" role="img" aria-label={ariaLabel}>
      <LineChart data={data} margin={{ left: -16, right: 8, top: 8 }} onClick={() => router.push(href)} className="cursor-pointer">
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="l" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
        <YAxis domain={[lo, 100]} tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v: number) => `${v}%`} />
        <ReferenceLine y={75} stroke="var(--amber)" strokeDasharray="4 4" label={{ value: targetLabel, position: 'insideTopRight', fontSize: 11, fill: 'var(--amber-ink)' }} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}%`} />} />
        <Line dataKey="v" type="monotone" stroke="var(--color-v)" strokeWidth={2.25} dot={nums.length < 4 ? { r: 3, fill: "var(--color-v)" } : false} activeDot={{ r: 4 }} connectNulls />
      </LineChart>
    </ChartContainer>
  );
}

/** Collected vs outstanding fees per class (₹ lakh); a click opens that class's dues. */
export function FeeBars({ rows, ariaLabel, collectedLabel, outstandingLabel }: { rows: { id: string; label: string; collected: number; outstanding: number }[]; ariaLabel: string; collectedLabel: string; outstandingLabel: string }) {
  const router = useRouter();
  const config: ChartConfig = { collected: { label: collectedLabel, color: 'var(--chart-1)' }, outstanding: { label: outstandingLabel, color: 'var(--chart-5)' } };
  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full" role="img" aria-label={ariaLabel}>
      <BarChart data={rows} margin={{ left: -16, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={4} fontSize={11} interval={0} angle={rows.length > 4 ? -35 : 0} textAnchor={rows.length > 4 ? 'end' : 'middle'} height={rows.length > 4 ? 56 : 30} tickFormatter={(l: string) => (l.length > 11 ? `${l.slice(0, 10)}…` : l)} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v: number) => v.toFixed(1)} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => `${config[String(name)]?.label ?? name}: ₹${Number(v).toFixed(2)} L`} />} />
        <Bar dataKey="collected" stackId="a" fill="var(--color-collected)" className="cursor-pointer" onClick={(d: { payload?: { id: string } }) => d.payload && router.push(`/fees/invoices?class=${d.payload.id}&status=due`)} />
        <Bar dataKey="outstanding" stackId="a" fill="var(--color-outstanding)" radius={[4, 4, 0, 0]} className="cursor-pointer" onClick={(d: { payload?: { id: string } }) => d.payload && router.push(`/fees/invoices?class=${d.payload.id}&status=due`)} />
      </BarChart>
    </ChartContainer>
  );
}

/** Tiny bar series for a KPI card (last values, the latest in teal). */
export function MiniBars({ values, label }: { values: number[]; label?: string }) {
  const max = Math.max(1, ...values);
  return (
    <span role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="flex h-7 items-end gap-[3px]">
      {values.map((v, i) => (
        <i key={i} className={cn('block w-[6px] rounded-sm', i === values.length - 1 ? 'bg-teal' : 'bg-teal/35')} style={{ height: `${Math.max(12, (v / max) * 100)}%` }} />
      ))}
    </span>
  );
}

/** A small progress track for a KPI card. */
export function MiniMeter({ value, tone = 'teal' }: { value: number; tone?: 'teal' | 'amber' | 'red' }) {
  return (
    <span aria-hidden className="block h-1.5 w-20 overflow-hidden rounded-full bg-muted">
      <i className={cn('block h-full rounded-full', tone === 'teal' ? 'bg-teal' : tone === 'amber' ? 'bg-amber' : 'bg-red')} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}

/**
 * One bar per row with an optional reference line (bars under it turn amber); a click opens the
 * row's own page (the drill-down).
 */
export function DrillBars({ rows, ariaLabel, unit = '', refValue, refLabel, max, money }: { rows: { id: string; label: string; value: number; href: string }[]; ariaLabel: string; unit?: string; refValue?: number; refLabel?: string; max?: number; money?: boolean }) {
  const router = useRouter();
  const config: ChartConfig = { value: { label: ariaLabel, color: 'var(--chart-1)' } };
  const show = (v: number) => (money ? `₹${v.toFixed(2)} L` : `${Math.round(v * 10) / 10}${unit}`);
  const tilt = rows.length > 5;
  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full" role="img" aria-label={ariaLabel}>
      <BarChart data={rows} margin={{ left: -16, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={4} fontSize={11} interval={0} angle={tilt ? -35 : 0} textAnchor={tilt ? 'end' : 'middle'} height={tilt ? 56 : 30} tickFormatter={(l: string) => (l.length > 11 ? `${l.slice(0, 10)}…` : l)} />
        <YAxis domain={[0, max ?? 'auto']} tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v: number) => (money ? v.toFixed(1) : `${v}${unit}`)} />
        {refValue !== undefined && <ReferenceLine y={refValue} stroke="var(--amber)" strokeDasharray="4 4" label={refLabel ? { value: refLabel, position: 'insideTopRight', fontSize: 11, fill: 'var(--amber-ink)' } : undefined} />}
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => show(Number(v))} />} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} className="cursor-pointer" onClick={(d: { payload?: { href: string } }) => d.payload && router.push(d.payload.href)}>
          {rows.map((r) => (
            <Cell key={r.id} fill={refValue !== undefined && r.value < refValue ? 'var(--amber)' : 'var(--color-value)'} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
