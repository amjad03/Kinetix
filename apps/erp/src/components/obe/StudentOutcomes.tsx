'use client';

import { Target } from 'lucide-react';
import { EmptyState, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { lvl, type StudentOutcomes } from '@/lib/obe-flagship';
import { cn } from '@/lib/utils';

/** A student's CO-wise attainment in each course of the year: CIE, SEE and overall percentage against the threshold, with the class level. */
export function StudentOutcomesView({ data }: { data: StudentOutcomes }) {
  const { t, fmt } = useI18n();
  if (!data.courses.length) return <EmptyState dense icon={<Target />} title={t('of.stu.none')} />;
  return (
    <div className="grid gap-4" data-testid="of-student-outcomes">
      {data.courses.map((c) => {
        const attained = c.cos.filter((x) => x.attained).length;
        const measured = c.cos.filter((x) => x.attained !== null).length;
        return (
          <section key={c.subjectId} className="rounded-lg border p-4">
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="m-0 text-sm font-semibold">
                {c.code} {c.name}
              </h3>
              <span className="text-xs text-muted-foreground">{measured ? t('of.stu.summary', { a: attained, n: measured, th: c.threshold }) : t('of.stu.notYet')}</span>
            </header>
            <ul className="m-0 grid list-none gap-2 p-0">
              {c.cos.map((x) => (
                <li key={x.coId} className="grid items-center gap-x-3 gap-y-1 text-[13px] sm:grid-cols-[56px_minmax(0,1fr)_160px_96px]">
                  <b className="font-semibold">{x.code}</b>
                  <span className="min-w-0 text-muted-foreground">{x.statement}</span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span className={cn('block h-full rounded-full', x.attained ? 'bg-teal' : x.overall === null ? 'bg-muted' : 'bg-amber-500')} style={{ width: `${Math.min(100, x.overall ?? 0)}%` }} />
                    </span>
                    <span className="w-12 text-right tabular-nums">{x.overall === null ? '-' : `${fmt.number(x.overall)}%`}</span>
                  </span>
                  <span className="text-right">
                    {x.attained === null ? <StatusPill tone="neutral">{t('of.stu.pending')}</StatusPill> : <StatusPill tone={x.attained ? 'success' : 'warning'}>{t(x.attained ? 'of.stu.attained' : 'of.stu.notAttained')}</StatusPill>}
                  </span>
                  <span className="text-xs text-muted-foreground sm:col-start-2 sm:col-end-5">
                    {t('of.stu.detail', { cie: x.cie === null ? '-' : `${fmt.number(x.cie)}%`, see: x.see === null ? '-' : `${fmt.number(x.see)}%`, cls: lvl(x.classLevel), target: lvl(x.target) })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
