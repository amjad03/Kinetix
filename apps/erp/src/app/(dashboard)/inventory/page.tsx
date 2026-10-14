import type { Metadata } from 'next';
import { InventoryDesk } from '@/components/inventory/InventoryDesk';
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

const VIEWS = ['items', 'stores', 'categories', 'stock', 'moves', 'gate', 'verification'] as const;
type View = (typeof VIEWS)[number];
const ENTITY: Partial<Record<View, string>> = { items: 'inv-items', stores: 'inv-stores', categories: 'inv-categories', gate: 'inv-gate-entries', verification: 'inv-verifications' };

/**
 * The stores: items with stock and reorder levels, stores, categories with their approved vendors, stock by store,
 * transfers and returns, the gate register and the annual stock verification. Buying is under Purchase.
 */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('inventory');
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
    view === 'items' ? load(() => api<RecordMeta>('/v1/records/inv-stores/meta')) : null,
  ]);
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
  const failed = list?.error ?? base.error ?? extra?.error;
  const items = base.data?.items ?? [];
  const stores = base.data?.stores ?? [];
  const low = items.filter((x) => x.low);
  const storeOpts = stores.map((s) => ({ value: s.id, label: s.name }));
  const itemOpts = items.filter((i) => i.active).map((i) => ({ value: i.id, label: `${i.sku} · ${i.name}` }));
  const departments = metaOptions(storesMeta?.data, 'departmentId');
  const vendorOpts = list?.data && view === 'categories' ? ((await optional<IVendor[]>('/v1/inventory/vendors', [])).filter((v) => !v.blacklisted).map((v) => ({ value: v.id, label: v.name }))) : [];
  const extraParams = { view };

  return (
    <>
      <PageHeader title={t('nav.inventory')} subtitle={t('ivd.subtitle')} actions={<LinkButton href="/procurement" variant="outlined">{t('nav.procurement')}</LinkButton>} />
      <StatGrid min={140}>
        <StatTile label={t('inv.items')} value={items.length} testId="inv-items" />
        <StatTile label={t('inv.low')} value={low.length} tone={low.length ? 'warning' : 'default'} caption={low.length ? low.slice(0, 2).map((x) => x.name).join(', ') : undefined} testId="inv-low" />
        <StatTile label={t('ivd.stores')} value={stores.length} testId="inv-stores" />
      </StatGrid>
      <LinkTabs
        value={view}
        label={t('nav.inventory')}
        items={VIEWS.map((v) => ({ value: v, label: t(`ivd.view.${v}`), href: `/inventory?view=${v}` }))}
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
      ) : view === 'verification' && list?.data ? (
        <VerificationRecords {...list.data} extraParams={extraParams} stores={storeOpts} />
      ) : extra?.data ? (
        <InventoryDesk section={view === 'stock' ? 'stock' : 'moves'} items={items} stores={stores} {...extra.data} canApprove={false} />
      ) : null}
    </>
  );
}
