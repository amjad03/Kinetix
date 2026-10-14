'use client';

import { BarChart3, LineChart, PieChart, Search, Star, Table2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { setFavourite } from '@/app/(dashboard)/reports/studio-actions';
import { EmptyState } from '@/components/States';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { ChartType, LibraryItem } from '@/lib/report-studio';
import { cn } from '@/lib/utils';
import { tk } from './controls';

const ICON: Partial<Record<ChartType, typeof BarChart3>> = { line: LineChart, area: LineChart, pie: PieChart, donut: PieChart, table: Table2 };

/** The ready-made reports: search, filter by area or starred, open one, or star it. */
export function LibraryBrowser({ reports, categories }: { reports: LibraryItem[]; categories: string[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [stars, setStars] = useState(() => new Set(reports.filter((r) => r.favourite).map((r) => r.key)));
  const [, start] = useTransition();
  const present = categories.filter((c) => reports.some((r) => r.category === c));
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return reports.filter((r) => (cat === 'all' || (cat === 'starred' ? stars.has(r.key) : r.category === cat)) && (!term || `${r.title} ${r.description} ${r.datasetLabel}`.toLowerCase().includes(term)));
  }, [reports, q, cat, stars]);

  const toggle = (key: string) => {
    const on = !stars.has(key);
    setStars((s) => {
      const n = new Set(s);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });
    start(async () => {
      const res = await setFavourite(`lib:${key}`, on);
      if (!res.ok) toast.error(res.error);
    });
  };

  return (
    <div className="grid gap-4" data-testid="rs-library">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-[320px] max-sm:w-full">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label={t('rs.lib.search')} placeholder={t('rs.lib.search')} className="h-9 bg-card pl-8" value={q} onChange={(e) => setQ(e.target.value)} data-testid="rs-lib-search" />
        </div>
        <span className="pb-2 text-xs text-muted-foreground" role="status">
          {t('rs.lib.count', { n: shown.length })}
        </span>
      </div>
      <div role="tablist" aria-label={t('rs.lib.areas')} className="flex flex-wrap gap-1.5">
        {['all', 'starred', ...present].map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={cat === c}
            type="button"
            onClick={() => setCat(c)}
            className={cn('h-8 rounded-full border px-3 text-[13px]', cat === c ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}
          >
            {c === 'all' ? t('rs.lib.all') : c === 'starred' ? t('rs.lib.favourites') : tk(t, `rs.cat.${c}`)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={<Search />} title={t('rs.lib.empty')}>
          {t('rs.lib.emptyHelp')}
        </EmptyState>
      ) : (
        <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => {
            const Icon = ICON[r.chart] ?? BarChart3;
            const starred = stars.has(r.key);
            return (
              <li key={r.key} className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-card" data-testid={`rs-lib-${r.key}`}>
                <div className="flex items-start gap-3">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-md bg-teal-soft text-teal-ink">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/reports/view?lib=${r.key}`} className="text-sm font-semibold hover:underline">
                      {r.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>
                  </div>
                  <Button size="icon-sm" variant="ghost" onClick={() => toggle(r.key)} aria-pressed={starred} aria-label={starred ? t('rs.unstar') : t('rs.star')}>
                    <Star className={starred ? 'fill-current text-amber-ink' : undefined} />
                  </Button>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{r.datasetLabel}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/reports/builder?lib=${r.key}`}>{t('rs.v.customise')}</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/reports/view?lib=${r.key}`}>{t('rs.act.open')}</Link>
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
