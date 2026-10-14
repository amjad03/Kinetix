'use client';

import Link from 'next/link';
import { blacklistVendor, rateVendor } from '@/app/(dashboard)/inventory/actions';
import { Button } from '@/components/shadcn/button';
import { RecordPage } from '@/components/templates';
import { Card, DataTable, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { statusTone, type VendorProfile } from '@/lib/procurement';
import { statusLabel } from '@/lib/procurement-labels';
import { useDialog } from './useDialog';

const SCORES = ['5', '4', '3', '2', '1'].map((n) => ({ value: n, label: n }));

/** A vendor's profile: tax numbers and contact, rating history, orders, approved categories, rate contracts and debit notes. */
export function VendorView({ v, canStore, canApprove }: { v: VendorProfile; canStore: boolean; canApprove: boolean }) {
  const { t, fmt } = useI18n();
  const [open, dialog] = useDialog();
  type Rating = VendorProfile['ratings'][number];
  type Order = VendorProfile['orders'][number];
  type Contract = VendorProfile['contracts'][number];
  type Note = VendorProfile['debitNotes'][number];
  const ratingCols: Column<Rating>[] = [
    { id: 'at', header: t('ivd.date'), rowHeader: true, cell: (r) => fmt.date(r.createdAt.slice(0, 10), 'short') },
    { id: 'q', header: t('ivd.score.quality'), align: 'right', cell: (r) => r.quality },
    { id: 'd', header: t('ivd.score.delivery'), align: 'right', cell: (r) => r.delivery },
    { id: 'p', header: t('ivd.score.price'), align: 'right', cell: (r) => r.price },
    { id: 'po', header: t('inv.po'), cell: (r) => r.po ?? '—' },
    { id: 'by', header: t('ivd.by'), hideBelow: 'sm', cell: (r) => r.by ?? '—' },
    { id: 'note', header: t('ops.f.note'), hideBelow: 'md', cell: (r) => r.note || '—' },
  ];
  const orderCols: Column<Order>[] = [
    { id: 'no', header: t('inv.number'), rowHeader: true, cell: (o) => <Link className="font-medium text-primary hover:underline" href={`/procurement/orders/${o.id}`}>{o.number}</Link> },
    { id: 'at', header: t('ivd.date'), cell: (o) => fmt.date(o.createdAt.slice(0, 10), 'short') },
    { id: 'total', header: t('ops.f.amount'), align: 'right', cell: (o) => fmt.rupees(o.totalPaise) },
    { id: 'status', header: t('ops.f.status'), cell: (o) => <StatusPill tone={statusTone(o.status)}>{statusLabel(t, o.status)}</StatusPill> },
  ];
  const contractCols: Column<Contract>[] = [
    { id: 'item', header: t('inv.item'), rowHeader: true, cell: (c) => `${c.sku} · ${c.item}` },
    { id: 'rate', header: t('ivd.rate'), align: 'right', cell: (c) => fmt.rupees(c.ratePaise) },
    { id: 'valid', header: t('ivd.validTo'), cell: (c) => `${fmt.date(c.validFrom, 'short')} – ${fmt.date(c.validTo, 'short')}` },
    { id: 'ref', header: t('ivd.reference'), hideBelow: 'sm', cell: (c) => c.reference || '—' },
    { id: 'active', header: t('ivd.inForce'), cell: (c) => (c.active ? t('ops.yes') : t('ops.no')) },
  ];
  const noteCols: Column<Note>[] = [
    { id: 'no', header: t('inv.number'), rowHeader: true, cell: (d) => d.number },
    { id: 'reason', header: t('ho.reason'), cell: (d) => d.reason },
    { id: 'amount', header: t('ops.f.amount'), align: 'right', cell: (d) => fmt.rupees(d.amountPaise) },
    { id: 'status', header: t('ops.f.status'), cell: (d) => <StatusPill tone={statusTone(d.status)}>{statusLabel(t, d.status)}</StatusPill> },
  ];
  const ordered = v.orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.totalPaise, 0);

  return (
    <>
      <RecordPage
        title={v.name}
        subtitle={v.contactPerson || undefined}
        status={v.blacklisted ? { label: t('ivd.blacklisted'), tone: 'danger' } : v.active ? { label: t('ivd.st.active'), tone: 'success' } : { label: t('ivd.st.inactive'), tone: 'neutral' }}
        facts={[
          { label: t('ivd.rating'), value: v.score === null ? t('ivd.notRated') : `${fmt.number(v.score, { maximumFractionDigits: 1 })} / 5` },
          { label: t('ivd.orders'), value: fmt.number(v.orders.length) },
          { label: t('ivd.orderedValue'), value: fmt.rupees(ordered) },
          { label: t('inv.gstin'), value: v.gstin ?? '—' },
          { label: t('ivd.pan'), value: v.pan ?? '—' },
          { label: t('ops.f.phone'), value: v.phone || '—' },
        ]}
        primary={
          canStore && !v.blacklisted ? (
            <Button
              onClick={() =>
                open({
                  title: t('ivd.rateVendor'),
                  fields: [...(['quality', 'delivery', 'price'] as const).map((k) => ({ name: k, label: t(`ivd.score.${k}`), kind: 'select' as const, required: true, options: SCORES })), { name: 'poId', label: t('inv.po'), kind: 'select', options: v.orders.map((o) => ({ value: o.id, label: o.number })) }, { name: 'note', label: t('ops.f.note') }],
                  done: t('ivd.rated'),
                  run: (x) => rateVendor(v.id, x),
                })
              }
            >
              {t('ivd.rateVendor')}
            </Button>
          ) : undefined
        }
        secondary={
          canApprove && !v.blacklisted ? (
            <Button variant="outline" className="text-destructive" onClick={() => open({ title: t('ivd.blacklist'), intro: t('ivd.blacklistHelp'), fields: [{ name: 'reason', label: t('ho.reason'), kind: 'multiline', required: true }], done: t('ivd.blacklistedDone'), run: (x) => blacklistVendor(v.id, x) })}>
              {t('ivd.blacklist')}
            </Button>
          ) : undefined
        }
        overview={
          <div className="grid gap-6">
            {v.blacklisted && (
              <Card title={t('ivd.blacklisted')}>
                <p className="text-sm">{v.blacklistReason}</p>
              </Card>
            )}
            <Card title={t('ivd.vendor.contact')}>
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <Fact label={t('ivd.contactPerson')} value={v.contactPerson || '—'} />
                <Fact label={t('inv.email')} value={v.email ?? '—'} />
                <Fact label={t('ivd.address')} value={v.address || '—'} />
                <Fact label={t('ivd.categories')} value={v.categories.map((c) => c.name).join(', ') || t('ivd.anyCategory')} />
              </dl>
            </Card>
          </div>
        }
        related={[
          { value: 'orders', label: t('ivd.orders'), count: v.orders.length, content: <DataTable label={t('ivd.orders')} columns={orderCols} rows={v.orders} rowId={(o) => o.id} empty={t('inv.noPos')} /> },
          { value: 'ratings', label: t('ivd.ratings'), count: v.ratings.length, content: <DataTable label={t('ivd.ratings')} columns={ratingCols} rows={v.ratings} rowId={(r) => r.id} empty={t('ivd.notRated')} /> },
          { value: 'contracts', label: t('ivd.pview.contracts'), count: v.contracts.length, content: <DataTable label={t('ivd.pview.contracts')} columns={contractCols} rows={v.contracts} rowId={(c) => c.id} empty={t('ivd.empty.contracts')} /> },
          { value: 'debit', label: t('ivd.pview.debit'), count: v.debitNotes.length, content: <DataTable label={t('ivd.pview.debit')} columns={noteCols} rows={v.debitNotes} rowId={(d) => d.id} empty={t('ivd.empty.debit')} /> },
        ]}
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
