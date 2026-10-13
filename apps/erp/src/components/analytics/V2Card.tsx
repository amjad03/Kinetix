import type { ReactNode } from 'react';
import type { NavIcon } from '@/lib/nav';
import { NavTile } from '@/components/shell/nav-icons';

/** Redesign v2 dashboard card: a title row with an optional coloured tile, then the content. */
export function V2Card({ title, icon, action, children, className = '' }: { title: string; icon?: NavIcon; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border bg-card p-5 shadow-card ${className}`}>
      <header className="mb-4 flex items-center gap-2.5">
        {icon && <NavTile icon={icon} />}
        <h3 className="m-0 flex-1 text-[15px] font-semibold">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

/** A KPI tile: coloured icon, label, big number and a caption. */
export function Kpi({ icon, label, value, caption, viz }: { icon: NavIcon; label: string; value: ReactNode; caption?: ReactNode; viz?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border bg-card p-4 shadow-card" data-testid="kpi">
      <NavTile icon={icon} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-[22px] leading-tight font-semibold tabular-nums">{value}</div>
        {caption && <div className="mt-0.5 truncate text-xs text-muted-foreground">{caption}</div>}
      </div>
      {viz && <div className="shrink-0 self-end">{viz}</div>}
    </div>
  );
}

/** Horizontal bars with labels and values (department health, channels, funnel). */
export function Bars({ rows, unit = '', tone = 'bg-teal' }: { rows: { label: string; value: number; caption?: string }[]; unit?: string; tone?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
          <span className="truncate">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted">
            <i className={`block h-full rounded-full ${tone}`} style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <b className="text-right tabular-nums">
            {r.value}
            {unit}
            {r.caption && <span className="ml-1 text-xs font-normal text-muted-foreground">{r.caption}</span>}
          </b>
        </li>
      ))}
    </ul>
  );
}

/** Vertical columns with labels under them: one or two series (the second drawn lighter beside the first). */
export function ColumnBars({ rows, unit = '', max: fixedMax, label, legend, testId }: { rows: { label: string; a: number | null; b?: number | null; highlight?: boolean }[]; unit?: string; max?: number; label: string; legend?: [string, string]; testId?: string }) {
  const max = fixedMax ?? Math.max(1, ...rows.flatMap((r) => [r.a ?? 0, r.b ?? 0]));
  return (
    <figure className="m-0 grid gap-2" role="img" aria-label={label} data-testid={testId}>
      <div className="flex h-[170px] items-end gap-2 border-b pb-px">
        {rows.map((r) => (
          <div key={r.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <span className="mb-1 text-center text-[11px] font-semibold tabular-nums text-muted-foreground">{r.a === null ? '–' : `${r.a}${unit}`}</span>
            <div className="flex h-full items-end justify-center gap-[3px]">
              <i className="block w-full max-w-[22px] rounded-t-[5px]" style={{ height: `${((r.a ?? 0) / max) * 100}%`, background: 'var(--chart-1)', opacity: r.highlight ? 1 : 0.7 }} title={`${r.label}: ${r.a ?? '–'}${unit}`} />
              {r.b !== undefined && <i className="block w-full max-w-[22px] rounded-t-[5px]" style={{ height: `${((r.b ?? 0) / max) * 100}%`, background: 'var(--chart-2)' }} title={`${r.label}: ${r.b ?? '–'}${unit}`} />}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {rows.map((r) => (
          <span key={r.label} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground">
            {r.label}
          </span>
        ))}
      </div>
      {legend && (
        <figcaption className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: 'var(--chart-1)' }} />{legend[0]}</span>
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: 'var(--chart-2)' }} />{legend[1]}</span>
        </figcaption>
      )}
    </figure>
  );
}
