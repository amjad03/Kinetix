'use client';

import { BarChart3 } from 'lucide-react';
import { Grid } from '@/components/ops/kit';
import { StatGrid, StatTile } from '@/components/StatTile';
import { Button } from '@/components/kx';
import { FormField, FormRow, FormRowActions, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { appTotals, share, type CommsSummary } from '@/lib/comms-pass';

/**
 * Communication > Reports: what was sent, delivered, read and what it cost, by channel and by the sender's
 * department, for a period (IST dates; this month by default). The dates are in the URL, so a view can be shared.
 */
export function CommsReport({ summary, from, to }: { summary: CommsSummary; from: string; to: string }) {
  const { t, fmt } = useI18n();
  const apps = appTotals(summary.apps);
  const appSent = apps.reduce((n, r) => n + r.sent, 0);
  const appRead = apps.reduce((n, r) => n + r.read, 0);
  const chLabel = (c: string) => t(`cp.ch.${c}` as MessageKey);
  const maxDay = Math.max(1, ...summary.byDay.map((d) => d.sent));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6" data-testid="cp-report">
      <FormRow component="form" method="get">
        <input type="hidden" name="tab" value="reports" />
        <FormField label={t('cp.r.from')}>
          <TextInput type="date" name="from" defaultValue={from} />
        </FormField>
        <FormField label={t('cp.r.to')}>
          <TextInput type="date" name="to" defaultValue={to} />
        </FormField>
        <FormRowActions>
          <Button type="submit" variant="outlined">{t('cp.r.apply')}</Button>
        </FormRowActions>
      </FormRow>
      <StatGrid min={160}>
        <StatTile label={t('cp.r.sent')} value={fmt.number(summary.total.sent)} testId="cp-r-sent" />
        <StatTile label={t('cp.r.delivered')} value={`${share(summary.total.delivered, summary.total.sent)}%`} caption={fmt.number(summary.total.delivered)} />
        <StatTile label={t('cp.r.failed')} value={fmt.number(summary.total.failed)} tone={summary.total.failed ? 'warning' : 'default'} />
        <StatTile label={t('cp.r.cost')} value={fmt.rupees(summary.total.costPaise)} testId="cp-r-cost" />
        <StatTile label={t('cp.r.appRead')} value={`${share(appRead, appSent)}%`} caption={t('cp.r.appReadOf', { read: fmt.number(appRead), sent: fmt.number(appSent) })} />
      </StatGrid>

      <section aria-labelledby="cp-r-channel">
        <h3 id="cp-r-channel" className="mb-2 text-sm font-semibold">{t('cp.r.byChannel')}</h3>
        <Grid
          testId="cp-r-by-channel"
          emptyIcon={<BarChart3 />}
          empty={t('cp.r.none')}
          exportName="messages-by-channel"
          rows={summary.byChannel}
          cols={[
            { label: t('pwb.comms.channel'), cell: (r) => chLabel(r.channel), sort: (r) => r.channel },
            { label: t('cp.r.sent'), cell: (r) => fmt.number(r.sent), num: true, sort: (r) => r.sent },
            { label: t('cp.r.delivered'), cell: (r) => `${fmt.number(r.delivered)} (${share(r.delivered, r.sent)}%)`, num: true, sort: (r) => r.delivered },
            { label: t('cp.r.read'), cell: (r) => fmt.number(r.read), num: true, sort: (r) => r.read },
            { label: t('cp.r.failed'), cell: (r) => fmt.number(r.failed), num: true, sort: (r) => r.failed },
            { label: t('cp.r.heldBack'), cell: (r) => fmt.number(r.suppressed), num: true, sort: (r) => r.suppressed },
            { label: t('cp.r.waited'), cell: (r) => fmt.number(r.deferred), num: true, sort: (r) => r.deferred },
            { label: t('cp.r.units'), cell: (r) => fmt.number(r.units), num: true, sort: (r) => r.units },
            { label: t('cp.r.cost'), cell: (r) => fmt.rupees(r.costPaise), num: true, sort: (r) => r.costPaise },
          ]}
        />
      </section>

      <section aria-labelledby="cp-r-dept">
        <h3 id="cp-r-dept" className="mb-2 text-sm font-semibold">{t('cp.r.byDepartment')}</h3>
        <Grid
          testId="cp-r-by-department"
          emptyIcon={<BarChart3 />}
          empty={t('cp.r.none')}
          exportName="messages-by-department"
          rows={summary.byDepartment}
          cols={[
            { label: t('cp.r.department'), cell: (r) => r.department, sort: (r) => r.department },
            { label: t('cp.r.sent'), cell: (r) => fmt.number(r.sent), num: true, sort: (r) => r.sent },
            { label: t('cp.r.delivered'), cell: (r) => `${share(r.delivered, r.sent)}%`, num: true, sort: (r) => share(r.delivered, r.sent) },
            { label: t('cp.r.failed'), cell: (r) => fmt.number(r.failed), num: true, sort: (r) => r.failed },
            { label: t('cp.r.units'), cell: (r) => fmt.number(r.units), num: true, sort: (r) => r.units },
            { label: t('cp.r.cost'), cell: (r) => fmt.rupees(r.costPaise), num: true, sort: (r) => r.costPaise },
          ]}
        />
      </section>

      <section aria-labelledby="cp-r-apps">
        <h3 id="cp-r-apps" className="mb-2 text-sm font-semibold">{t('cp.r.apps')}</h3>
        <Grid
          testId="cp-r-apps"
          emptyIcon={<BarChart3 />}
          empty={t('cp.r.none')}
          exportName="app-notices-by-department"
          rows={apps}
          cols={[
            { label: t('cp.r.department'), cell: (r) => r.department, sort: (r) => r.department },
            { label: t('cp.r.reached'), cell: (r) => fmt.number(r.sent), num: true, sort: (r) => r.sent },
            { label: t('cp.r.opened'), cell: (r) => `${share(r.delivered, r.sent)}%`, num: true, sort: (r) => share(r.delivered, r.sent) },
            { label: t('cp.r.read'), cell: (r) => `${share(r.read, r.sent)}%`, num: true, sort: (r) => share(r.read, r.sent) },
            { label: t('cp.r.ack'), cell: (r) => fmt.number(r.acknowledged), num: true, sort: (r) => r.acknowledged },
          ]}
        />
      </section>

      {summary.byDay.length > 0 && (
        <section aria-labelledby="cp-r-days">
          <h3 id="cp-r-days" className="mb-2 text-sm font-semibold">{t('cp.r.byDay')}</h3>
          <ul className="grid gap-1.5" data-testid="cp-r-by-day">
            {summary.byDay.map((d) => (
              <li key={d.day} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 text-sm">
                <span className="tabular-nums text-muted-foreground">{fmt.date(d.day, 'short')}</span>
                <span className="h-2.5 rounded-full bg-muted" aria-hidden>
                  <span className="block h-2.5 rounded-full bg-primary" style={{ width: `${Math.max(2, Math.round((d.sent * 100) / maxDay))}%` }} />
                </span>
                <span className="tabular-nums">{t('cp.r.dayLine', { sent: fmt.number(d.sent), cost: fmt.rupees(d.costPaise) })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
