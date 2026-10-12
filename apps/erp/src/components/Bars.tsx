import { cn } from '@/lib/utils';

// Legacy MUI palette paths still passed by callers, mapped onto the shadcn tokens (app/globals.css).
const PALETTE: Record<string, string> = {
  'primary.main': 'var(--teal)',
  'kx.success': 'var(--green)',
  'success.main': 'var(--green)',
  'error.main': 'var(--red)',
  'warning.main': 'var(--amber)',
  'text.secondary': 'var(--muted-foreground)',
};

/** Resolves a colour prop: a legacy palette path, a CSS var, or any CSS colour. */
function resolve(color: string): string {
  return PALETTE[color] ?? color;
}

/** A thin rounded bar. `value` 0–100. */
export function MiniBar({ value, color, width = '100%', label }: { value: number; color?: string; width?: number | string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="img" aria-label={label ?? `${Math.round(v)}%`} className="h-1.5 overflow-hidden rounded-full bg-muted" style={{ width }}>
      <div className={cn('h-full rounded-full', !color && 'bg-teal')} style={{ width: `${v}%`, background: color ? resolve(color) : undefined }} />
    </div>
  );
}

/** Percentage with a small bar, for table cells. */
export function RateCell({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-sm text-muted-foreground">—</span>;
  const color = rate >= 90 ? 'var(--green)' : rate >= 75 ? 'var(--teal)' : 'var(--red)';
  return (
    <div className="flex items-center justify-end gap-3">
      <div className="w-12 md:w-22">
        <MiniBar value={rate} color={color} />
      </div>
      <span className="min-w-12 text-right text-sm tabular-nums">{rate.toFixed(1)}%</span>
    </div>
  );
}

/** Stacked bar of parts (e.g. taught / live / missed / upcoming), with an accessible summary. */
export function SegmentBar({ parts, label }: { parts: { value: number; color: string }[]; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div role="img" aria-label={label} className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted">
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p, i) => <div key={i} className="h-full rounded-full" style={{ flex: p.value, background: resolve(p.color) }} />)}
    </div>
  );
}
