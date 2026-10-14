// Small SVG charts for the accreditation pages: a completeness ring, the NAAC CGPA gauge and a score bar.
import { cn } from '@/lib/utils';

/** Rounded so the server and the browser print the same SVG numbers (no hydration mismatch). */
const rd = (n: number) => Math.round(n * 100) / 100;
const ringTone = (p: number) => (p < 50 ? 'stroke-red' : p < 80 ? 'stroke-amber' : 'stroke-teal');

/** A completeness ring: the share done, as a percentage in the middle. */
export function Ring({ value, size = 54, stroke = 6, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={rd(c)} strokeDashoffset={rd(c * (1 - Math.min(100, Math.max(0, value)) / 100))} className={ringTone(value)} />
      </svg>
      <b className={cn('absolute font-semibold tabular-nums', size > 80 ? 'text-2xl' : 'text-[12px]')}>{Math.round(value)}%</b>
    </span>
  );
}

/** NAAC grade ticks on the 4-point scale. */
const TICKS: [number, string][] = [
  [1.51, 'C'],
  [2.01, 'B'],
  [2.51, 'B+'],
  [3.01, 'A'],
  [3.51, 'A++'],
];
export const NAAC_BANDS: [number, string][] = [
  [3.51, 'A++'],
  [3.26, 'A+'],
  [3.01, 'A'],
  [2.76, 'B++'],
  [2.51, 'B+'],
  [2.01, 'B'],
  [1.51, 'C'],
];

/** A half-circle gauge of a score out of `max` (the NAAC CGPA out of 4 shows the grade ticks). */
export function Gauge({ value, max = 4, caption, label, ticks = max === 4 }: { value: number; max?: number; caption: string; label: string; ticks?: boolean }) {
  const cx = 130;
  const cy = 132;
  const r = 90;
  const pt = (v: number) => {
    const a = Math.PI * (1 - Math.min(max, Math.max(0, v)) / max);
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
      <path d={arc(0, max)} fill="none" strokeWidth={14} strokeLinecap="round" className="stroke-muted" />
      <path d={arc(0, Math.max(max / 400, value))} fill="none" strokeWidth={14} strokeLinecap="round" className="stroke-teal" />
      {ticks &&
        TICKS.map(([b, l]) => {
          const a = Math.PI * (1 - b / 4);
          return (
            <text key={l} x={rd(cx + (r + 22) * Math.cos(a))} y={rd(cy - (r + 22) * Math.sin(a) + 3)} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {l}
            </text>
          );
        })}
      <circle cx={nx} cy={ny} r={9} className="fill-card stroke-foreground" strokeWidth={3} />
      <text x={cx} y={cy - 14} textAnchor="middle" className="fill-foreground text-[34px] font-bold">
        {max === 4 ? value.toFixed(2) : Math.round(value * 10) / 10}
      </text>
      <text x={cx} y={cy + 30} textAnchor="middle" className="fill-muted-foreground text-[12px]">
        {caption}
      </text>
    </svg>
  );
}

/** A thin horizontal meter: the share filled, coloured by how far along it is. */
export function Meter({ value, label }: { value: number; label?: string }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <span className="inline-flex min-w-[96px] items-center gap-2" title={label}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn('block h-full rounded-full', v < 50 ? 'bg-red' : v < 80 ? 'bg-amber' : 'bg-teal')} style={{ width: `${v}%` }} />
      </span>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{Math.round(v)}%</span>
    </span>
  );
}
