'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createPo, decideRequisition } from '@/app/(dashboard)/inventory/actions';
import type { Field } from '@/components/ops/kit';
import { Button } from '@/components/shadcn/button';
import { ApprovalPanel, RecordPage, type ActivityItem, type WorkflowStep } from '@/components/templates';
import { Card, CheckboxField, DataTable, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { statusTone, type IndentDetail, type Option } from '@/lib/procurement';
import { PURCHASE_MODES, statusLabel } from '@/lib/procurement-labels';
import { useDialog } from './useDialog';

type Line = IndentDetail['lines'][number];

/**
 * One indent: its lines with the estimate, the approval steps (department head, then principal) with the budget
 * position the principal decides against, and the purchase orders raised for it. The store raises the order here.
 */
export function IndentView({ r, canOrder, vendors, stores }: { r: IndentDetail; canOrder: boolean; vendors: Option[]; stores: Option[] }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [open, dialog] = useDialog();
  const [override, setOverride] = useState(false);
  const exceeded = !!r.budget && r.step === 'principal' && r.estimatedPaise > r.budget.availablePaise;

  const steps: WorkflowStep[] = r.steps.map((s) => {
    const done = r.approvals.find((a) => a.step === s);
    // An indent approved before the approval trail was kept has no record per step: every step is then done.
    const state: WorkflowStep['state'] = done ? (done.decision === 'approved' ? 'done' : 'rejected') : ['approved', 'ordered'].includes(r.status) ? 'done' : r.status === 'submitted' && r.step === s ? 'current' : r.status === 'rejected' ? 'skipped' : 'upcoming';
    return { id: s, label: t(`ivd.ind.step.${s}`), state };
  });
  const history: ActivityItem[] = r.approvals.map((a) => ({ id: a.id, at: a.createdAt, actor: a.by ?? '—', action: `${t(`ivd.ind.step.${a.step as 'hod'}`)}: ${statusLabel(t, a.decision)}${a.budgetOverride ? ` · ${t('ivd.st.override')}` : ''}`, detail: a.note ?? undefined, tone: a.decision === 'approved' ? 'success' : 'danger' }));

  const order = () =>
    open({
      title: t('inv.createPo'),
      intro: t('ivd.ind.poHelp'),
      fields: [
        { name: 'vendorId', label: t('inv.vendor'), kind: 'select', required: true, options: vendors },
        { name: 'storeId', label: t('inv.store'), kind: 'select', required: true, options: stores },
        { name: 'purchaseMode', label: t('ivd.purchaseMode'), kind: 'select', required: true, init: 'direct', options: PURCHASE_MODES.map((m) => ({ value: m, label: t(`ivd.mode.${m}`) })) },
        { name: 'gemRef', label: t('ivd.gemRef') },
        { name: 'tenderRef', label: t('ivd.tenderRef') },
        ...r.lines.map((l): Field => ({ name: `p_${l.itemId}`, label: t('inv.unitPrice', { item: l.item, qty: l.qty }), kind: 'rupees', required: true, init: l.estUnitPaise ? (l.estUnitPaise / 100).toFixed(2) : '' })),
        { name: 'deliveryBy', label: t('ivd.deliveryBy'), kind: 'date' },
        { name: 'terms', label: t('ivd.terms'), kind: 'multiline' },
      ],
      done: t('ivd.ind.ordered'),
      run: async (v) => {
        const res = await createPo(r.id, v, r.lines.map((l) => ({ itemId: l.itemId, qty: l.qty })));
        if (res.ok) router.push(`/procurement/orders/${res.data.id}`);
        return res;
      },
    });

  const cols: Column<Line>[] = [
    { id: 'item', header: t('inv.item'), rowHeader: true, cell: (l) => `${l.sku} · ${l.item}` },
    { id: 'qty', header: t('ops.f.qty'), align: 'right', cell: (l) => `${fmt.number(l.qty)} ${l.unit}` },
    { id: 'price', header: t('ivd.estPrice'), align: 'right', cell: (l) => (l.estUnitPaise ? fmt.rupees(l.estUnitPaise) : '—') },
    { id: 'amount', header: t('ivd.estimate'), align: 'right', cell: (l) => (l.estUnitPaise ? fmt.rupees(l.qty * l.estUnitPaise) : '—') },
  ];
  type Order = IndentDetail['orders'][number];
  const orderCols: Column<Order>[] = [
    { id: 'no', header: t('inv.number'), rowHeader: true, cell: (o) => <Link className="font-medium text-primary hover:underline" href={`/procurement/orders/${o.id}`}>{o.number}</Link> },
    { id: 'total', header: t('ops.f.amount'), align: 'right', cell: (o) => fmt.rupees(o.totalPaise) },
    { id: 'status', header: t('ops.f.status'), cell: (o) => <StatusPill tone={statusTone(o.status)}>{statusLabel(t, o.status)}</StatusPill> },
  ];

  return (
    <>
      <RecordPage
        title={r.number}
        subtitle={[r.requester, r.department].filter(Boolean).join(' · ') || undefined}
        status={{ label: statusLabel(t, r.status), tone: statusTone(r.status) }}
        facts={[
          { label: t('ivd.estimate'), value: fmt.rupees(r.estimatedPaise) },
          { label: t('ivd.department'), value: r.department ?? '—' },
          { label: t('ivd.neededBy'), value: r.neededBy ? fmt.date(r.neededBy, 'short') : '—' },
          { label: t('ivd.budget'), value: r.budgetStatus ? <StatusPill tone={statusTone(r.budgetStatus)}>{statusLabel(t, r.budgetStatus)}</StatusPill> : '—' },
          { label: t('ivd.date'), value: fmt.date(r.createdAt.slice(0, 10), 'short') },
        ]}
        primary={canOrder && r.status === 'approved' ? <Button onClick={order} disabled={!vendors.length || !stores.length} data-testid="indent-order">{t('inv.createPo')}</Button> : undefined}
        overview={
          <div className="grid gap-6">
            {r.reason && (
              <Card title={t('ho.reason')}>
                <p className="text-sm">{r.reason}</p>
              </Card>
            )}
            <Card title={t('inv.lines')}>
              <DataTable label={t('inv.lines')} columns={cols} rows={r.lines} rowId={(l) => l.id} empty={t('inv.noLines')} />
            </Card>
            {r.budget && (
              <Card title={t('ivd.ind.budgetFor', { year: r.budget.fiscalYear ?? '' })}>
                <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Fact label={t('ivd.ind.budget')} value={fmt.rupees(r.budget.budgetPaise)} />
                  <Fact label={t('ivd.ind.spent')} value={fmt.rupees(r.budget.spentPaise)} />
                  <Fact label={t('ivd.ind.committed')} value={fmt.rupees(r.budget.committedPaise)} />
                  <Fact label={t('ivd.ind.available')} value={fmt.rupees(r.budget.availablePaise)} tone={r.budget.availablePaise < r.estimatedPaise ? 'text-destructive' : undefined} />
                </dl>
              </Card>
            )}
            {r.decisionNote && (
              <Card title={t('ivd.ind.decisionNote')}>
                <p className="text-sm">{r.decisionNote}</p>
              </Card>
            )}
          </div>
        }
        related={[{ value: 'orders', label: t('ivd.orders'), count: r.orders.length, content: <DataTable label={t('ivd.orders')} columns={orderCols} rows={r.orders} rowId={(o) => o.id} empty={t('inv.noPos')} /> }]}
        activity={history}
        aside={
          <ApprovalPanel
            title={t('ivd.ind.approval')}
            steps={steps}
            canDecide={r.canDecide}
            extra={exceeded && r.canDecide ? <CheckboxField label={t('ivd.ind.override')} checked={override} onChange={setOverride} /> : undefined}
            onDecide={async (d, comment) => {
              const res = await decideRequisition(r.id, d === 'approve', { note: comment, budgetOverride: override ? 'yes' : '' });
              return res.ok ? undefined : res.error;
            }}
            onDecided={() => router.refresh()}
            history={history}
          />
        }
      />
      {dialog}
    </>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-sm ${tone ?? ''}`}>{value}</dd>
    </div>
  );
}
