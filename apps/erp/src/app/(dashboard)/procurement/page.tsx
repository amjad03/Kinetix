import type { Metadata } from 'next';
import { InventoryDesk } from '@/components/inventory/InventoryDesk';
import { LinkButton } from '@/components/LinkButton';
import { DebitNotes, type DebitRow } from '@/components/procurement/DebitNotes';
import { KitList, type ColSpec, type RowActionSpec } from '@/components/procurement/KitList';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { IItem, IPoRow, IReq, IRfq, IStore, IVendor } from '@/lib/ops';
import { approveInvoice, blacklistVendor, markInvoicePaid, rateVendor } from '@/app/(dashboard)/inventory/actions';
import { modeLabels, statusLabels } from '@/lib/procurement-labels';
import { optional, param } from '@/lib/procurement-server';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.procurement') };
}

const VIEWS = ['orders', 'invoices', 'vendors', 'contracts', 'quotations', 'debit'] as const;
type View = (typeof VIEWS)[number];
const ENTITY: Partial<Record<View, string>> = { orders: 'inv-purchase-orders', invoices: 'inv-invoices', vendors: 'inv-vendors', contracts: 'inv-rate-contracts' };
const STORE = ['store_keeper', 'principal', 'tenant_admin'];
const APPROVERS = ['principal', 'tenant_admin'];
const SCORES = ['5', '4', '3', '2', '1'].map((n) => ({ value: n, label: n }));
const PAY_MODES = ['neft', 'rtgs', 'cheque', 'upi', 'cash', 'dd'] as const;

/**
 * Purchase: orders (by purchase mode, with approval, receipt and amendment on each order's page), vendor invoices with
 * the three-way match and payment vouchers, vendors with ratings and blacklisting, rate contracts, quotations and
 * debit notes. Indents are raised by every member of staff under Indents.
 */
