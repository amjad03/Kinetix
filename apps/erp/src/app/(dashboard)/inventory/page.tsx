import type { Metadata } from 'next';
import { InventoryDesk } from '@/components/inventory/InventoryDesk';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { KitList, type ColSpec, type RowActionSpec, type ToolSpec } from '@/components/procurement/KitList';
import { approveWriteOff, issueSlip, postStoresMonth, proposeWriteOff, rejectWriteOff } from '@/app/(dashboard)/inventory/actions';
import type { Batch } from '@/lib/inventory-pass';
import { lastClosedMonth } from '@/lib/inventory-pass';
import { CategoryRecords, GateRecords, ItemRecords, StoreRecords, VerificationRecords } from '@/components/inventory/StoreRecords';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { IItem, IPoRow, IReq, IRfq, IReturn, IStock, IStore, ITransfer, IVendor } from '@/lib/ops';
import { metaOptions, optional, param } from '@/lib/procurement-server';
import type { RecordMeta } from '@/lib/records';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.inventory') };
}

const VIEWS = ['items', 'stores', 'categories', 'stock', 'issueSlips', 'batches', 'writeOffs', 'moves', 'gate', 'verification'] as const;
type View = (typeof VIEWS)[number];
const ENTITY: Partial<Record<View, string>> = { items: 'inv-items', stores: 'inv-stores', categories: 'inv-categories', gate: 'inv-gate-entries', verification: 'inv-verifications', issueSlips: 'inv-issue-slips', writeOffs: 'inv-write-offs' };
const APPROVERS = ['principal', 'tenant_admin'];
const WO_KINDS = ['expired', 'damaged', 'obsolete', 'lost', 'shortage'] as const;
const WO_MODES = ['scrap', 'auction', 'destroy', 'return_to_vendor', 'none'] as const;

