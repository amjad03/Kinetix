'use client';
import Link from 'next/link';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import { ArrowRight, Send } from 'lucide-react';
import { sendFeeReminders } from '@/app/(dashboard)/students/sheet-actions';
import { FeeBars } from '@/components/dashboard/home';
import { Avatar, AvatarFallback } from '@/components/shadcn/avatar';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/shadcn/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/i18n/client';
import { formatDate, formatMonthShort } from '@/lib/dates';
import { initials, monthlyTotals, type Defaulter, type Receipt } from '@/lib/roster';
import { cn } from '@/lib/utils';
import { naturalSortBy } from '@/lib/natural';

export interface SettlementBatchRow {
  id: string;
  provider: string;
  reference: string;
  settlementDate: string;
  netPaise: number;
  lineCount: number;
  exceptionCount: number;
}

export interface FeesBoardProps {
  billedPaise: number;
  collectedPaise: number;
  classes: { id: string; label: string; collected: number; outstanding: number }[];
  months: string[];
  receipts: Receipt[] | null;
  defaulters: Defaulter[] | null;
  settlements: { batches: SettlementBatchRow[]; unsettled: number; exceptions: number } | null;
}

/** Fees & accounts: collection against target, by class and by month, defaulters, receipts and gateway settlements. */
export function FeesBoard({ billedPaise, collectedPaise, classes, months, receipts, defaulters, settlements }: FeesBoardProps) {
  const { t, fmt, locale } = useI18n();
  const toast = useToast();
  const [month, setMonth] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pct = billedPaise > 0 ? (collectedPaise / billedPaise) * 100 : 0;
  const monthName = (m: string) => formatMonthShort(m, locale, true);
  const totals = useMemo(() => (receipts ? monthlyTotals(receipts, months).map((m) => ({ ...m, label: monthName(m.month), lakh: m.paise / 1e7 })) : []), [receipts, months]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownReceipts = (receipts ?? []).filter((r) => !month || r.day.startsWith(month)).slice(0, month ? 200 : 10);
  const owed = (defaulters ?? []).reduce((s, d) => s + d.overduePaise, 0);
  const config: ChartConfig = { lakh: { label: t('fo.month.label'), color: 'var(--chart-1)' } };

  const remind = (ids: string[]) =>
    start(async () => {
      const res = await sendFeeReminders(ids);
      if (!res.ok) toast.error(res.error);
      else toast.success(res.data.reminded ? t('ro.reminded', { n: res.data.reminded }) : t('ro.remindNone'));
    });

  return (
    <div className="mt-6 grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title={t('fo.target.title')} subtitle={t('fo.target.sub')} testId="fee-target">
          <div className="flex items-center gap-5">
            <Ring pct={pct} />
            <div className="min-w-0">
              <b className="block text-[26px] leading-tight font-[650] tabular-nums">{fmt.rupeesShort(collectedPaise)}</b>
              <span className="text-[13px] text-muted-foreground">/ {fmt.rupeesShort(billedPaise)}</span>
              <p className="m-0 mt-2 text-[13px]">{t('fo.target.left', { amount: fmt.rupeesShort(Math.max(0, billedPaise - collectedPaise)) })}</p>
            </div>
          </div>
        </Panel>
        <Panel title={t('fo.month.title')} subtitle={t('fo.month.sub')} className="lg:col-span-2" testId="fee-monthly">
          {receipts === null ? (
            <Muted>{t('ro.loadFailed')}</Muted>
          ) : (
            <ChartContainer config={config} className="aspect-auto h-[220px] w-full" role="img" aria-label={t('fo.month.aria')}>
              <BarChart data={totals} margin={{ left: -16, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v: number) => v.toFixed(1)} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${fmt.rupeesShort(Number(v) * 1e7)}`} />} />
                <Bar dataKey="lakh" radius={[4, 4, 0, 0]} className="cursor-pointer" onClick={(d: { payload?: { month: string } }) => d.payload && setMonth((m) => (m === d.payload!.month ? null : d.payload!.month))}>
                  {totals.map((m) => (
                    <Cell key={m.month} fill={!month || month === m.month ? 'var(--color-lakh)' : 'color-mix(in oklab, var(--color-lakh) 35%, transparent)'} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
          {/* Keyboard and screen-reader route to the same click-through. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {totals.map((m) => (
              <Button key={m.month} size="xs" variant={month === m.month ? 'default' : 'outline'} aria-pressed={month === m.month} onClick={() => setMonth(month === m.month ? null : m.month)}>
                {m.label} · {fmt.rupeesShort(m.paise)}
              </Button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title={t('fo.byClass.title')} subtitle={t('fo.byClass.sub')} className="lg:col-span-2" testId="fee-by-class">
          <FeeBars rows={naturalSortBy(classes, (c) => c.label)} ariaLabel={t('fo.byClass.title')} collectedLabel={t('fees.collected')} outstandingLabel={t('fees.outstanding')} />
        </Panel>
        <Panel
          title={t('fo.set.title')}
          subtitle={t('fo.set.sub')}
          testId="fee-settlements"
          action={
            settlements && (
              <Badge variant={settlements.exceptions + settlements.unsettled > 0 ? 'amber' : 'green'}>
                {settlements.exceptions > 0 ? t('fo.set.exceptions', { n: settlements.exceptions }) : settlements.unsettled > 0 ? t('fo.set.unsettled', { n: settlements.unsettled }) : t('fo.set.clear')}
              </Badge>
            )
          }
        >
          {settlements === null ? (
            <Muted>{t('ro.loadFailed')}</Muted>
          ) : settlements.batches.length === 0 ? (
            <Muted>{t('fo.set.none')}</Muted>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('fo.set.col.date')}</TableHead>
                  <TableHead className="text-right">{t('fo.set.col.net')}</TableHead>
                  <TableHead>{t('fo.set.col.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.batches.slice(0, 5).map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <b className="block font-[550]">{formatDate(b.settlementDate, 'short', locale)}</b>
                      <small className="text-muted-foreground">{b.reference}</small>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.rupees(b.netPaise)}</TableCell>
                    <TableCell>
                      <Badge variant={b.exceptionCount > 0 ? 'amber' : 'green'}>{b.exceptionCount > 0 ? t('fo.set.excBadge', { n: b.exceptionCount }) : t('fo.set.matched')}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Button asChild variant="ghost" size="sm" className="mt-2 -ml-2">
            <Link href="/settlements">
              {t('fo.set.open')}
              <ArrowRight />
            </Link>
          </Button>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel
          title={t('fo.def.title')}
          subtitle={defaulters ? t('fo.def.sub', { n: defaulters.length, amount: fmt.rupeesShort(owed) }) : undefined}
          className="lg:col-span-2"
          testId="fee-defaulters"
          action={
            defaulters && defaulters.length > 0 ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => remind(defaulters.map((d) => d.studentId))} data-testid="remind-all">
                <Send />
                {t('fo.def.remindAll')}
              </Button>
            ) : undefined
          }
        >
          {defaulters === null ? (
            <Muted>{t('ro.loadFailed')}</Muted>
          ) : defaulters.length === 0 ? (
            <Muted>{t('fo.def.none')}</Muted>
          ) : (
            <ul className="m-0 grid grid-cols-1 list-none gap-1 p-0">
              {defaulters.slice(0, 8).map((d) => (
                <li key={d.studentId} className="flex items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-muted/60">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-red-soft text-[11px] font-semibold text-red-ink">{initials(d.fullName)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] font-[550]">{d.fullName}</b>
                    <small className="block truncate text-xs text-muted-foreground">
                      {d.className} · {t('fo.def.overdueSince', { date: formatDate(d.oldestDue, 'short', locale) })}
                    </small>
                  </span>
                  <b className="text-[13px] tabular-nums text-red-ink">{fmt.rupees(d.overduePaise)}</b>
                  <Button size="icon-xs" variant="ghost" disabled={pending} onClick={() => remind([d.studentId])} aria-label={`${t('fo.def.remind')}: ${d.fullName}`} title={t('fo.def.remind')}>
                    <Send />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button asChild variant="ghost" size="sm" className="mt-2 -ml-2">
            <Link href="/fees/invoices?status=overdue">
              {t('fees.allInvoices')}
              <ArrowRight />
            </Link>
          </Button>
        </Panel>
        <Panel
          title={t('fo.rec.title')}
          subtitle={month ? t('fo.rec.subMonth', { month: monthName(month) }) : t('fo.rec.sub')}
          className="lg:col-span-3"
          testId="fee-receipts"
          action={
            month ? (
              <Button size="sm" variant="ghost" onClick={() => setMonth(null)}>
                {t('fo.rec.all')}
              </Button>
            ) : undefined
          }
        >
          {receipts === null ? (
            <Muted>{t('ro.loadFailed')}</Muted>
          ) : shownReceipts.length === 0 ? (
            <Muted>{t('fo.rec.none')}</Muted>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('fo.rec.col.no')}</TableHead>
                    <TableHead>{t('fo.rec.col.student')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t('fo.rec.col.date')}</TableHead>
                    <TableHead className="hidden md:table-cell">{t('fo.rec.col.mode')}</TableHead>
                    <TableHead className="text-right">{t('fo.rec.col.amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shownReceipts.map((r) => (
                    <TableRow key={r.id ?? r.receiptNo}>
                      <TableCell className="tabular-nums">
                        {r.id ? (
                          <Link href={`/fees/receipts/${r.id}`} className="text-teal-ink hover:underline">
                            {r.receiptNo}
                          </Link>
                        ) : (
                          r.receiptNo
                        )}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {r.student}
                        {r.className && <small className="block truncate text-xs text-muted-foreground">{r.className}</small>}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{formatDate(r.day, 'short', locale)}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="slate">{methodLabel(r.method, t)}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-[550] tabular-nums">{fmt.rupees(r.amountPaise)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function methodLabel(m: string, t: ReturnType<typeof useI18n>['t']): string {
  const key = { cash: 'fees.method.cash', cheque: 'fees.method.cheque', bank_transfer: 'fees.method.bank_transfer', upi: 'fees.method.upi', online: 'fees.method.online', bank: 'fo.mode.bank' }[m];
  return key ? t(key as Parameters<typeof t>[0]) : m;
}

function Panel({ title, subtitle, action, className, testId, children }: { title: string; subtitle?: string; action?: ReactNode; className?: string; testId?: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className={cn('flex min-w-0 flex-col rounded-lg border bg-card shadow-card', className)}>
      <div className="flex items-start justify-between gap-3 px-[18px] pt-4">
        <div className="min-w-0">
          <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
          {subtitle && <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="px-[18px] pt-3 pb-[18px]">{children}</div>
    </section>
  );
}

function Ring({ pct }: { pct: number }) {
  const { t } = useI18n();
  const r = 34;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 84 84" className="size-[88px] shrink-0" role="img" aria-label={t('fo.target.pct', { p: p.toFixed(1) })}>
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--muted)" strokeWidth="9" />
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--chart-1)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 42 42)" />
      <text x="42" y="47" textAnchor="middle" fontSize="15" fontWeight="650" fill="currentColor">
        {Math.round(p)}%
      </text>
    </svg>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="m-0 py-6 text-center text-[13px] text-muted-foreground">{children}</p>;
}