export default async function ProcurementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('procurement');
  const roles = me?.roles ?? [];
  const store = roles.some((r) => STORE.includes(r));
  const approver = roles.some((r) => APPROVERS.includes(r));
  const payer = approver || roles.includes('accountant');
  const views = VIEWS.filter((v) => store || v !== 'quotations');
  const sp = await searchParams;
  const asked = param(sp, 'view');
  const view: View = views.includes(asked as View) ? (asked as View) : 'orders';
  const { t } = await getI18n();
  const entity = ENTITY[view];
  const list = entity ? await loadRecords(entity, sp) : null;
  const rfq =
    view === 'quotations'
      ? await load(async () => {
          const [items, stores, vendors, reqs, pos, rfqs] = await Promise.all([api<IItem[]>('/v1/inventory/items'), api<IStore[]>('/v1/inventory/stores'), api<IVendor[]>('/v1/inventory/vendors'), api<IReq[]>('/v1/inventory/requisitions'), api<IPoRow[]>('/v1/inventory/purchase-orders'), api<IRfq[]>('/v1/inventory/rfqs')]);
          return { items, stores, vendors, reqs, pos, rfqs };
        })
      : null;
  const debit = view === 'debit' ? await load(() => api<DebitRow[]>('/v1/inventory/debit-notes')) : null;
  const stats = await load(async () => {
    const [pending, mismatch] = await Promise.all([optional<{ total: number }>('/v1/records/inv-purchase-orders?pageSize=1&f.status=pending_approval', { total: 0 }), optional<{ total: number }>('/v1/records/inv-invoices?pageSize=1&f.status=mismatch', { total: 0 })]);
    return { pending: pending.total, mismatch: mismatch.total };
  });
  const failed = list?.error ?? rfq?.error ?? debit?.error;
  const st = statusLabels(t);
  const extraParams = { view };

  const cols: Record<string, ColSpec[]> = {
    orders: [
      { id: 'number', label: t('inv.number'), key: 'number', sortKey: 'number', rowHeader: true, href: '/procurement/orders/{id}', sub: 'departmentName' },
      { id: 'vendor', label: t('inv.vendor'), key: 'vendorName', sortKey: 'vendor' },
      { id: 'mode', label: t('ivd.purchaseMode'), key: 'purchaseMode', kind: 'status', labels: modeLabels(t), hideBelow: 'md' },
      { id: 'total', label: t('ops.f.amount'), key: 'total', kind: 'rupees', sortKey: 'total' },
      { id: 'received', label: t('ivd.receivedOf'), key: 'received', kind: 'number', hideBelow: 'md', defaultHidden: true },
      { id: 'delivery', label: t('ivd.deliveryBy'), key: 'deliveryBy', kind: 'date', sortKey: 'deliveryBy', hideBelow: 'lg' },
      { id: 'created', label: t('ivd.date'), key: 'createdAt', kind: 'date', sortKey: 'created', hideBelow: 'sm' },
      { id: 'status', label: t('ops.f.status'), key: 'status', kind: 'status', labels: st },
    ],
    invoices: [
      { id: 'invoiceNo', label: t('inv.invoiceNo'), key: 'invoiceNo', sortKey: 'invoiceNo', rowHeader: true, sub: 'invoiceDate' },
      { id: 'po', label: t('inv.po'), key: 'poNumber', href: '/procurement/orders/{poId}' },
      { id: 'vendor', label: t('inv.vendor'), key: 'vendorName', sortKey: 'vendor', hideBelow: 'sm' },
      { id: 'amount', label: t('inv.invoiced'), key: 'amount', kind: 'rupees', sortKey: 'amount' },
      { id: 'expected', label: t('inv.expected'), key: 'expected', kind: 'rupees', hideBelow: 'md' },
      { id: 'debit', label: t('ivd.debitSetOff'), key: 'debit', kind: 'rupees', defaultHidden: true },
      { id: 'voucher', label: t('ivd.voucher'), key: 'voucherNo', hideBelow: 'lg', sub: 'paidOn' },
      { id: 'status', label: t('ops.f.status'), key: 'status', kind: 'status', labels: st },
    ],
    vendors: [
      { id: 'name', label: t('ops.f.name'), key: 'name', sortKey: 'name', rowHeader: true, href: '/procurement/vendors/{id}', sub: 'contactPerson' },
      { id: 'gstin', label: t('inv.gstin'), key: 'gstin', hideBelow: 'md' },
      { id: 'phone', label: t('ops.f.phone'), key: 'phone', hideBelow: 'sm' },
      { id: 'score', label: t('ivd.rating'), key: 'score', kind: 'lpa', sortKey: 'rating' },
      { id: 'orders', label: t('ivd.orders'), key: 'orders', kind: 'number', sortKey: 'orders', hideBelow: 'md' },
      { id: 'ordered', label: t('ivd.orderedValue'), key: 'ordered', kind: 'rupees', sortKey: 'ordered', hideBelow: 'lg' },
      { id: 'blacklisted', label: t('ivd.blacklisted'), key: 'blacklistReason', hideBelow: 'md' },
    ],
    contracts: [
      { id: 'vendor', label: t('inv.vendor'), key: 'vendorName', sortKey: 'vendor', rowHeader: true },
      { id: 'item', label: t('inv.item'), key: 'itemName', sortKey: 'item', sub: 'sku' },
      { id: 'rate', label: t('ivd.rate'), key: 'rate', kind: 'rupees', sortKey: 'rate' },
      { id: 'from', label: t('ivd.validFrom'), key: 'validFrom', kind: 'date', hideBelow: 'md' },
      { id: 'to', label: t('ivd.validTo'), key: 'validTo', kind: 'date', sortKey: 'validTo' },
      { id: 'ref', label: t('ivd.reference'), key: 'reference', hideBelow: 'lg' },
      { id: 'inForce', label: t('ivd.inForce'), key: 'inForce', kind: 'yesno' },
    ],
  };

  const rowActions: Record<string, RowActionSpec[]> = {
    invoices: [
      ...(approver ? [{ id: 'approve', label: t('ivd.inv.approve'), when: [{ key: 'status', in: ['mismatch'] }], confirm: t('ivd.inv.approveHelp'), done: t('ivd.inv.approved'), run: approveInvoice }] : []),
      ...(payer
        ? [
            {
              id: 'pay',
              label: t('inv.markPaid'),
              when: [{ key: 'status', in: ['matched', 'approved'] }],
              fields: [
                { name: 'paymentMode', label: t('ivd.payMode'), kind: 'select' as const, required: true, options: PAY_MODES.map((m) => ({ value: m, label: t(`ivd.pay.${m}`) })) },
                { name: 'paymentRef', label: t('ivd.payRef') },
                { name: 'paidOn', label: t('ivd.paidOn'), kind: 'date' as const },
              ],
              done: t('ivd.inv.paid'),
              run: markInvoicePaid,
            },
          ]
        : []),
    ],
    vendors: [
      ...(store
        ? [
            {
              id: 'rate',
              label: t('ivd.rateVendor'),
              when: [{ key: 'blacklisted', in: [false] }],
              fields: [
                ...(['quality', 'delivery', 'price'] as const).map((k) => ({ name: k, label: t(`ivd.score.${k}`), kind: 'select' as const, required: true, options: SCORES })),
                { name: 'note', label: t('ops.f.note') },
              ],
              done: t('ivd.rated'),
              run: rateVendor,
            },
          ]
        : []),
      ...(approver ? [{ id: 'blacklist', label: t('ivd.blacklist'), danger: true, when: [{ key: 'blacklisted', in: [false] }], fields: [{ name: 'reason', label: t('ho.reason'), kind: 'multiline' as const, required: true }], done: t('ivd.blacklistedDone'), run: blacklistVendor }] : []),
    ],
  };

  return (
    <>
      <PageHeader title={t('nav.procurement')} subtitle={t('ivd.proc.subtitle')} actions={<LinkButton href="/indents" variant="outlined">{t('nav.indents')}</LinkButton>} />
      {stats.data && (
        <StatGrid min={160}>
          <StatTile label={t('ivd.poWaiting')} value={stats.data.pending} tone={stats.data.pending ? 'warning' : 'default'} testId="proc-waiting" />
          <StatTile label={t('inv.mismatches')} value={stats.data.mismatch} tone={stats.data.mismatch ? 'warning' : 'default'} testId="proc-mismatch" />
        </StatGrid>
      )}
      <LinkTabs value={view} label={t('nav.procurement')} items={views.map((v) => ({ value: v, label: t(`ivd.pview.${v}`), href: `/procurement?view=${v}` }))} />
      {failed !== undefined ? (
        <ErrorState message={failed} />
      ) : list?.data ? (
        <KitList
          {...list.data}
          label={t(`ivd.pview.${view}`)}
          cols={cols[view]}
          extraParams={extraParams}
          rowHref={view === 'orders' ? '/procurement/orders/{id}' : view === 'vendors' ? '/procurement/vendors/{id}' : view === 'invoices' ? '/procurement/orders/{poId}' : undefined}
          rowActions={rowActions[view] ?? []}
          emptyTitle={t(`ivd.empty.${view as 'orders'}`)}
          emptyBody={t(`ivd.emptyHelp.${view as 'orders'}`)}
          testId={`proc-${view}`}
        />
      ) : rfq?.data ? (
        <InventoryDesk section="rfq" {...rfq.data} stock={[]} transfers={[]} returns={[]} canApprove={approver} />
      ) : debit?.data ? (
        <DebitNotes rows={debit.data} />
      ) : null}
    </>
  );
}

