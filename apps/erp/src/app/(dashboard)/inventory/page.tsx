import type { Metadata } from 'next';
import { InventoryDesk } from '@/components/inventory/InventoryDesk';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { IInvoiceRow, IItem, IPoRow, IReq, IReturn, IRfq, ITransfer, IStock, IStore, IVendor } from '@/lib/ops';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.inventory') };
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireSection('inventory');
  const { tab } = await searchParams;
  const [items, stores, stock, vendors, reqs, pos, invoices, rfqs, transfers, returns] = await Promise.all([
    load(() => api<IItem[]>('/v1/inventory/items')),
    load(() => api<IStore[]>('/v1/inventory/stores')),
    load(() => api<IStock[]>('/v1/inventory/stock')),
    load(() => api<IVendor[]>('/v1/inventory/vendors')),
    load(() => api<IReq[]>('/v1/inventory/requisitions')),
    load(() => api<IPoRow[]>('/v1/inventory/purchase-orders')),
    load(() => api<IInvoiceRow[]>('/v1/inventory/invoices')),
    load(() => api<IRfq[]>('/v1/inventory/rfqs')),
    load(() => api<ITransfer[]>('/v1/inventory/stock/transfers')),
    load(() => api<IReturn[]>('/v1/inventory/returns')),
  ]);
  const { t } = await getI18n();
  const failed = [items, stores, stock, vendors, reqs, pos, invoices, rfqs, transfers, returns].find((x) => x.error !== undefined)?.error;
  const i = items.data ?? [];
  const low = i.filter((x) => x.low);
  const canApprove = (me?.roles ?? []).some((r) => r === 'principal' || r === 'tenant_admin');

  return (
    <>
      <PageHeader title={t('nav.inventory')} subtitle={t('inv.subtitle')} />
      {failed !== undefined ? (
        <ErrorState message={failed} />
      ) : (
        <>
          <StatGrid min={120}>
            <StatTile label={t('inv.items')} value={i.length} testId="inv-items" />
            <StatTile label={t('inv.low')} value={low.length} tone={low.length ? 'warning' : 'default'} caption={low.length ? low.slice(0, 2).map((x) => x.name).join(', ') : undefined} testId="inv-low" />
            <StatTile label={t('inv.pendingReqs')} value={(reqs.data ?? []).filter((x) => x.status === 'submitted').length} testId="inv-reqs" />
            <StatTile label={t('inv.mismatches')} value={(invoices.data ?? []).filter((x) => x.invoice.status === 'mismatch').length} tone="warning" testId="inv-mismatch" />
          </StatGrid>
          <InventoryDesk items={i} stores={stores.data!} stock={stock.data!} vendors={vendors.data!} reqs={reqs.data!} pos={pos.data!} invoices={invoices.data!} rfqs={rfqs.data!} transfers={transfers.data!} returns={returns.data!} canApprove={canApprove} initialTab={tab ?? 'items'} />
        </>
      )}
    </>
  );
}