/**
 * The stores: items with stock and reorder levels, stores, categories with their approved vendors, stock by store,
 * transfers and returns, the gate register and the annual stock verification. Buying is under Purchase.
 */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('inventory');
  const approver = (me?.roles ?? []).some((r) => APPROVERS.includes(r));
  const sp = await searchParams;
  const asked = param(sp, 'view');
  const view: View = VIEWS.includes(asked as View) ? (asked as View) : 'items';
  const { t } = await getI18n();
  const entity = ENTITY[view];
  const [list, base, storesMeta] = await Promise.all([
    entity ? loadRecords(entity, sp) : null,
    load(async () => {
      const [items, stores] = await Promise.all([api<IItem[]>('/v1/inventory/items'), api<IStore[]>('/v1/inventory/stores')]);
      return { items, stores };
    }),
    view === 'items' || view === 'issueSlips' ? load(() => api<RecordMeta>('/v1/records/inv-stores/meta')) : null,
  ]);
  const batches = view === 'batches' ? await load(() => api<Batch[]>(`/v1/inventory/batches${Number(param(sp, 'days')) > 0 ? `?expiring=${Math.min(3650, Number(param(sp, 'days')))}` : ''}`)) : null;
  const extra =
    view === 'stock' || view === 'moves'
      ? await load(async () => {
          const [stock, vendors, reqs, pos, rfqs, transfers, returns] = await Promise.all([
            api<IStock[]>('/v1/inventory/stock'),
            optional<IVendor[]>('/v1/inventory/vendors', []),
            api<IReq[]>('/v1/inventory/requisitions'),
            api<IPoRow[]>('/v1/inventory/purchase-orders'),
            api<IRfq[]>('/v1/inventory/rfqs'),
            api<ITransfer[]>('/v1/inventory/stock/transfers'),
            api<IReturn[]>('/v1/inventory/returns'),
          ]);
          return { stock, vendors, reqs, pos, rfqs, transfers, returns };
        })
      : null;
  const failed = list?.error ?? base.error ?? extra?.error ?? batches?.error;
  const items = base.data?.items ?? [];
  const stores = base.data?.stores ?? [];
  const low = items.filter((x) => x.low);
  const storeOpts = stores.map((s) => ({ value: s.id, label: s.name }));
  const itemOpts = items.filter((i) => i.active).map((i) => ({ value: i.id, label: `${i.sku} · ${i.name}` }));
  const departments = metaOptions(storesMeta?.data, 'departmentId');
  const vendorOpts = list?.data && view === 'categories' ? ((await optional<IVendor[]>('/v1/inventory/vendors', [])).filter((v) => !v.blacklisted).map((v) => ({ value: v.id, label: v.name }))) : [];
  const extraParams = { view };
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const lineFields = [1, 2, 3].flatMap((n) => [
    { name: `item${n}`, label: t('ipass.f.item', { n }), kind: 'select' as const, required: n === 1, options: itemOpts },
    { name: `qty${n}`, label: t('ipass.f.qty', { n }), kind: 'number' as const, required: n === 1 },
  ]);
  const slipCols: ColSpec[] = [
    { id: 'number', label: t('ipass.c.slip'), key: 'number', sortKey: 'number', rowHeader: true, sub: 'purpose' },
    { id: 'date', label: t('ipass.c.date'), key: 'createdAt', kind: 'date', sortKey: 'date' },
    { id: 'store', label: t('ipass.c.store'), key: 'storeName', hideBelow: 'md' },
    { id: 'dept', label: t('ipass.c.department'), key: 'departmentName', hideBelow: 'sm' },
    { id: 'to', label: t('ipass.c.issuedTo'), key: 'issuedTo', sub: 'receivedBy' },
    { id: 'indent', label: t('ipass.c.indent'), key: 'requisitionNumber', hideBelow: 'lg', defaultHidden: true },
    { id: 'lines', label: t('ipass.c.lines'), key: 'lines', kind: 'number', hideBelow: 'md' },
    { id: 'value', label: t('ipass.c.value'), key: 'value', kind: 'rupees', sortKey: 'value' },
  ];
  const woStatus = Object.fromEntries(['proposed', 'approved', 'rejected'].map((k) => [k, t(`ipass.wo.status.${k as 'proposed'}`)]));
  const woCols: ColSpec[] = [
    { id: 'number', label: t('ipass.c.writeOff'), key: 'number', sortKey: 'number', rowHeader: true, sub: 'storeName' },
    { id: 'item', label: t('ipass.c.item'), key: 'itemName', sortKey: 'item', sub: 'batchNo' },
    { id: 'qty', label: t('ipass.c.qty'), key: 'qty', kind: 'number' },
    { id: 'kind', label: t('ipass.c.why'), key: 'kind', kind: 'status', labels: Object.fromEntries(WO_KINDS.map((k) => [k, t(`ipass.kind.${k}`)])), hideBelow: 'sm' },
    { id: 'reason', label: t('ipass.c.reason'), key: 'reason', hideBelow: 'md' },
    { id: 'value', label: t('ipass.c.value'), key: 'value', kind: 'rupees', sortKey: 'value', hideBelow: 'sm' },
    { id: 'by', label: t('ipass.c.proposer'), key: 'proposerName', hideBelow: 'lg' },
    { id: 'status', label: t('ipass.c.status'), key: 'status', kind: 'status', labels: woStatus },
  ];
  const slipTools: ToolSpec[] = [
    { id: 'slip', label: t('ipass.newSlip'), intro: t('ipass.slipIntro'), done: t('ipass.slipDone'), disabled: !stores.length, run: issueSlip, fields: [
      { name: 'storeId', label: t('ipass.f.store'), kind: 'select', required: true, options: storeOpts },
      { name: 'departmentId', label: t('ipass.f.department'), kind: 'select', options: departments },
      { name: 'issuedTo', label: t('ipass.f.issuedTo'), required: true },
      { name: 'receivedBy', label: t('ipass.f.receivedBy') },
      { name: 'purpose', label: t('ipass.f.purpose') },
      ...lineFields,
    ] },
    ...(approver ? [{ id: 'month', label: t('ipass.postMonth'), intro: t('ipass.postMonthIntro'), done: t('ipass.posted'), run: postStoresMonth, fields: [{ name: 'month', label: t('ipass.f.month'), required: true, init: lastClosedMonth(today) }] }] : []),
  ];
  const woTools: ToolSpec[] = [
    { id: 'propose', label: t('ipass.propose'), done: t('ipass.proposeDone'), disabled: !stores.length, run: proposeWriteOff, fields: [
      { name: 'storeId', label: t('ipass.f.store'), kind: 'select', required: true, options: storeOpts },
      { name: 'itemId', label: t('ipass.c.item'), kind: 'select', required: true, options: itemOpts },
      { name: 'batchNo', label: t('ipass.f.batch') },
      { name: 'qty', label: t('ipass.c.qty'), kind: 'number', required: true },
      { name: 'kind', label: t('ipass.f.kind'), kind: 'select', required: true, options: WO_KINDS.map((k) => ({ value: k, label: t(`ipass.kind.${k}`) })) },
      { name: 'reason', label: t('ipass.f.reason'), kind: 'multiline', required: true },
      { name: 'disposalMode', label: t('ipass.f.disposal'), kind: 'select', options: WO_MODES.map((k) => ({ value: k, label: t(`ipass.mode.${k}`) })) },
      { name: 'realisedPaise', label: t('ipass.f.realised'), kind: 'rupees' },
    ] },
  ];
  const woActions: RowActionSpec[] = approver
    ? [
        { id: 'approve', label: t('ipass.approve'), when: [{ key: 'status', in: ['proposed'] }], confirm: t('ipass.approveConfirm'), done: t('ipass.approved'), run: approveWriteOff },
        { id: 'reject', label: t('ipass.reject'), danger: true, when: [{ key: 'status', in: ['proposed'] }], fields: [{ name: 'note', label: t('ipass.f.note'), kind: 'multiline', required: true }], done: t('ipass.rejected'), run: rejectWriteOff },
      ]
    : [];
  const stateWords = Object.fromEntries(['expired', 'expiring', 'good', 'no_expiry'].map((k) => [k, t(`ipass.state.${k as 'expired'}`)]));

  return (
    <>
      <PageHeader
        title={t('nav.inventory')}
        subtitle={t('ivd.subtitle')}
        actions={
          <>
            <LinkButton href="/inventory/reports" variant="outlined">{t('ipass.reports')}</LinkButton>
            <LinkButton href="/procurement" variant="outlined">{t('nav.procurement')}</LinkButton>
          </>
        }
      />
      <StatGrid min={140}>
        <StatTile label={t('inv.items')} value={items.length} testId="inv-items" />
        <StatTile label={t('inv.low')} value={low.length} tone={low.length ? 'warning' : 'default'} caption={low.length ? low.slice(0, 2).map((x) => x.name).join(', ') : undefined} testId="inv-low" />
        <StatTile label={t('ivd.stores')} value={stores.length} testId="inv-stores" />
      </StatGrid>
      <LinkTabs
        value={view}
        label={t('nav.inventory')}
        items={VIEWS.map((v) => ({ value: v, label: v === 'issueSlips' || v === 'batches' || v === 'writeOffs' ? t(`ipass.view.${v}`) : t(`ivd.view.${v}`), href: `/inventory?view=${v}` }))}
      />
      {failed !== undefined ? (
        <ErrorState message={failed} />
      ) : view === 'items' && list?.data ? (
        <ItemRecords {...list.data} extraParams={extraParams} stores={storeOpts} items={itemOpts} departments={departments} />
      ) : view === 'stores' && list?.data ? (
        <StoreRecords {...list.data} extraParams={extraParams} />
      ) : view === 'categories' && list?.data ? (
        <CategoryRecords {...list.data} extraParams={extraParams} vendors={vendorOpts} />
      ) : view === 'gate' && list?.data ? (
        <GateRecords {...list.data} extraParams={extraParams} />
      ) : view === 'issueSlips' && list?.data ? (
        <KitList {...list.data} label={t('ipass.view.issueSlips')} cols={slipCols} extraParams={extraParams} tools={slipTools} emptyTitle={t('ipass.emptySlips')} emptyBody={t('ipass.emptySlipsBody')} testId="inv-issue-slips" />
      ) : view === 'writeOffs' && list?.data ? (
        <KitList {...list.data} label={t('ipass.view.writeOffs')} cols={woCols} extraParams={extraParams} tools={woTools} rowActions={woActions} emptyTitle={t('ipass.emptyWo')} emptyBody={t('ipass.emptyWoBody')} testId="inv-write-offs" />
      ) : view === 'batches' && batches?.data ? (
        <DepthDesk
          panels={[
            {
              id: 'batches',
              title: t('ipass.view.batches'),
              empty: t('ipass.batchesNone'),
              stats: [
                { label: t('ipass.state.expired'), value: String(batches.data.filter((b) => b.state === 'expired').length) },
                { label: t('ipass.state.expiring'), value: String(batches.data.filter((b) => b.state === 'expiring').length) },
              ],
              columns: [
                { key: 'item', label: t('ipass.c.item') },
                { key: 'store', label: t('ipass.c.store') },
                { key: 'batchNo', label: t('ipass.c.batch') },
                { key: 'expiryOn', label: t('ipass.c.expiry'), kind: 'date' },
                { key: 'qtyLeft', label: t('ipass.c.qty'), kind: 'num' },
                { key: 'valuePaise', label: t('ipass.c.value'), kind: 'paise' },
                { key: 'receivedOn', label: t('ipass.c.received'), kind: 'date' },
                { key: 'state', label: t('ipass.c.state'), kind: 'pill', words: stateWords, tones: { expired: 'danger', expiring: 'warning', good: 'success', no_expiry: 'neutral' } },
              ],
              rows: batches.data as unknown as Record<string, unknown>[],
            },
          ]}
        />
      ) : view === 'verification' && list?.data ? (
        <VerificationRecords {...list.data} extraParams={extraParams} stores={storeOpts} />
      ) : extra?.data ? (
        <InventoryDesk section={view === 'stock' ? 'stock' : 'moves'} items={items} stores={stores} {...extra.data} canApprove={false} />
      ) : null}
    </>
  );
}
