import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Trend {
  /** Change versus the comparison period: a percentage (or points); null when there is nothing to compare. */
  delta: number | null;
  /** What the change is measured against, already translated ("vs last month"). */
  label?: string;
  /** Which direction is good news (default up). A rise in overdue fees is bad. */
  goodWhen?: 'up' | 'down';
  /** Suffix after the number; default %. */
  suffix?: string;
}

/** A change pill: arrow, signed number and what it is against. Direction is shown by the arrow and the sign, not only colour. */
export function TrendPill({ delta, label, goodWhen = 'up', suffix = '%' }: Trend) {
  if (delta === null) return null;
  const flat = delta === 0;
  const up = delta > 0;
  const good = flat ? null : up === (goodWhen === 'up');
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
  const shown = `${up ? '+' : ''}${Math.round(delta * 10) / 10}${suffix}`;
  return (
    <span data-trend={flat ? 'flat' : up ? 'up' : 'down'} className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn('inline-flex items-center gap-0.5 rounded-full px-[7px] py-px text-xs font-semibold', good === null ? 'bg-slate-soft text-slate-ink' : good ? 'bg-green-soft text-green-ink' : 'bg-red-soft text-red-ink')}>
        <Icon aria-hidden className="size-3" strokeWidth={2.5} />
        {shown}
      </span>
      {label && <span className="text-[12.5px] text-muted-foreground">{label}</span>}
    </span>
  );
}

/**
 * A KPI card: a small uppercase label (and an optional icon chip), one big number with an optional
 * mini chart beside it, then the trend pill and one line of context. Compact padding; tiles in a
 * StatGrid row share one height. With `href` the whole card is a link
 * (the drill-down into the filtered list).
 */
export function StatTile({
  label,
  value,
  unit,
  caption,
  icon,
  bar,
  trend,
  spark,
  tone = 'default',
  href,
  testId,
}: {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  caption?: ReactNode;
  icon?: ReactNode;
  bar?: ReactNode;
  trend?: Trend;
  spark?: ReactNode;
  tone?: 'default' | 'warning' | 'live';
  href?: string;
  testId?: string;
}) {
  const body = (
    <div className="flex h-full flex-col px-4 py-3.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="m-0 truncate text-[11.5px] leading-4 font-semibold tracking-[0.05em] text-muted-foreground uppercase">{label}</h3>
        {icon && (
          <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:!size-3.5">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-end justify-between gap-2">
        <p className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <b className={cn('text-[18px] leading-8 font-[650] whitespace-nowrap tracking-[-0.02em] tabular-nums @[180px]:text-[22px] @[220px]:text-[26px]', tone === 'warning' ? 'text-red-ink' : tone === 'live' ? 'text-orange-ink' : 'text-foreground')}>{value}</b>
          {unit && <span className="min-w-0 text-[13px] [overflow-wrap:anywhere] text-muted-foreground">{unit}</span>}
        </p>
        {spark && <div className="shrink-0">{spark}</div>}
      </div>
      {bar && <div className="mt-2">{bar}</div>}
      {(trend || caption) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-[18px] text-muted-foreground">
          {trend && <TrendPill {...trend} />}
          {caption && <div className="min-w-0">{caption}</div>}
        </div>
      )}
    </div>
  );
  return (
    <div data-testid={testId} className={cn('@container relative h-full min-w-0 rounded-lg border bg-card shadow-card transition-colors', href && 'hover:border-border-strong')}>
      {href ? (
        <Link href={href} className="block h-full rounded-[inherit] text-inherit no-underline">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

/** A responsive row of StatTiles: as many columns of at least `min` px as fit (two on a phone), equal heights. */
export function StatGrid({ children, min = 170 }: { children: ReactNode; min?: number }) {
  return (
    <div data-slot="stat-grid" className="mb-5 grid auto-rows-fr gap-3 sm:gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, calc(50% - 8px)), 1fr))` }}>
      {children}
    </div>
  );
}
