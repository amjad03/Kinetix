'use client';

import { Boxes, ClipboardCheck, DoorOpen, FolderTree, PackageSearch, Warehouse } from 'lucide-react';
import { useState } from 'react';
import { moveStock, reorderIndent, setApprovedVendors, startVerification, transferStock } from '@/app/(dashboard)/inventory/actions';
import { useDialog } from '@/components/procurement/useDialog';
import { RecordsTable } from '@/components/records/RecordsTable';
import { Button } from '@/components/shadcn/button';
import { CheckboxField, Dialog, EmptyState, StatusPill, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { recordHref } from '@/lib/campus-ops';
import { statusTone, type Option } from '@/lib/procurement';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { useRouter } from 'next/navigation';

interface KitProps {
  meta: RecordMeta;
  page: RecordsPage<Row>;
  state: ListState;
  extraParams?: Record<string, string>;
}

const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? '' : String(r[k]));
const n = (r: Row, k: string) => Number(r[k] ?? 0);

/** Items with stock on hand and reorder levels; stock in, out, issue and transfer from the toolbar; low items reordered in bulk. */
export function ItemRecords({ meta, page, state, extraParams, stores, items, departments }: KitProps & { stores: Option[]; items: Option[]; departments: Option[] }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, dialog] = useDialog();
  const move = (kind: 'in' | 'out' | 'issue') =>
    open({
      title: t(kind === 'in' ? 'inv.stockIn' : kind === 'out' ? 'inv.stockOut' : 'inv.issue'),
      fields: [
        { name: 'storeId', label: t('inv.store'), kind: 'select', required: true, options: stores },
        { name: 'itemId', label: t('inv.item'), kind: 'select', required: true, options: items },
        { name: 'qty', label: t('ops.f.qty'), kind: 'number', required: true },
        ...(kind === 'issue' ? [{ name: 'issuedTo', label: t('inv.issuedTo'), required: true }, { name: 'departmentId', label: t('ivd.department'), kind: 'select' as const, options: departments }] : []),
        { name: 'note', label: t('ops.f.note'), required: kind === 'out' },
      ],
      run: (v) => moveStock(kind, v),
    });
  const columns: Column<Row>[] = [
    { id: 'sku', header: t('inv.sku'), sortKey: 'sku', rowHeader: true, hideable: false, cell: (r) => s(r, 'sku') },
    { id: 'name', header: t('ops.f.name'), sortKey: 'name', cell: (r) => <>{s(r, 'name')} {r.low ? <StatusPill tone="warning">{t('inv.lowChip')}</StatusPill> : null}</> },
    { id: 'category', header: t('inv.category'), sortKey: 'category', hideBelow: 'sm', cell: (r) => s(r, 'category') },
    { id: 'onHand', header: t('inv.onHand'), sortKey: 'onHand', align: 'right', cell: (r) => `${fmt.number(n(r, 'onHand'))} ${s(r, 'unit')}` },
    { id: 'reorder', header: t('inv.reorderLevel'), sortKey: 'reorder', align: 'right', hideBelow: 'md', cell: (r) => fmt.number(n(r, 'reorderLevel')) },
    { id: 'reorderQty', header: t('ivd.reorderQty'), align: 'right', defaultHidden: true, cell: (r) => fmt.number(n(r, 'reorderQty')) },
    { id: 'lastPrice', header: t('ivd.lastPrice'), align: 'right', defaultHidden: true, cell: (r) => fmt.rupees(Math.round(n(r, 'lastPrice') * 100)) },
  ];
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        extraParams={extraParams}
        label={t('ivd.items')}
        columns={columns}
        rowHref={(r) => recordHref('item', r.id)}
        toolbar={
          <>
            <Button variant="outline" onClick={() => move('in')} disabled={!stores.length}>{t('inv.stockIn')}</Button>
            <Button variant="outline" onClick={() => move('out')} disabled={!stores.length}>{t('inv.stockOut')}</Button>
            <Button variant="outline" onClick={() => move('issue')} disabled={!stores.length}>{t('inv.issue')}</Button>
            <Button
              variant="outline"
              disabled={stores.length < 2}
              onClick={() =>
                open({
                  title: t('inv.transfer'),
                  fields: [
                    { name: 'fromStoreId', label: t('inv.from'), kind: 'select', required: true, options: stores },
                    { name: 'toStoreId', label: t('inv.to'), kind: 'select', required: true, options: stores },
                    { name: 'itemId', label: t('inv.item'), kind: 'select', required: true, options: items },
                    { name: 'qty', label: t('ops.f.qty'), kind: 'number', required: true },
                    { name: 'note', label: t('ops.f.note') },
                  ],
                  run: transferStock,
                })
              }
            >
              {t('inv.transfer')}
            </Button>
          </>
        }
        extraBulkActions={[
          {
            id: 'reorder',
            label: t('ivd.reorderIndent'),
            onClick: async (rows) => {
              const r = await reorderIndent(rows.map((x) => x.id));
              if (!r.ok) return toast.error(r.error);
              toast.success(t('ivd.reorderRaised', { number: r.data.number }));
              router.refresh();
            },
          },
        ]}
        empty={
          meta.can.create ? undefined : <EmptyState icon={<Boxes />} title={t('inv.noItems')} testId="no-items">
            {t('ivd.itemsEmpty')}
          </EmptyState>
        }
      />
      {dialog}
    </>
  );
}

