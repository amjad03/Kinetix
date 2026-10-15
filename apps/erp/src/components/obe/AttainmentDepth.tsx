'use client';

import { ChevronRight, GitBranch } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Card, EmptyState, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { lvl, type Articulation, type Tree } from '@/lib/obe-flagship';
import { cn } from '@/lib/utils';
import { LevelCell, LevelLegend } from './Heat';

/**
 * How each PO/PSO's attainment was reached: its direct part from every course (the course's articulation with the PO
 * and its attainment towards it, with the COs behind it), the indirect part from surveys, and the overall level.
 */
export function AttainmentTree({ tree, yearId }: { tree: Tree; yearId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(tree.outcomes[0]?.outcomeId ?? null);
  return (
    <Card className="mt-5" title={t('of.tree.title')} subtitle={t(`of.po.${tree.method}` as MessageKey, { d: tree.weights.direct, i: tree.weights.indirect })} testId="of-tree">
      <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-2 p-0">
        {tree.outcomes.map((o) => {
          const expanded = open === o.outcomeId;
          return (
            <li key={o.outcomeId} className="rounded-lg border">
              <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : o.outcomeId)} data-testid={`of-tree-${o.code}`}>
                <ChevronRight className={cn('size-4 shrink-0 transition-transform', expanded && 'rotate-90')} aria-hidden />
                <b className="w-12 shrink-0 font-semibold">{o.code}</b>
                <span className="hidden min-w-0 flex-1 truncate text-[13px] text-muted-foreground sm:block">{o.statement}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <span className="hidden md:inline">{t('of.tree.direct', { v: lvl(o.direct) })}</span>
                  <span className="hidden md:inline">{t('of.tree.indirect', { v: lvl(o.indirect) })}</span>
                  <LevelCell value={o.combined} target={o.target} />
                </span>
              </button>
              {expanded && (
                <div className="overflow-x-auto border-t px-3 pb-3">
                  {o.courses.length === 0 ? (
                    <p className="m-0 py-3 text-[13px] text-muted-foreground">{t('of.tree.none')}</p>
                  ) : (
                    <table className="mt-2 w-full min-w-[560px] text-[13px]">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-1.5 pr-3 font-medium">{t('of.col.course')}</th>
                          <th className="py-1.5 pr-3 text-right font-medium">{t('of.tree.articulation')}</th>
                          <th className="py-1.5 pr-3 text-right font-medium">{t('of.tree.attainment')}</th>
                          <th className="py-1.5 font-medium">{t('of.tree.cos')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.courses.map((c) => (
                          <tr key={c.courseId} className="border-b last:border-0">
                            <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                              <Link href={`/obe/courses/${c.courseId}?tab=attainment&academicYearId=${yearId}`} className="font-medium text-foreground hover:underline">
                                {c.code}
                              </Link>{' '}
                              {c.name}
                            </th>
                            <td className="py-1.5 pr-3 text-right tabular-nums">{lvl(c.articulation)}</td>
                            <td className="py-1.5 pr-3 text-right">
                              <LevelCell value={c.attainment} target={o.target} />
                            </td>
                            <td className="py-1.5">
                              <span className="flex flex-wrap gap-1">
                                {c.cos.map((x) => (
                                  <StatusPill key={x.coId} tone="neutral">
                                    {x.code} ×{x.strength}: {lvl(x.attainment)}
                                  </StatusPill>
                                ))}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <p className="m-0 mt-2 text-xs text-muted-foreground">{t('of.tree.coverage', { pct: o.coverage ?? 0 })}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3">
        <LevelLegend />
      </div>
    </Card>
  );
}

const SHADE = ['', 'bg-[color-mix(in_oklab,var(--primary)_14%,transparent)]', 'bg-[color-mix(in_oklab,var(--primary)_30%,transparent)]', 'bg-[color-mix(in_oklab,var(--primary)_48%,transparent)]'];

/** The programme articulation matrix, built from the course matrices: each course's average strength towards each PO/PSO. */
export function ArticulationMatrix({ pam }: { pam: Articulation }) {
  const { t } = useI18n();
  return (
    <Card className="mt-5" title={t('of.pam.title')} subtitle={t('of.pam.sub')} testId="of-pam">
      {pam.rows.length === 0 ? (
        <EmptyState dense icon={<GitBranch />} title={t('of.pam.none')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0.5 text-[12.5px]">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card px-2 py-1 text-left font-medium text-muted-foreground">{t('of.col.course')}</th>
                {pam.outcomes.map((o) => (
                  <th key={o.id} className="px-1 py-1 text-center font-medium text-muted-foreground" title={o.statement}>
                    {o.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pam.rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="sticky left-0 max-w-[14rem] truncate bg-card px-2 py-1 text-left font-normal">
                    <span className="text-xs text-muted-foreground">{t('of.sem', { n: r.term })} · </span>
                    {r.code} {r.name}
                  </th>
                  {pam.outcomes.map((o) => {
                    const v = r.values[o.id];
                    return (
                      <td key={o.id} className={cn('rounded px-1 py-1 text-center tabular-nums', v ? SHADE[Math.min(3, Math.max(1, Math.round(v)))] : 'text-muted-foreground')}>
                        {v === null ? '·' : lvl(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row" className="sticky left-0 bg-card px-2 py-1.5 text-left font-semibold">
                  {t('of.pam.average')}
                </th>
                {pam.outcomes.map((o) => (
                  <td key={o.id} className="px-1 py-1.5 text-center font-semibold tabular-nums">
                    {lvl(pam.average[o.id])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {pam.missing.length > 0 && <p className="m-0 mt-3 text-xs text-muted-foreground">{t('of.pam.missing', { list: pam.missing.map((m) => m.code).join(', ') })}</p>}
    </Card>
  );
}
