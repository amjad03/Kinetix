'use client';
import Link from 'next/link';
import { useState } from 'react';
import { recordHref } from '@/lib/campus-ops';
import { addQuote, awardQuote, loadRfq, openRfq, returnFromIssue, returnToVendor, transferStock } from '@/app/(dashboard)/inventory/actions';
import { Bar, FormDialog, Grid, InfoDialog, Pill, useToast, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import { st } from '@/lib/ops-labels';
import type { IItem, IPoRow, IReq, IReturn, IRfq, IRfqDetail, IStock, IStore, ITransfer, IVendor } from '@/lib/ops';

import { Button } from '@/components/kx';
type Dialog = 'rfq' | 'transfer' | 'retVendor' | 'retIssue' | { quote: IRfq } | { cmp: IRfqDetail } | { award: { rfqId: string; quoteId: string } };

/**
 * The stores' working views next to the record lists, one `section` at a time: stock by store, quotation requests with
 * the side-by-side comparison and award, or transfers and returns. Items, stores, vendors, indents and orders have
 * their own lists.
 */
export function InventoryDesk({ section, items, stores, stock, vendors, reqs, pos, rfqs, transfers, returns, canApprove }: { section: 'stock' | 'rfq' | 'moves'; items: IItem[]; stores: IStore[]; stock: IStock[]; vendors: IVendor[]; reqs: IReq[]; pos: IPoRow[]; rfqs: IRfq[]; transfers: ITransfer[]; returns: IReturn[]; canApprove: boolean }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [toast, toastNode] = useToast();
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const openCmp = async (rfqId: string) => {
    const res = await loadRfq(rfqId);
    if (res.ok) setDlg({ cmp: res.data });
    else toast(res.error);
  };
  const reqOf = (id: string) => reqs.find((r) => r.id === id);
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? '';
  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? '';
  const storeOpts = stores.map((s) => ({ value: s.id, label: s.name }));
  const itemOpts = items.filter((i) => i.active).map((i) => ({ value: i.id, label: `${i.sku} · ${i.name}` }));
  const vendorOpts = vendors.filter((v) => v.active !== false && !v.blacklisted).map((v) => ({ value: v.id, label: v.name }));
  const btn = (label: string, d: Dialog, disabled?: boolean) => (
    <Button variant="outlined" onClick={() => setDlg(d)} disabled={disabled}>{label}</Button>
  );

  const view =
    section === 'stock' ? (
      <Grid
        testId="inv-stock"
        empty={t('inv.noStock')}
        rows={stock}
        exportName="stock"
        tint={(s) => s.reorderLevel > 0 && s.qty <= s.reorderLevel}
        cols={[{ label: t('inv.store'), cell: (s) => s.store }, { label: t('inv.item'), cell: (s) => `${s.sku} · ${s.item}` }, { label: t('inv.onHand'), cell: (s) => `${s.qty} ${s.unit}`, num: true }, { label: t('inv.reorderLevel'), cell: (s) => s.reorderLevel, num: true }]}
      />
    ) : section === 'rfq' ? (
      <>
        <Bar>{btn(t('inv.rfq.open'), 'rfq', !reqs.some((r) => r.status === 'approved'))}</Bar>
        <Grid
          testId="inv-rfqs"
          empty={t('inv.rfq.none')}
          rows={rfqs}
          cols={[
            { label: t('inv.number'), cell: (r) => <Link className="font-medium text-primary hover:underline" href={recordHref('rfq', r.id)}>{r.number}</Link> },
            { label: t('inv.lines'), cell: (r) => reqOf(r.requisitionId)?.lines.map((l) => `${l.item} × ${l.qty}`).join(', ') ?? '' },
            { label: t('ops.f.status'), cell: (r) => <Pill label={st(t, r.status)} /> },
            {
              label: '',
              cell: (r) => (
                <>
                  {r.status === 'open' && <Button size="small" onClick={() => setDlg({ quote: r })} disabled={vendorOpts.length === 0}>{t('inv.rfq.quote')}</Button>}
                  <Button size="small" onClick={() => void openCmp(r.id)}>{t('inv.rfq.compare')}</Button>
                </>
              ),
            },
          ]}
        />
      </>
    ) : (
      <>
        <Bar>
          {btn(t('inv.transfer'), 'transfer', stores.length < 2 || items.length === 0)}
          {btn(t('inv.returnVendor'), 'retVendor', pos.length === 0)}
          {btn(t('inv.returnIssue'), 'retIssue', stores.length === 0 || items.length === 0)}
        </Bar>
        <h6 className="font-medium tracking-[0.1px] text-[1.125rem] mb-2">{t('inv.transfers')}</h6>
        <Grid
          testId="inv-transfers"
          empty={t('inv.noTransfers')}
          rows={transfers}
          cols={[{ label: t('inv.number'), cell: (x) => x.number }, { label: t('inv.item'), cell: (x) => itemName(x.itemId) }, { label: t('inv.from'), cell: (x) => storeName(x.fromStoreId) }, { label: t('inv.to'), cell: (x) => storeName(x.toStoreId) }, { label: t('ops.f.qty'), cell: (x) => x.qty, num: true }]}
        />
        <h6 className="font-medium tracking-[0.1px] text-[1.125rem] mt-6 mb-2">{t('inv.returns')}</h6>
        <Grid
          testId="inv-returns"
          empty={t('inv.noReturns')}
          rows={returns}
          cols={[
            { label: t('inv.number'), cell: (x) => x.number },
            { label: t('inv.item'), cell: (x) => itemName(x.itemId) },
            { label: t('ops.f.qty'), cell: (x) => x.qty, num: true },
            { label: t('ho.reason'), cell: (x) => (x.kind === 'issue' ? `${x.issuedTo}: ${x.reason}` : x.reason) },
            { label: t('inv.credit'), cell: (x) => (x.creditPaise ? fmt.rupees(x.creditPaise) : t('ops.none')), num: true },
          ]}
        />
      </>
    );

  return (
    <>
      {view}

      {dlg === 'rfq' && (
        <FormDialog
          title={t('inv.rfq.open')}
          onSubmit={openRfq}
          onClose={done}
          fields={[{ name: 'requisitionId', label: t('inv.rfq.requisition'), kind: 'select', required: true, options: reqs.filter((r) => r.status === 'approved').map((r) => ({ value: r.id, label: `${r.number} · ${r.lines.map((l) => `${l.item} × ${l.qty}`).join(', ')}` })) }, { name: 'closesOn', label: t('inv.rfq.closes'), kind: 'date' }]}
        />
      )}
      {dlg && typeof dlg === 'object' && 'quote' in dlg && (
        <FormDialog
          title={`${t('inv.rfq.quote')} · ${dlg.quote.number}`}
          onSubmit={(v) => addQuote(dlg.quote.id, v, reqOf(dlg.quote.requisitionId)?.lines.map((l) => l.itemId) ?? [])}
          onClose={done}
          fields={[
            { name: 'vendorId', label: t('inv.vendor'), kind: 'select', required: true, options: vendorOpts },
            { name: 'deliveryDays', label: t('inv.rfq.delivery'), kind: 'number' },
            ...(reqOf(dlg.quote.requisitionId)?.lines ?? []).map((l): Field => ({ name: `p_${l.itemId}`, label: t('inv.rfq.priceFor', { item: l.item, qty: l.qty }), kind: 'rupees', required: true })),
            { name: 'note', label: t('ops.f.note') },
          ]}
        />
      )}
      {dlg && typeof dlg === 'object' && 'cmp' in dlg && (
        <InfoDialog title={dlg.cmp.number} onClose={() => setDlg(null)}>
          <Grid
            testId="inv-quotes"
            empty={t('inv.rfq.noQuotes')}
            rows={dlg.cmp.quotes}
            tint={(q) => q.lowest}
            cols={[
              { label: t('inv.vendor'), cell: (q) => <>{q.vendor} {q.lowest && <Pill label={t('inv.rfq.lowest')} />}</> },
              ...dlg.cmp.lines.map((l, i) => ({ label: `${l.item} × ${l.qty}`, cell: (q: IRfqDetail['quotes'][number]) => <>{fmt.rupees(q.prices[i].unitPricePaise)} {q.prices[i].best && '✓'}</>, num: true })),
              { label: t('ops.f.amount'), cell: (q) => fmt.rupees(q.totalPaise), num: true },
              { label: t('inv.rfq.delivery'), cell: (q) => q.deliveryDays, num: true },
              { label: '', cell: (q) => canApprove && dlg.cmp.status === 'open' && <Button size="small" onClick={() => setDlg({ award: { rfqId: dlg.cmp.id, quoteId: q.id } })}>{t('inv.rfq.award')}</Button> },
            ]}
          />
        </InfoDialog>
      )}
      {dlg && typeof dlg === 'object' && 'award' in dlg && <FormDialog title={t('inv.rfq.award')} onSubmit={(v) => awardQuote(dlg.award.rfqId, dlg.award.quoteId, v)} onClose={done} fields={[{ name: 'storeId', label: t('inv.store'), kind: 'select', required: true, options: storeOpts }]} />}
      {dlg === 'transfer' && (
        <FormDialog
          title={t('inv.transfer')}
          onSubmit={transferStock}
          onClose={done}
          fields={[{ name: 'fromStoreId', label: t('inv.from'), kind: 'select', required: true, options: storeOpts }, { name: 'toStoreId', label: t('inv.to'), kind: 'select', required: true, options: storeOpts }, { name: 'itemId', label: t('inv.item'), kind: 'select', required: true, options: itemOpts }, { name: 'qty', label: t('ops.f.qty'), kind: 'number', required: true }]}
        />
      )}
      {dlg === 'retVendor' && (
        <FormDialog
          title={t('inv.returnVendor')}
          onSubmit={returnToVendor}
          onClose={done}
          fields={[{ name: 'poId', label: t('inv.po'), kind: 'select', required: true, options: pos.map((p) => ({ value: p.id, label: `${p.number} · ${p.vendor}` })) }, { name: 'itemId', label: t('inv.item'), kind: 'select', required: true, options: itemOpts }, { name: 'qty', label: t('ops.f.qty'), kind: 'number', required: true }, { name: 'reason', label: t('ho.reason'), required: true }]}
        />
      )}
      {dlg === 'retIssue' && (
        <FormDialog
          title={t('inv.returnIssue')}
          onSubmit={returnFromIssue}
          onClose={done}
          fields={[{ name: 'storeId', label: t('inv.store'), kind: 'select', required: true, options: storeOpts }, { name: 'itemId', label: t('inv.item'), kind: 'select', required: true, options: itemOpts }, { name: 'qty', label: t('ops.f.qty'), kind: 'number', required: true }, { name: 'issuedTo', label: t('inv.returnedBy'), required: true }, { name: 'reason', label: t('ho.reason'), required: true }]}
        />
      )}
      {toastNode}
    </>
  );
}
