'use client';

import { FileSpreadsheet, FileText, Printer, TableProperties } from 'lucide-react';
import { Button } from '@/components/shadcn/button';
import { EmptyState } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { Register } from '@/lib/attendance-desk';
import { cn } from '@/lib/utils';

/**
 * The monthly attendance register (university format): a row per student, a column per day with the mark or the
 * periods attended of those held, leave as OD/ML/L, the month's totals and percentage against the threshold. Prints
 * on one page and downloads as Excel or PDF.
 */
export function RegisterGrid({ data, sectionId, subjectId }: { data: Register; sectionId: string; subjectId?: string }) {
  const { t, fmt } = useI18n();
  const link = (format: 'xlsx' | 'pdf') => `/api/download?kind=att-register&id=${sectionId}&month=${data.month}&format=${format}${subjectId ? `&subjectId=${subjectId}` : ''}`;
  const tone = (cell: string) => (cell === 'A' || /^0\//.test(cell) ? 'text-red-ink font-semibold' : cell === 'OD' || cell === 'ML' || cell === 'L' ? 'text-blue-ink' : '');
  return (
    <section className="grid gap-3" data-testid="register">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="m-0 text-sm text-muted-foreground">{t('atd.register.legend')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-9" onClick={() => window.print()}>
            <Printer />
            {t('atd.print')}
          </Button>
          <Button variant="outline" className="h-9" asChild>
            <a href={link('xlsx')} data-testid="register-xlsx">
              <FileSpreadsheet />
              {t('atd.excel')}
            </a>
          </Button>
          <Button variant="outline" className="h-9" asChild>
            <a href={link('pdf')}>
              <FileText />
              {t('atd.pdf')}
            </a>
          </Button>
        </div>
      </div>
      {data.students.length === 0 || data.days.length === 0 ? (
        <EmptyState icon={<TableProperties />} title={t('atd.register.empty')}>
          {t('atd.register.emptyBody')}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-max min-w-full border-collapse text-xs">
            <caption className="sr-only">{t('atd.register.caption', { section: data.section, month: data.month })}</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-muted px-2 py-2 text-left">
                  {t('atd.col.roll')}
                </th>
                <th scope="col" className="px-2 py-2 text-left">
                  {t('atd.col.student')}
                </th>
                {data.days.map((d) => (
                  <th key={d} scope="col" className="px-1.5 py-2 text-center font-medium tabular-nums" title={fmt.date(d, 'long')}>
                    {d.slice(8)}
                  </th>
                ))}
                <th scope="col" className="px-2 py-2 text-right">
                  {t('atd.col.held')}
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  {t('atd.col.attended')}
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="sticky left-0 bg-card px-2 py-1.5 tabular-nums">{s.rollNo}</td>
                  <th scope="row" className="px-2 py-1.5 text-left font-normal whitespace-nowrap">
                    {s.fullName}
                  </th>
                  {data.days.map((d) => (
                    <td key={d} className={cn('px-1.5 py-1.5 text-center tabular-nums', tone(s.cells[d] ?? ''))}>
                      {s.cells[d] || (s.enrolledOn && d < s.enrolledOn ? '·' : '')}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt.number(s.held)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt.number(s.attended)}</td>
                  <td className={cn('px-2 py-1.5 text-right font-semibold tabular-nums', s.pct !== null && s.pct < data.thresholdPct && 'text-red-ink')}>{s.pct === null ? '—' : fmt.number(s.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
