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
