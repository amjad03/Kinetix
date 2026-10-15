'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n/client';
import { heatTone, lvl, type HeatTone } from '@/lib/obe-flagship';
import { cn } from '@/lib/utils';

const TONE: Record<HeatTone, string> = {
  met: 'bg-[color-mix(in_oklab,var(--kx-success)_22%,transparent)] text-foreground',
  near: 'bg-[color-mix(in_oklab,var(--kx-warning)_26%,transparent)] text-foreground',
  short: 'bg-[color-mix(in_oklab,var(--kx-danger)_22%,transparent)] text-foreground',
  none: 'bg-muted/50 text-muted-foreground',
};

/** One attainment value as a coloured cell: met the target, within 80% of it, or short of it. */
export function LevelCell({ value, target, href, title }: { value: number | null; target: number | null; href?: string; title?: string }) {
  const tone = heatTone(value, target);
  const body = (
    <span className={cn('inline-flex h-8 min-w-[3rem] items-center justify-center rounded-md px-1.5 text-[12.5px] font-semibold tabular-nums', TONE[tone])} title={title} data-tone={tone}>
      {lvl(value)}
    </span>
  );
  return href ? (
    <Link href={href} className="rounded-md no-underline focus-visible:outline-2">
      {body}
    </Link>
  ) : (
    body
  );
}

/** The colours of the heat maps, explained. */
export function LevelLegend() {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground" data-testid="level-legend">
      {(['met', 'near', 'short', 'none'] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={cn('inline-block size-3 rounded-sm', TONE[k])} aria-hidden />
          {t(`of.heat.${k}`)}
        </span>
      ))}
    </div>
  );
}

/**
 * A heat map: one row per item (a course or a programme), one column per code (CO1…, PO1…), scrolling sideways on a
 * phone with the row names kept in view.
 */
export function HeatGrid({ rows, label, testId }: { rows: { key: string; title: string; sub?: string; href?: string; cells: { code: string; value: number | null; target: number | null; href?: string }[] }[]; label: string; testId?: string }) {
  const codes = [...new Set(rows.flatMap((r) => r.cells.map((c) => c.code)))].sort((a, b) => (a.startsWith('PSO') === b.startsWith('PSO') ? a.localeCompare(b, 'en', { numeric: true }) : a.startsWith('PSO') ? 1 : -1));
  return (
    <div className="overflow-x-auto" data-testid={testId}>
      <table className="w-full border-separate border-spacing-1 text-[13px]" aria-label={label}>
        <thead>
          <tr>
            <th className="sticky left-0 z-[1] bg-card px-2 py-1 text-left font-medium text-muted-foreground" scope="col">
              {label}
            </th>
            {codes.map((c) => (
              <th key={c} scope="col" className="px-1 py-1 text-center text-xs font-medium text-muted-foreground">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="sticky left-0 z-[1] max-w-[15rem] bg-card px-2 py-1 text-left font-normal">
                {r.href ? (
                  <Link href={r.href} className="font-medium text-foreground hover:underline">
                    {r.title}
                  </Link>
                ) : (
                  <span className="font-medium">{r.title}</span>
                )}
                {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
              </th>
              {codes.map((code) => {
                const cell = r.cells.find((c) => c.code === code);
                return <td key={code} className="text-center">{cell ? <LevelCell value={cell.value} target={cell.target} href={cell.href} title={`${r.title} ${code}`} /> : <span className="text-xs text-muted-foreground">·</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
