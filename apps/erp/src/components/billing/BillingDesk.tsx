'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { cancelSubscription, payInvoice, renewNow, subscribe } from '@/app/(dashboard)/billing/actions';
import { ActionButton, Bar, FormDialog, Grid, useToast } from '@/components/ops/kit';
import { StatusPill, StatTile } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { rupees, type SaasInvoice, type SaasPlan, type SaasSubscriptionView } from '@/lib/governance';

const TONE = { trial: 'warning', active: 'success', past_due: 'danger', cancelled: 'neutral', issued: 'warning', paid: 'success', void: 'neutral' } as const;

/** The institution's KINETIX plan: what it pays, what it uses, and its invoices with GST. */
export function BillingDesk({ view, plans, invoices }: { view: SaasSubscriptionView; plans: SaasPlan[]; invoices: SaasInvoice[] }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [dialog, setDialog] = useState<'plan' | { pay: SaasInvoice } | null>(null);
  const { subscription: sub, plan, usage, estimate } = view;
  const inr = (paise: number) => `₹${fmt.number(rupees(paise))}`;
  const done = (m?: string) => {
    setDialog(null);
    if (m) toast(t('ops.saved'));
  };
  return (
    <>
      <Bar>
        <Button variant="contained" onClick={() => setDialog('plan')} data-testid="bl-plan">
          {sub ? t('bl.change') : t('bl.choose')}
        </Button>
        {sub && sub.status !== 'cancelled' && <ActionButton label={t('bl.cancel')} tone="error" run={cancelSubscription} onDone={toast} />}
        {sub && <ActionButton label={t('bl.renew')} run={renewNow} onDone={toast} />}
      </Bar>
      {sub && plan ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
          <StatTile label={t('bl.plan')} value={plan.name} caption={t(`bl.int.${sub.interval}` as MessageKey)} />
          <StatTile label={t('bl.status')} value={t(`bl.st.${sub.status}` as MessageKey)} tone={sub.status === 'past_due' ? 'warning' : 'default'} caption={`${sub.currentPeriodStart} – ${sub.currentPeriodEnd}`} />
          <StatTile label={t('bl.students')} value={fmt.number(usage.students)} caption={t('bl.minimum', { n: plan.minStudents })} />
          <StatTile label={t('bl.estimate')} value={estimate ? inr(estimate.totalPaise) : t('bl.trialFree')} caption={estimate ? t('bl.estimateCaption') : sub.trialEndsOn ?? ''} />
          <StatTile label={t('bl.staff')} value={fmt.number(usage.staff)} />
          <StatTile label={t('bl.boards')} value={fmt.number(usage.boards)} caption={t('bl.included', { n: plan.boards })} />
          <StatTile label={t('bl.aiCalls')} value={fmt.number(usage.aiCalls)} caption={t('bl.included', { n: fmt.number(plan.includedAiCalls) })} tone={usage.aiCalls > plan.includedAiCalls ? 'warning' : 'default'} />
          <StatTile label={t('bl.storage')} value={`${fmt.number(Math.round(usage.storageMb / 1024))} GB`} caption={t('bl.included', { n: `${Math.round(plan.includedStorageMb / 1024)} GB` })} tone={usage.storageMb > plan.includedStorageMb ? 'warning' : 'default'} />
        </Box>
      ) : (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {t('bl.none')}
        </Typography>
      )}
      {estimate && (
        <Grid
          testId="bl-estimate"
          empty=""
          rows={[...estimate.lines, { label: t('bl.gstLine', { rate: estimate.taxBreakdown.ratePercent }), quantity: 1, unitPaise: estimate.taxPaise, amountPaise: estimate.taxPaise }]}
          cols={[
            { label: t('bl.col.item'), cell: (r) => r.label },
            { label: t('bl.col.qty'), cell: (r) => fmt.number(r.quantity), num: true },
            { label: t('bl.col.amount'), cell: (r) => inr(r.amountPaise), num: true },
          ]}
        />
      )}
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {t('bl.invoices')}
      </Typography>
      <Grid
        testId="bl-invoices"
        empty={t('bl.noInvoices')}
        rows={invoices}
        exportName="saas-invoices"
        cols={[
          { label: t('bl.col.number'), cell: (r) => r.number, sort: (r) => r.number },
          { label: t('bl.col.period'), cell: (r) => `${r.periodStart} – ${r.periodEnd}`, sort: (r) => r.periodStart },
          { label: t('bl.col.subtotal'), cell: (r) => inr(r.subtotalPaise), num: true, sort: (r) => r.subtotalPaise },
          { label: t('bl.col.tax'), cell: (r) => (r.taxBreakdown.igstPaise ? `IGST ${inr(r.taxBreakdown.igstPaise)}` : `CGST ${inr(r.taxBreakdown.cgstPaise)} + SGST ${inr(r.taxBreakdown.sgstPaise)}`), sort: (r) => r.taxPaise },
          { label: t('bl.col.total'), cell: (r) => inr(r.totalPaise), num: true, sort: (r) => r.totalPaise },
          { label: t('bl.col.due'), cell: (r) => r.dueOn, sort: (r) => r.dueOn },
          { label: t('bl.col.status'), cell: (r) => <StatusPill tone={TONE[r.status]}>{t(`bl.inv.${r.status}` as MessageKey)}</StatusPill>, sort: (r) => r.status },
          { label: '', cell: (r) => (r.status === 'issued' ? <Button size="small" onClick={() => setDialog({ pay: r })}>{t('bl.pay')}</Button> : null) },
        ]}
      />
      {dialog === 'plan' && (
        <FormDialog
          title={sub ? t('bl.change') : t('bl.choose')}
          intro={t('bl.planHint')}
          onSubmit={subscribe}
          onClose={done}
          fields={[
            { name: 'planCode', label: t('bl.f.plan'), kind: 'select', init: sub?.planCode ?? 'standard', options: plans.map((p) => ({ value: p.code, label: `${p.name} · ${inr(p.perStudentPaise)} / ${t('bl.perStudent')}` })) },
            { name: 'interval', label: t('bl.f.interval'), kind: 'select', init: sub?.interval ?? 'month', options: [{ value: 'month', label: t('bl.int.month') }, { value: 'year', label: t('bl.int.year') }] },
            { name: 'billingStateCode', label: t('bl.f.state'), init: sub?.billingStateCode ?? '29', required: true },
            { name: 'gstin', label: t('bl.f.gstin'), init: sub?.gstin ?? '' },
            ...(sub ? [] : [{ name: 'trial', label: t('bl.f.trial'), kind: 'select' as const, init: 'no', options: [{ value: 'no', label: t('inc.no') }, { value: 'yes', label: t('inc.yes') }] }]),
          ]}
        />
      )}
      {typeof dialog === 'object' && dialog && 'pay' in dialog && (
        <FormDialog title={t('bl.pay')} intro={`${dialog.pay.number} · ${inr(dialog.pay.totalPaise)}`} onSubmit={(v) => payInvoice(dialog.pay.id, v)} onClose={done} fields={[{ name: 'reference', label: t('bl.f.reference'), required: true }]} />
      )}
      {toastNode}
    </>
  );
}
