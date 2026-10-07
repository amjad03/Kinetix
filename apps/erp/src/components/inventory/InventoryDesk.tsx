'use client';

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';
import { addItem, addStore, addVendor, approveInvoice, createPo, decideRequisition, loadPo, markInvoicePaid, moveStock, raiseRequisition, receiveGoods, recordInvoice } from '@/app/(dashboard)/inventory/actions';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import { newKey } from '@/lib/ops';
import { st } from '@/lib/ops-labels';
import type { IInvoiceRow, IItem, IPoDetail, IPoRow, IReq, IStock, IStore, IVendor } from '@/lib/ops';

type Dialog = 'item' | 'store' | 'vendor' | 'req' | { move: 'in' | 'out' | 'issue' } | { reject: IReq } | { po: IReq } | { pod: IPoDetail } | { grn: IPoDetail } | { inv: IPoDetail };

export function InventoryDesk({ items, stores, stock, vendors, reqs, pos, invoices, canApprove, initialTab }: { items: IItem[]; stores: IStore[]; stock: IStock[]; vendors: IVendor[]; reqs: IReq[]; pos: IPoRow[]; invoices: IInvoiceRow[]; canApprove: boolean; initialTab: string }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [toast, toastNode] = useToast();
  const key = useRef('');
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const show = (d: Dialog) => {
    key.current = newKey();
    setDlg(d);
  };
  const openPo = async (poId: string, kind: 'pod' | 'grn' | 'inv') => {
    const res = await loadPo(poId);
    if (res.ok) show({ [kind]: res.data } as Dialog);
    else toast(res.error);
  };
  const storeOpts = stores.map((s) => ({ value: s.id, label: s.name }));
  const itemOpts = items.filter((i) => i.active).map((i) => ({ value: i.id, label: `${i.sku} · ${i.name}` }));
  const btn = (label: string, d: Dialog, disabled?: boolean) => (
    <Button variant="outlined" onClick={() => show(d)} disabled={disabled}>{label}</Button>
  );
  const moveFields = (kind: 'in' | 'out' | 'issue'): Field[] => [
    { name: 'storeId', label: t('inv.store'), kind: 'select', required: true, options: storeOpts },
    { name: 'itemId', label: t('inv.item'), kind: 'select', required: true, options: itemOpts },
    { name: 'qty', label: t('ops.f.qty'), kind: 'number', required: true },
    ...(kind === 'issue' ? [{ name: 'issuedTo', label: t('inv.issuedTo'), required: true } as Field] : []),
    { name: 'note', label: t('ops.f.note') },
  ];
  const qtyFields = (rows: { id: string; label: string }[]): Field[] => rows.map((r) => ({ name: `q_${r.id}`, label: r.label, kind: 'number' }));

  return (
    <>
      <Tabbed
        label={t('nav.inventory')}
        initial={initialTab}
        tabs={[
          {
            id: 'items',
            label: t('inv.tab.items', { n: items.length }),
            node: (
              <>
                <Bar>
                  {btn(t('inv.addItem'), 'item')}
                  {btn(t('inv.stockIn'), { move: 'in' }, stores.length === 0 || items.length === 0)}
                  {btn(t('inv.stockOut'), { move: 'out' }, stores.length === 0 || items.length === 0)}
                  {btn(t('inv.issue'), { move: 'issue' }, stores.length === 0 || items.length === 0)}
                </Bar>
                <Grid
                  testId="inv-item-list"
                  empty={t('inv.noItems')}
                  rows={items}
                  tint={(i) => i.low}
                  cols={[
                    { label: t('inv.sku'), cell: (i) => i.sku },
                    { label: t('ops.f.name'), cell: (i) => <>{i.name} {i.low && <Pill warn label={t('inv.lowChip')} />}</> },
                    { label: t('inv.category'), cell: (i) => i.category },
                    { label: t('inv.onHand'), cell: (i) => `${i.onHand} ${i.unit}`, num: true },
                    { label: t('inv.reorderLevel'), cell: (i) => i.reorderLevel, num: true },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'stock',
            label: t('inv.tab.stock', { n: stores.length }),
            node: (
              <>
                <Bar>{btn(t('inv.addStore'), 'store')}</Bar>
                <Grid testId="inv-stores" empty={t('inv.noStores')} rows={stores} cols={[{ label: t('ops.f.name'), cell: (s) => s.name }, { label: t('inv.location'), cell: (s) => s.location || t('ops.none') }]} />
                <Typography variant="h6" sx={{ fontSize: '1.125rem', mt: 3, mb: 1 }}>{t('inv.stockByStore')}</Typography>
                <Grid
                  testId="inv-stock"
                  empty={t('inv.noStock')}
                  rows={stock}
                  tint={(s) => s.reorderLevel > 0 && s.qty <= s.reorderLevel}
                  cols={[{ label: t('inv.store'), cell: (s) => s.store }, { label: t('inv.item'), cell: (s) => `${s.sku} · ${s.item}` }, { label: t('inv.onHand'), cell: (s) => `${s.qty} ${s.unit}`, num: true }]}
                />
              </>
            ),
          },
          {
            id: 'vendors',
            label: t('inv.tab.vendors', { n: vendors.length }),
            node: (
              <>
                <Bar>{btn(t('inv.addVendor'), 'vendor')}</Bar>
                <Grid
                  testId="inv-vendors"
                  empty={t('inv.noVendors')}
                  rows={vendors}
                  cols={[{ label: t('ops.f.name'), cell: (v) => v.name }, { label: t('inv.gstin'), cell: (v) => v.gstin ?? t('ops.none') }, { label: t('ops.f.phone'), cell: (v) => v.phone || t('ops.none') }, { label: t('inv.email'), cell: (v) => v.email ?? t('ops.none') }]}
                />
              </>
            ),
          },
          {
            id: 'reqs',
            label: t('inv.tab.reqs', { n: reqs.filter((r) => r.status === 'submitted').length }),
            node: (
              <>
                <Bar>{btn(t('inv.raiseReq'), 'req', items.length === 0)}</Bar>
                <Grid
                  testId="inv-reqs-list"
                  empty={t('inv.noReqs')}
                  rows={reqs}
                  cols={[
                    { label: t('inv.number'), cell: (r) => r.number },
                    { label: t('inv.lines'), cell: (r) => r.lines.map((l) => `${l.item} × ${l.qty}`).join(', ') },
                    { label: t('ho.reason'), cell: (r) => r.reason || t('ops.none') },
                    { label: t('ops.f.status'), cell: (r) => <Pill label={st(t, r.status)} /> },
                    {
                      label: '',
                      cell: (r) => (
                        <>
                          {canApprove && r.status === 'submitted' && <ActionButton label={t('inv.approve')} run={() => decideRequisition(r.id, true)} onDone={toast} />}
                          {canApprove && r.status === 'submitted' && <Button size="small" color="error" onClick={() => show({ reject: r })}>{t('inv.reject')}</Button>}
                          {r.status === 'approved' && <Button size="small" onClick={() => show({ po: r })} disabled={vendors.length === 0 || stores.length === 0}>{t('inv.createPo')}</Button>}
                        </>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'orders',
            label: t('inv.tab.orders', { n: pos.length }),
            node: (
              <>
                <Grid
                  testId="inv-pos"
                  empty={t('inv.noPos')}
                  rows={pos}
                  cols={[
                    { label: t('inv.number'), cell: (p) => p.number },
                    { label: t('inv.vendor'), cell: (p) => p.vendor },
                    { label: t('ops.f.amount'), cell: (p) => fmt.rupees(p.totalPaise), num: true },
                    { label: t('ops.f.status'), cell: (p) => <Pill label={st(t, p.status)} /> },
                    {
                      label: '',
                      cell: (p) => (
                        <>
                          <Button size="small" onClick={() => void openPo(p.id, 'pod')}>{t('ops.details')}</Button>
                          {p.status !== 'received' && p.status !== 'cancelled' && <Button size="small" onClick={() => void openPo(p.id, 'grn')}>{t('inv.receive')}</Button>}
                          <Button size="small" onClick={() => void openPo(p.id, 'inv')}>{t('inv.recordInvoice')}</Button>
                        </>
                      ),
                    },
                  ]}
                />
                <Typography variant="h6" sx={{ fontSize: '1.125rem', mt: 3, mb: 1 }}>{t('inv.invoices')}</Typography>
                <Grid
                  testId="inv-invoices"
                  empty={t('inv.noInvoices')}
                  rows={invoices}
                  tint={(r) => r.invoice.status === 'mismatch'}
                  cols={[
                    { label: t('inv.invoiceNo'), cell: (r) => r.invoice.invoiceNo },
                    { label: t('inv.number'), cell: (r) => `${r.po} · ${r.vendor}` },
                    { label: t('inv.invoiced'), cell: (r) => fmt.rupees(r.invoice.amountPaise), num: true },
                    { label: t('inv.expected'), cell: (r) => fmt.rupees(r.invoice.expectedPaise), num: true },
                    { label: t('ops.f.status'), cell: (r) => <Pill warn={r.invoice.status === 'mismatch'} label={st(t, r.invoice.status)} /> },
                    {
                      label: '',
                      cell: (r) => (
                        <>
                          {canApprove && r.invoice.status === 'mismatch' && <ActionButton label={t('inv.approve')} run={() => approveInvoice(r.invoice.id)} onDone={toast} />}
                          {canApprove && (r.invoice.status === 'matched' || r.invoice.status === 'approved') && <ActionButton label={t('inv.markPaid')} run={() => markInvoicePaid(r.invoice.id)} onDone={toast} />}
                        </>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />

      {dlg === 'item' && (
        <FormDialog
          title={t('inv.addItem')}
          onSubmit={addItem}
          onClose={done}
          fields={[{ name: 'sku', label: t('inv.sku'), required: true }, { name: 'name', label: t('ops.f.name'), required: true }, { name: 'category', label: t('inv.category') }, { name: 'unit', label: t('inv.unit') }, { name: 'reorderLevel', label: t('inv.reorderLevel'), kind: 'number' }]}
        />
      )}
      {dlg === 'store' && <FormDialog title={t('inv.addStore')} onSubmit={addStore} onClose={done} fields={[{ name: 'name', label: t('ops.f.name'), required: true }, { name: 'location', label: t('inv.location') }]} />}
      {dlg === 'vendor' && (
        <FormDialog
          title={t('inv.addVendor')}
          onSubmit={addVendor}
          onClose={done}
          fields={[{ name: 'name', label: t('ops.f.name'), required: true }, { name: 'gstin', label: t('inv.gstin') }, { name: 'phone', label: t('ops.f.phone') }, { name: 'email', label: t('inv.email') }]}
        />
      )}
      {dlg === 'req' && <FormDialog title={t('inv.raiseReq')} onSubmit={raiseRequisition} onClose={done} fields={[{ name: 'reason', label: t('ho.reason') }, ...qtyFields(items.filter((i) => i.active).map((i) => ({ id: i.id, label: `${i.name} (${i.unit})` })))]} />}
      {dlg && typeof dlg === 'object' && 'move' in dlg && (
        <FormDialog title={t(dlg.move === 'in' ? 'inv.stockIn' : dlg.move === 'out' ? 'inv.stockOut' : 'inv.issue')} onSubmit={(v) => moveStock(dlg.move, v)} onClose={done} fields={moveFields(dlg.move)} />
      )}
      {dlg && typeof dlg === 'object' && 'reject' in dlg && (
        <FormDialog title={t('inv.reject')} submitLabel={t('inv.reject')} onSubmit={(v) => decideRequisition(dlg.reject.id, false, v)} onClose={done} fields={[{ name: 'note', label: t('ops.f.note') }]} />
      )}
      {dlg && typeof dlg === 'object' && 'po' in dlg && (
        <FormDialog
          title={t('inv.createPo')}
          onSubmit={(v) => createPo(dlg.po.id, v, dlg.po.lines.map((l) => ({ itemId: l.itemId, qty: l.qty })))}
          onClose={done}
          fields={[
            { name: 'vendorId', label: t('inv.vendor'), kind: 'select', required: true, options: vendors.map((v) => ({ value: v.id, label: v.name })) },
            { name: 'storeId', label: t('inv.store'), kind: 'select', required: true, options: storeOpts },
            ...dlg.po.lines.map((l): Field => ({ name: `p_${l.itemId}`, label: t('inv.unitPrice', { item: l.item, qty: l.qty }), kind: 'rupees', required: true })),
          ]}
        />
      )}
      {dlg && typeof dlg === 'object' && 'pod' in dlg && (
        <InfoDialog title={dlg.pod.number} onClose={() => setDlg(null)}>
          <Grid
            testId="inv-po-lines"
            empty={t('inv.noLines')}
            rows={dlg.pod.lines}
            cols={[
              { label: t('inv.item'), cell: (l) => l.item },
              { label: t('ops.f.qty'), cell: (l) => l.qty, num: true },
              { label: t('inv.received'), cell: (l) => l.receivedQty, num: true },
              { label: t('inv.unitPriceCol'), cell: (l) => fmt.rupees(l.unitPricePaise), num: true },
            ]}
          />
        </InfoDialog>
      )}
      {dlg && typeof dlg === 'object' && 'grn' in dlg && (
        <FormDialog
          title={t('inv.receive')}
          intro={<Typography variant="body2" color="text.secondary">{t('inv.receiveHelp')}</Typography>}
          onSubmit={(v) => receiveGoods(dlg.grn.id, v, key.current)}
          onClose={done}
          fields={[...qtyFields(dlg.grn.lines.map((l) => ({ id: l.id, label: t('inv.lineLeft', { item: l.item, n: Math.max(0, l.qty - l.receivedQty) }) }))), { name: 'note', label: t('ops.f.note') }]}
        />
      )}
      {dlg && typeof dlg === 'object' && 'inv' in dlg && (
        <FormDialog
          title={t('inv.recordInvoice')}
          intro={<Typography variant="body2" color="text.secondary">{t('inv.invoiceHelp', { amount: fmt.rupees(dlg.inv.lines.reduce((s, l) => s + l.receivedQty * l.unitPricePaise, 0)) })}</Typography>}
          onSubmit={(v) => recordInvoice(dlg.inv.id, v)}
          onClose={done}
          fields={[{ name: 'invoiceNo', label: t('inv.invoiceNo'), required: true }, { name: 'amount', label: t('ops.f.amount'), kind: 'rupees', required: true }]}
        />
      )}
      {toastNode}
    </>
  );
}