/** Stores (central, department, lab) with their custodian. */
export function StoreRecords({ meta, page, state, extraParams }: KitProps) {
  const { t, fmt } = useI18n();
  const columns: Column<Row>[] = [
    { id: 'name', header: t('ops.f.name'), sortKey: 'name', rowHeader: true, hideable: false, cell: (r) => s(r, 'name') },
    { id: 'kind', header: t('ivd.kind'), sortKey: 'kind', cell: (r) => t(`ivd.storeKind.${s(r, 'kind') as 'central'}`) },
    { id: 'department', header: t('ivd.department'), sortKey: 'department', hideBelow: 'sm', cell: (r) => s(r, 'departmentName') || '—' },
    { id: 'location', header: t('inv.location'), hideBelow: 'md', cell: (r) => s(r, 'location') || '—' },
    { id: 'custodian', header: t('ivd.custodian'), hideBelow: 'md', cell: (r) => s(r, 'custodianName') || '—' },
    { id: 'items', header: t('ivd.itemsInStock'), sortKey: 'items', align: 'right', cell: (r) => fmt.number(n(r, 'items')) },
  ];
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      extraParams={extraParams}
      label={t('ivd.stores')}
      columns={columns}
      rowHref={(r) => recordHref('store', r.id)}
      empty={
        meta.can.create ? undefined : <EmptyState icon={<Warehouse />} title={t('inv.noStores')}>
          {t('ivd.storesEmpty')}
        </EmptyState>
      }
    />
  );
}

