'use client';

import { useRouter } from 'next/navigation';
import { BellRing, CalendarPlus, CheckCircle2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { addStandardDeadlines, deadlineDone, sendReminders } from '@/app/(dashboard)/governance/pass-actions';
import { Button } from '@/components/kx';
import { FormDialog, useToast } from '@/components/ops/kit';
import { Card, EmptyState, StatusPill } from '@/components/ui';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { deadlineTone, monthStart, type Calendar } from '@/lib/governance-pass';
import type { ActionResult } from '@/lib/types';

/**
 * The next twelve months of regulatory deadlines, overdue ones first: each with its authority, owner, days left and
 * state; marking one done rolls a recurring deadline on to its next date.
 */
export function CalendarDesk({ cal }: { cal: Calendar }) {
  const { t, fmt, locale } = useI18n();
  const monthName = (m: string) => new Intl.DateTimeFormat(`${locale}-IN`, { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${monthStart(m)}T00:00:00Z`));
  const router = useRouter();
  const [toast, toastNode] = useToast();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const startYear = Number(cal.today.slice(0, 4)) - (Number(cal.today.slice(5, 7)) < 6 ? 1 : 0);
  const run = (fn: () => Promise<ActionResult<unknown>>, ok: (d: unknown) => string) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? ok(r.data) : r.error);
      if (r.ok) router.refresh();
    });
  const empty = cal.months.length === 0;
  return (
    <>
      <StatGrid min={170}>
        <StatTile testId="cal-overdue" label={t('gp.cal.overdue')} value={cal.totals.overdue} tone={cal.totals.overdue ? 'warning' : 'default'} />
        <StatTile testId="cal-soon" label={t('gp.cal.dueSoon')} value={cal.totals.dueSoon} />
        <StatTile testId="cal-upcoming" label={t('gp.cal.upcoming')} value={cal.totals.upcoming} />
        <StatTile testId="cal-done" label={t('gp.cal.done')} value={cal.totals.done} />
      </StatGrid>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button startIcon={<CalendarPlus className="size-4" />} disabled={pending} onClick={() => run(() => addStandardDeadlines(startYear), (d) => t('gp.cal.added', { n: (d as { added: number }).added }))} data-testid="cal-standard">
          {t('gp.cal.standard', { year: `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}` })}
        </Button>
        <Button startIcon={<BellRing className="size-4" />} disabled={pending} onClick={() => run(() => sendReminders(), (d) => t('gp.cal.remindersSent', { n: (d as { deadlines: number; missed: number; rti: number }).deadlines + (d as { missed: number }).missed + (d as { rti: number }).rti }))} data-testid="cal-remind">
          {t('gp.cal.remind')}
        </Button>
      </div>
      {empty ? (
        <EmptyState title={t('gp.empty.compliance')} testId="cal-empty">
          {t('gp.emptyBody.compliance')}
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="cal-months">
          {cal.months.map((m) => (
            <Card key={m.month}>
              <h2 className="m-0 mb-3 text-[15px] font-semibold">{monthName(m.month)}</h2>
              <ul className="m-0 list-none p-0 text-[13px]">
                {m.items.map((i) => (
                  <li key={i.id} className="mb-2.5 border-b border-border pb-2 last:mb-0 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 font-[550]">{i.title}</span>
                      <StatusPill tone={deadlineTone(i.state)}>{t(`gp.state.${i.state}` as MessageKey)}</StatusPill>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-muted-foreground">
                      <span>{fmt.date(i.dueOn, 'short')}</span>
                      <span>· {t(`rk.o.compliance-deadlines.authority.${i.authority}` as MessageKey)}</span>
                      {i.owner && <span>· {i.owner}</span>}
                      {i.state !== 'done' && i.state !== 'waived' && i.daysLeft >= 0 && <span>· {t('gp.cal.daysLeft', { n: i.daysLeft })}</span>}
                      {i.reference && <span>· {i.reference}</span>}
                    </div>
                    {i.status === 'pending' && (
                      <Button size="small" startIcon={<CheckCircle2 className="size-3.5" />} onClick={() => setDone(i.id)} className="mt-1" data-testid={`cal-done-${i.id}`}>
                        {t('gp.cal.markDone')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {done && (
        <FormDialog
          title={t('gp.cal.markDone')}
          fields={[{ name: 'reference', label: t('rk.f.compliance-deadlines.reference') }]}
          onSubmit={(v) => deadlineDone(done, v.reference ?? '')}
          onClose={(msg) => {
            setDone(null);
            if (msg) router.refresh();
          }}
        />
      )}
      {toastNode}
    </>
  );
}
