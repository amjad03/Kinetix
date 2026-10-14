'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { amendPo, cancelPo, decidePo, rateVendor, receiveGoods, recordInvoice, saveCommittee } from '@/app/(dashboard)/inventory/actions';
import type { Field } from '@/components/ops/kit';
import { Button } from '@/components/shadcn/button';
import { ApprovalPanel, RecordPage, type ActivityItem, type WorkflowStep } from '@/components/templates';
import { Card, DataTable, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { statusTone, type PoDetail } from '@/lib/procurement';
import { statusLabel } from '@/lib/procurement-labels';
import { useDialog } from './useDialog';

type Line = PoDetail['lines'][number];
const SCORES = ['5', '4', '3', '2', '1'].map((n) => ({ value: n, label: n }));

/**
 * One purchase order: its lines with what has arrived, the approval (an approver decides a large order or an
 * amendment; not the person who raised it), goods receipt with rejected quantities (a debit note follows), the
 * vendor's invoice and its match, amendments, the purchase committee's minutes and cancellation.
 */
export function PoView({ po, canStore, canApprove, me }: { po: PoDetail; canStore: boolean; canApprove: boolean; me: string }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [open, dialog] = useDialog();
  const key = useMemo(() => crypto.randomUUID(), []);
  const pendingApproval = po.status === 'pending_approval';
  const live = ['issued', 'partially_received'].includes(po.status);
  const left = (l: Line) => Math.max(0, l.qty - l.receivedQty);
  const receivedValue = po.lines.reduce((s, l) => s + l.receivedQty * l.unitPricePaise, 0);

  const steps: WorkflowStep[] = [
    { id: 'raised', label: t('ivd.po.raised'), state: 'done' },
    ...(po.approvalStatus === 'not_required' ? [] : [{ id: 'approval', label: t('ivd.po.approval'), state: po.approvalStatus === 'approved' ? ('done' as const) : po.approvalStatus === 'rejected' ? ('rejected' as const) : ('current' as const) }]),
    { id: 'issued', label: t('ivd.st.issued'), state: pendingApproval ? 'upcoming' : po.status === 'cancelled' ? 'skipped' : 'done' },
    { id: 'received', label: t('ivd.st.received'), state: po.status === 'received' ? 'done' : po.status === 'partially_received' ? 'current' : 'upcoming' },
    { id: 'paid', label: t('ivd.st.paid'), state: po.invoices.some((i) => i.status === 'paid') ? 'done' : 'upcoming' },
  ];
  const history: ActivityItem[] = po.approvals.map((a) => ({ id: a.id, at: a.createdAt, actor: a.by ?? '—', action: a.decision === 'approved' ? t('ivd.st.approved') : t('ivd.st.rejected'), detail: a.note ?? undefined, tone: a.decision === 'approved' ? 'success' : 'danger' }));
  const activity: ActivityItem[] = [
    ...history,
    ...po.amendments.map((a) => ({ id: a.id, at: a.createdAt, actor: a.by ?? '—', action: t('ivd.po.amendedNo', { n: a.amendmentNo }), detail: `${fmt.rupees(a.before.totalPaise)} → ${fmt.rupees(a.after.totalPaise)} · ${a.reason}` })),
    ...po.receipts.map((r) => ({ id: r.id, at: r.receivedAt, actor: '—', action: t('ivd.po.receipt', { number: r.number ?? '' }), detail: r.challanNo ? t('ivd.po.challan', { n: r.challanNo }) : undefined })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const receive = () =>
    open({
      title: t('inv.receive'),
      intro: t('ivd.po.receiveHelp'),
      fields: [
        { name: 'challanNo', label: t('ivd.po.challanNo') },
        ...po.lines.filter((l) => left(l) > 0).flatMap((l): Field[] => [
          { name: `q_${l.id}`, label: t('ivd.po.acceptedOf', { item: l.item, n: left(l) }), kind: 'number' },
          { name: `r_${l.id}`, label: t('ivd.po.rejectedOf', { item: l.item }), kind: 'number' },
        ]),
        { name: 'rejectReason', label: t('ivd.po.rejectReason') },
        { name: 'note', label: t('ops.f.note') },
      ],
      done: t('ivd.po.received'),
      run: (v) => receiveGoods(po.id, v, key),
    });
  const invoice = () =>
    open({
      title: t('inv.recordInvoice'),
      intro: t('inv.invoiceHelp', { amount: fmt.rupees(receivedValue) }),
      fields: [
        { name: 'invoiceNo', label: t('inv.invoiceNo'), required: true },
        { name: 'invoiceDate', label: t('ivd.invoiceDate'), kind: 'date' },
        { name: 'amount', label: t('ops.f.amount'), kind: 'rupees', required: true },
      ],
      done: t('ivd.po.invoiced'),
      run: (v) => recordInvoice(po.id, v),
    });
  const amend = () =>
    open({
      title: t('ivd.po.amend'),
      intro: t('ivd.po.amendHelp'),
      fields: [
        ...po.lines.flatMap((l): Field[] => [
          { name: `q_${l.id}`, label: t('ivd.po.qtyOf', { item: l.item }), kind: 'number', required: true, init: String(l.qty) },
          { name: `p_${l.id}`, label: t('ivd.po.priceOf', { item: l.item }), kind: 'rupees', required: true, init: (l.unitPricePaise / 100).toFixed(2) },
        ]),
        { name: 'deliveryBy', label: t('ivd.deliveryBy'), kind: 'date', init: po.deliveryBy ?? '' },
        { name: 'reason', label: t('ho.reason'), kind: 'multiline', required: true },
      ],
      done: t('ivd.po.amended'),
      run: (v) => amendPo(po.id, v, po.lines.map((l) => ({ id: l.id, itemId: l.itemId }))),
    });
  const committee = () =>
    open({
      title: t('ivd.po.committee'),
      intro: t('ivd.po.committeeHelp'),
      fields: [
        { name: 'metOn', label: t('ivd.po.metOn'), kind: 'date', required: true, init: po.committeeMetOn ?? '' },
        { name: 'members', label: t('ivd.po.members'), required: true, init: po.committeeMembers ?? '' },
        { name: 'minutes', label: t('ivd.po.minutes'), kind: 'multiline', required: true, init: po.committeeMinutes ?? '' },
      ],
      run: (v) => saveCommittee(po.id, v),
    });
  const cancel = () => open({ title: t('ivd.po.cancel'), fields: [{ name: 'reason', label: t('ho.reason'), kind: 'multiline', required: true }], done: t('ivd.po.cancelled'), run: (v) => cancelPo(po.id, v) });
  const rate = () =>
    open({
      title: t('ivd.rateVendor'),
      fields: [...(['quality', 'delivery', 'price'] as const).map((k) => ({ name: k, label: t(`ivd.score.${k}`), kind: 'select' as const, required: true, options: SCORES })), { name: 'note', label: t('ops.f.note') }],
      done: t('ivd.rated'),
      run: (v) => rateVendor(po.vendorId, { ...v, poId: po.id }),
    });

  const lineCols: Column<Line>[] = [
    { id: 'item', header: t('inv.item'), rowHeader: true, cell: (l) => l.item },
    { id: 'qty', header: t('ops.f.qty'), align: 'right', cell: (l) => `${fmt.number(l.qty)} ${l.unit}` },
    { id: 'price', header: t('inv.unitPriceCol'), align: 'right', cell: (l) => fmt.rupees(l.unitPricePaise) },
    { id: 'amount', header: t('ops.f.amount'), align: 'right', cell: (l) => fmt.rupees(l.qty * l.unitPricePaise) },
    { id: 'received', header: t('inv.received'), align: 'right', cell: (l) => <StatusPill tone={l.receivedQty >= l.qty ? 'success' : l.receivedQty > 0 ? 'warning' : 'neutral'}>{`${fmt.number(l.receivedQty)} / ${fmt.number(l.qty)}`}</StatusPill> },
  ];
  type Inv = PoDetail['invoices'][number];
  const invCols: Column<Inv>[] = [
    { id: 'no', header: t('inv.invoiceNo'), rowHeader: true, cell: (i) => i.invoiceNo },
    { id: 'date', header: t('ivd.invoiceDate'), cell: (i) => (i.invoiceDate ? fmt.date(i.invoiceDate, 'short') : '—') },
    { id: 'amount', header: t('inv.invoiced'), align: 'right', cell: (i) => fmt.rupees(i.amountPaise) },
    { id: 'expected', header: t('inv.expected'), align: 'right', cell: (i) => fmt.rupees(i.expectedPaise) },
    { id: 'debit', header: t('ivd.debitSetOff'), align: 'right', cell: (i) => (i.debitPaise ? fmt.rupees(i.debitPaise) : '—') },
    { id: 'voucher', header: t('ivd.voucher'), cell: (i) => (i.voucherNo ? `${i.voucherNo} · ${i.paidOn ? fmt.date(i.paidOn, 'short') : ''}` : '—') },
    { id: 'status', header: t('ops.f.status'), cell: (i) => <StatusPill tone={statusTone(i.status)}>{statusLabel(t, i.status)}</StatusPill> },
  ];
  type Rc = PoDetail['receipts'][number];
  const rcCols: Column<Rc>[] = [
    { id: 'no', header: t('inv.number'), rowHeader: true, cell: (r) => r.number ?? '—' },
    { id: 'at', header: t('ivd.date'), cell: (r) => fmt.dateTime(r.receivedAt) },
    { id: 'challan', header: t('ivd.po.challanNo'), cell: (r) => r.challanNo ?? '—' },
    { id: 'accepted', header: t('ivd.po.accepted'), align: 'right', cell: (r) => fmt.number(r.lines.reduce((s, l) => s + l.qty, 0)) },
    { id: 'rejected', header: t('ivd.po.rejected'), align: 'right', cell: (r) => fmt.number(r.lines.reduce((s, l) => s + l.rejectedQty, 0)) },
  ];
  type Dn = PoDetail['debitNotes'][number];
  const dnCols: Column<Dn>[] = [
    { id: 'no', header: t('inv.number'), rowHeader: true, cell: (d) => d.number },
    { id: 'reason', header: t('ho.reason'), cell: (d) => d.reason },
    { id: 'amount', header: t('ops.f.amount'), align: 'right', cell: (d) => fmt.rupees(d.amountPaise) },
    { id: 'status', header: t('ops.f.status'), cell: (d) => <StatusPill tone={statusTone(d.status)}>{statusLabel(t, d.status)}</StatusPill> },
  ];

  return (
    <>
      <RecordPage
        title={po.number}
        subtitle={
          <>
            <Link className="text-primary hover:underline" href={`/procurement/vendors/${po.vendorId}`}>{po.vendor}</Link>
            {po.requisition && po.requisitionId ? (
              <>
                {' · '}
                <Link className="text-primary hover:underline" href={`/indents/${po.requisitionId}`}>{po.requisition}</Link>
              </>
            ) : null}
          </>
        }
        status={{ label: statusLabel(t, po.status), tone: statusTone(po.status) }}
        facts={[
          { label: t('ops.f.amount'), value: fmt.rupees(po.totalPaise) },
          { label: t('ivd.purchaseMode'), value: t(`ivd.mode.${po.purchaseMode as 'direct'}`) },
          { label: t('inv.store'), value: po.store },
          { label: t('ivd.department'), value: po.department ?? '—' },
          { label: t('ivd.deliveryBy'), value: po.deliveryBy ? fmt.date(po.deliveryBy, 'short') : '—' },
          { label: t('ivd.po.amendment'), value: po.amendmentNo ? fmt.number(po.amendmentNo) : '—' },
        ]}
        primary={
          canStore && live ? (
            <>
              <Button onClick={receive} data-testid="po-receive">{t('inv.receive')}</Button>
              <Button variant="outline" onClick={invoice} disabled={receivedValue === 0} data-testid="po-invoice">{t('inv.recordInvoice')}</Button>
            </>
          ) : undefined
        }
        secondary={
          canStore && po.status !== 'cancelled' && po.status !== 'received' ? (
            <>
              {live && <Button variant="outline" onClick={amend} data-testid="po-amend">{t('ivd.po.amend')}</Button>}
              <Button variant="outline" onClick={committee}>{t('ivd.po.committee')}</Button>
              {!po.receipts.length && <Button variant="outline" onClick={cancel} data-testid="po-cancel">{t('ivd.po.cancel')}</Button>}
              <Button variant="outline" onClick={rate}>{t('ivd.rateVendor')}</Button>
            </>
          ) : canStore && po.status === 'received' ? (
            <Button variant="outline" onClick={rate}>{t('ivd.rateVendor')}</Button>
          ) : undefined
        }
        overview={
          <div className="grid gap-6">
            <Card title={t('ivd.po.lines')}>
              <DataTable label={t('ivd.po.lines')} columns={lineCols} rows={po.lines} rowId={(l) => l.id} empty={t('inv.noLines')} />
            </Card>
            {(po.gemRef || po.tenderRef || po.terms || po.cancelReason) && (
              <Card title={t('ivd.po.terms')}>
                <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                  {po.gemRef && <Fact label={t('ivd.gemRef')} value={po.gemRef} />}
                  {po.tenderRef && <Fact label={t('ivd.tenderRef')} value={po.tenderRef} />}
                  {po.terms && <Fact label={t('ivd.terms')} value={po.terms} />}
                  {po.cancelReason && <Fact label={t('ivd.po.cancelReason')} value={po.cancelReason} />}
                </dl>
              </Card>
            )}
            {po.committeeMinutes && (
              <Card title={t('ivd.po.committee')}>
                <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                  <Fact label={t('ivd.po.metOn')} value={po.committeeMetOn ? fmt.date(po.committeeMetOn, 'short') : '—'} />
                  <Fact label={t('ivd.po.members')} value={po.committeeMembers ?? '—'} />
                </dl>
                <p className="mt-4 whitespace-pre-wrap text-sm">{po.committeeMinutes}</p>
              </Card>
            )}
          </div>
        }
        related={[
          { value: 'receipts', label: t('ivd.po.receipts'), count: po.receipts.length, content: <DataTable label={t('ivd.po.receipts')} columns={rcCols} rows={po.receipts} rowId={(r) => r.id} empty={t('ivd.po.noReceipts')} /> },
          { value: 'invoices', label: t('inv.invoices'), count: po.invoices.length, content: <DataTable label={t('inv.invoices')} columns={invCols} rows={po.invoices} rowId={(i) => i.id} empty={t('inv.noInvoices')} /> },
          { value: 'debit', label: t('ivd.pview.debit'), count: po.debitNotes.length, content: <DataTable label={t('ivd.pview.debit')} columns={dnCols} rows={po.debitNotes} rowId={(d) => d.id} empty={t('ivd.empty.debit')} /> },
        ]}
        activity={activity}
        aside={
          pendingApproval ? (
            <ApprovalPanel
              title={t('ivd.po.approval')}
              steps={steps}
              canDecide={canApprove && po.createdBy !== me}
              onDecide={async (d, comment) => {
                const r = await decidePo(po.id, d === 'approve', comment);
                return r.ok ? undefined : r.error;
              }}
              onDecided={() => router.refresh()}
              history={history}
            />
          ) : undefined
        }
      />
      {dialog}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  );
}