/** Item categories with their approved vendor list (set from a row action). */
export function CategoryRecords({ meta, page, state, extraParams, vendors }: KitProps & { vendors: Option[] }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<{ row: Row; chosen: Set<string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const columns: Column<Row>[] = [
    { id: 'name', header: t('ops.f.name'), sortKey: 'name', rowHeader: true, hideable: false, cell: (r) => s(r, 'name') },
    { id: 'description', header: t('ho.description'), hideBelow: 'md', cell: (r) => s(r, 'description') || '—' },
    { id: 'items', header: t('ivd.items'), sortKey: 'items', align: 'right', cell: (r) => fmt.number(n(r, 'items')) },
    { id: 'vendors', header: t('ivd.approvedVendors'), sortKey: 'vendors', cell: (r) => s(r, 'vendorNames') || <span className="text-muted-foreground">{t('ivd.anyVendor')}</span> },
  ];
  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const r = await setApprovedVendors(editing.row.id, [...editing.chosen]);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setEditing(null);
    toast.success(t('ops.saved'));
    router.refresh();
  };
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        extraParams={extraParams}
        label={t('ivd.categories')}
        columns={columns}
        extraRowActions={(r) => [
          {
            id: 'vendors',
            label: t('ivd.setVendors'),
            onSelect: () => {
              const names = new Set(s(r, 'vendorNames').split(', ').filter(Boolean));
              setEditing({ row: r, chosen: new Set(vendors.filter((v) => names.has(v.label)).map((v) => v.value)) });
            },
          },
        ]}
        empty={
          meta.can.create ? undefined : <EmptyState icon={<FolderTree />} title={t('ivd.categoriesNone')}>
            {t('ivd.categoriesEmpty')}
          </EmptyState>
        }
      />
      {editing && (
        <Dialog
          title={t('ivd.vendorsFor', { name: s(editing.row, 'name') })}
          onClose={() => setEditing(null)}
          busy={busy}
          actions={
            <>
              <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>{t('ops.cancel')}</Button>
              <Button onClick={() => void save()} disabled={busy} data-testid="vendors-save">{t('ops.save')}</Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground mb-3">{t('ivd.vendorsHelp')}</p>
          {vendors.length === 0 && <p className="text-sm">{t('inv.noVendors')}</p>}
          <div className="grid gap-1">
            {vendors.map((v) => (
              <CheckboxField
                key={v.value}
                label={v.label}
                checked={editing.chosen.has(v.value)}
                onChange={(c) => {
                  const next = new Set(editing.chosen);
                  if (c) next.add(v.value);
                  else next.delete(v.value);
                  setEditing({ ...editing, chosen: next });
                }}
              />
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}

/** The gate register: goods in and out, returnable items followed until they are back. */
export function GateRecords({ meta, page, state, extraParams }: KitProps) {
  const { t, fmt } = useI18n();
  const columns: Column<Row>[] = [
    { id: 'number', header: t('inv.number'), sortKey: 'number', rowHeader: true, hideable: false, cell: (r) => s(r, 'number') },
    { id: 'when', header: t('ivd.date'), sortKey: 'created', hideBelow: 'sm', cell: (r) => fmt.date(s(r, 'createdAt').slice(0, 10), 'short') },
    { id: 'direction', header: t('ivd.direction'), cell: (r) => t(`ivd.dir.${s(r, 'direction') as 'in'}`) },
    { id: 'party', header: t('ivd.party'), sortKey: 'party', cell: (r) => s(r, 'party') },
    { id: 'description', header: t('ivd.what'), hideBelow: 'md', cell: (r) => `${s(r, 'description')} × ${n(r, 'qty')}` },
    { id: 'expected', header: t('ivd.expectedBack'), sortKey: 'expected', hideBelow: 'md', cell: (r) => (r.expectedReturnOn ? fmt.date(s(r, 'expectedReturnOn'), 'short') : '—') },
    { id: 'status', header: t('ops.f.status'), cell: (r) => <StatusPill tone={r.overdue ? 'danger' : statusTone(s(r, 'status'))}>{r.overdue ? t('ivd.overdue') : t(`ivd.gate.${s(r, 'status') as 'open'}`)}</StatusPill> },
  ];
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      extraParams={extraParams}
      label={t('ivd.gate')}
      columns={columns}
      empty={
        meta.can.create ? undefined : <EmptyState icon={<DoorOpen />} title={t('ivd.gateNone')}>
          {t('ivd.gateEmpty')}
        </EmptyState>
      }
    />
  );
}

/** Stock verifications (the annual audit): start one for a store, count it on its page. */
export function VerificationRecords({ meta, page, state, extraParams, stores }: KitProps & { stores: Option[] }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [open, dialog] = useDialog();
  const columns: Column<Row>[] = [
    { id: 'number', header: t('inv.number'), sortKey: 'number', rowHeader: true, hideable: false, cell: (r) => s(r, 'number') },
    { id: 'store', header: t('inv.store'), sortKey: 'store', cell: (r) => s(r, 'storeName') },
    { id: 'year', header: t('ivd.year'), hideBelow: 'sm', cell: (r) => s(r, 'fiscalYear') },
    { id: 'counted', header: t('ivd.counted'), align: 'right', cell: (r) => `${fmt.number(n(r, 'counted'))} / ${fmt.number(n(r, 'lines'))}` },
    { id: 'variance', header: t('ivd.withDifference'), align: 'right', hideBelow: 'sm', cell: (r) => fmt.number(n(r, 'variance')) },
    { id: 'status', header: t('ops.f.status'), cell: (r) => <StatusPill tone={statusTone(s(r, 'status'))}>{t(`ivd.vs.${s(r, 'status') as 'open'}`)}</StatusPill> },
  ];
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        extraParams={extraParams}
        label={t('ivd.verifications')}
        columns={columns}
        rowHref={(r) => `/inventory/verifications/${r.id}`}
        toolbar={
          <Button
            variant="outline"
            disabled={!stores.length}
            onClick={() =>
              open({
                title: t('ivd.startVerification'),
                fields: [
                  { name: 'storeId', label: t('inv.store'), kind: 'select', required: true, options: stores },
                  { name: 'note', label: t('ops.f.note') },
                ],
                run: async (v) => {
                  const r = await startVerification(v);
                  if (r.ok) router.push(`/inventory/verifications/${r.data.id}`);
                  return r;
                },
              })
            }
          >
            <ClipboardCheck /> {t('ivd.startVerification')}
          </Button>
        }
        empty={
          meta.can.create || stores.length ? undefined : <EmptyState icon={<PackageSearch />} title={t('ivd.verificationsNone')}>
            {t('ivd.verificationsEmpty')}
          </EmptyState>
        }
      />
      {dialog}
    </>
  );
}
