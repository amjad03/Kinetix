'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useI18n } from '@/i18n/client';

// Light SVG charts on the design tokens (--kx-chart-*, see theme/tokens.css): no chart library.
// Every chart has an aria-label, never relies on colour alone (values are printed or in a table
// for screen readers), and respects reduced motion.

export const SERIES = ['var(--kx-chart-1)', 'var(--kx-chart-2)', 'var(--kx-chart-3)', 'var(--kx-chart-4)', 'var(--kx-chart-5)'] as const;

const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const;

/** A smooth-ish polyline through points (straight segments keep values honest). */
function path(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

export interface LineSeries {
  key: string;
  label: string;
  values: (number | null)[];
  color?: string;
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
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  min?: number;
  max?: number;
  unit?: string;
  ariaLabel: string;
  area?: boolean;
}) {
  const { t } = useI18n();
  const gid = useId();
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const pad = { l: 40, r: 12, t: 12, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (labels.length <= 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((Math.min(Math.max(v, min), max) - min) / (max - min || 1)) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(min + f * (max - min)));
  const hasData = series.some((s) => s.values.some((v) => v !== null));

  const segments = series.map((s, si) => {
    const color = s.color ?? SERIES[si % SERIES.length];
    const runs: { x: number; y: number }[][] = [];
    let cur: { x: number; y: number }[] = [];
    s.values.forEach((v, i) => {
      if (v === null) {
        if (cur.length) runs.push(cur);
        cur = [];
      } else cur.push({ x: x(i), y: y(v) });
    });
    if (cur.length) runs.push(cur);
    return { s, color, runs };
  });

  const nearest = (e: PointerEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || labels.length === 0) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = labels.length <= 1 ? 0 : Math.round(((px - pad.l) / iw) * (labels.length - 1));
    setHover(Math.min(Math.max(i, 0), labels.length - 1));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min((h ?? -1) + 1, labels.length - 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max((h ?? labels.length) - 1, 0));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };

  if (!hasData) {
    return (
      <Box sx={{ height, display: 'grid', placeItems: 'center', color: 'text.secondary', border: 1, borderStyle: 'dashed', borderColor: 'm3.outlineVariant', borderRadius: '12px' }}>
        <Typography variant="body2">{t('ui.chart.noData')}</Typography>
      </Box>
    );
  }

  const tip = hover === null ? null : { i: hover, left: (x(hover) / W) * 100 };
  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        component="svg"
        ref={ref}
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerMove={nearest}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
        sx={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y', borderRadius: '8px' }}
      >
        <defs>
          {segments.map(({ color }, i) => (
            <linearGradient key={i} id={`${gid}-${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tv)} y2={y(tv)} stroke="var(--kx-line)" strokeWidth={1} strokeDasharray={tv === min ? undefined : '3 4'} />
            <text x={pad.l - 8} y={y(tv) + 4} textAnchor="end" fontSize={11} fill="var(--kx-muted)">
              {tv}
              {unit}
            </text>
          </g>
        ))}
        {labels.map((l, i) => (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--kx-muted)">
            {l}
          </text>
        ))}
        {segments.map(({ s, color, runs }, si) =>
          runs.map((run, ri) => (
            <g key={`${s.key}-${ri}`}>
              {area && si === 0 && run.length > 1 && <path d={`${path(run)} L${run[run.length - 1].x} ${pad.t + ih} L${run[0].x} ${pad.t + ih} Z`} fill={`url(#${gid}-${si})`} />}
              <path d={path(run)} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              {run.length === 1 && <circle cx={run[0].x} cy={run[0].y} r={3.5} fill={color} />}
            </g>
          )),
        )}
        {tip && (
          <g>
            <line x1={x(tip.i)} x2={x(tip.i)} y1={pad.t} y2={pad.t + ih} stroke="var(--kx-outline)" strokeWidth={1} />
            {segments.map(({ s, color }) => {
              const v = s.values[tip.i];
              return v === null || v === undefined ? null : <circle key={s.key} cx={x(tip.i)} cy={y(v)} r={4.5} fill="var(--kx-surface)" stroke={color} strokeWidth={2.5} />;
            })}
          </g>
        )}
      </Box>
      {tip && (
        <Box
          role="status"
          sx={{
            position: 'absolute',
            top: 8,
            left: `${tip.left}%`,
            transform: tip.left > 60 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
            pointerEvents: 'none',
            bgcolor: 'kx.pane',
            border: 1,
            borderColor: 'm3.outlineVariant',
            borderRadius: '10px',
            boxShadow: 'var(--kx-elev-raised)',
            px: 1.5,
            py: 1,
            minWidth: 150,
            zIndex: 1,
          }}
        >
          <Typography variant="caption" component="p" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
            {labels[tip.i]}
          </Typography>
          {segments.map(({ s, color }) => (
            <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.75rem', color: 'text.primary' }}>
              <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
              <Box component="span" sx={{ flex: 1, color: 'text.secondary' }}>
                {s.label}
              </Box>
              <Box component="span" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {s.values[tip.i] === null ? '—' : `${s.values[tip.i]}${unit}`}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      <Legend items={segments.map(({ s, color }) => ({ label: s.label, color }))} />
      <Box component="table" sx={srOnly}>
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
                <td key={s.key}>{s.values[i] === null ? '—' : `${s.values[i]}${unit}`}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <Box component="ul" aria-hidden sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, listStyle: 'none', m: 0, mt: 1.5, p: 0 }}>
      {items.map((it) => (
        <Box component="li" key={it.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.75rem', color: 'text.secondary' }}>
          <Box component="span" sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: it.color }} />
          {it.label}
        </Box>
      ))}
    </Box>
  );
}

/** A ring with the value in the middle (0–100); the arc is drawn from 12 o'clock. */
export function DonutChart({
  value,
  size = 112,
  stroke = 11,
  color = 'var(--kx-chart-1)',
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
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.min(Math.max(value, 0), 100);
  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <Box role="img" aria-label={`${label}: ${value === null ? '—' : `${Math.round(v)}%`}`} sx={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--kx-line)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(v / 100) * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dasharray 600ms var(--kx-ease-emphasized)' }}
          />
        </svg>
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: size * 0.22, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
          {center ?? (value === null ? '—' : `${Math.round(v)}%`)}
        </Box>
      </Box>
      {caption && (
        <Typography variant="body2" component="div" sx={{ color: 'text.secondary', textAlign: 'center' }}>
          {caption}
        </Typography>
      )}
    </Box>
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
  return (
    <Box role="group" aria-label={ariaLabel}>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
        {rows.map((r) => {
          const total = r.total ?? r.values.reduce<number>((s, v) => s + (v ?? 0), 0);
          return (
            <Box component="li" key={r.label} sx={{ display: 'grid', gridTemplateColumns: '104px 1fr 52px', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {r.label}
              </Typography>
              <Box
                role="img"
                aria-label={`${r.label}: ${r.values.map((v, i) => `${parts[i]?.label} ${v === null ? '—' : `${v}%`}`).join(', ')}`}
                sx={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', bgcolor: 'm3.surfaceContainerHigh' }}
              >
                {r.values.map((v, i) => (v ? <Box key={i} sx={{ width: `${Math.min(v, 100)}%`, bgcolor: parts[i]?.color }} /> : null))}
              </Box>
              <Typography variant="body2" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {total ? `${Math.round(total * 10) / 10}%` : '—'}
              </Typography>
            </Box>
          );
        })}
      </Box>
      <Legend items={parts} />
    </Box>
  );
}

/** Heat level 0 (no correlation) to 3 (high), as in a CO–PO matrix. Numbers are always printed. */
export type HeatLevel = 0 | 1 | 2 | 3;

const HEAT: Record<HeatLevel, { bg: string; fg: string }> = {
  0: { bg: 'transparent', fg: 'var(--kx-muted)' },
  1: { bg: 'color-mix(in srgb, var(--kx-accent-container) 55%, var(--kx-surface))', fg: 'var(--kx-on-accent-container)' },
  2: { bg: 'var(--kx-accent-container)', fg: 'var(--kx-on-accent-container)' },
  3: { bg: 'var(--kx-accent)', fg: 'var(--kx-on-accent)' },
};

export function HeatCell({ level, children }: { level: HeatLevel; children?: ReactNode }) {
  const c = HEAT[level];
  return (
    <Box component="span" data-level={level} sx={{ display: 'inline-grid', placeItems: 'center', minWidth: 40, height: 32, px: 1, borderRadius: '8px', bgcolor: c.bg, color: c.fg, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
      {children ?? level}
    </Box>
  );
}

/** The key under a heat matrix. */
export function HeatLegend({ labels }: { labels: [string, string, string, string] }) {
  return (
    <Box component="ul" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, listStyle: 'none', m: 0, p: 0 }}>
      {([3, 2, 1, 0] as HeatLevel[]).map((l, i) => (
        <Box component="li" key={l} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.75rem', color: 'text.secondary' }}>
          <Box component="span" sx={{ width: 16, height: 16, borderRadius: '4px', border: 1, borderColor: 'm3.outlineVariant', bgcolor: HEAT[l].bg === 'transparent' ? 'kx.pane' : HEAT[l].bg }} />
          {l} · {labels[i]}
        </Box>
      ))}
    </Box>
  );
}

/** A tiny trend line for a stat tile. */
export function Sparkline({ values, width = 96, height = 28, color = 'var(--kx-chart-1)', label }: { values: (number | null)[]; width?: number; height?: number; color?: string; label?: string }) {
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
