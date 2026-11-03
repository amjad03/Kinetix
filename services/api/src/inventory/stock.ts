import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { readSettings } from '../campus-ops/settings.js';
import type { UserPrincipal } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { invItems, invStock, invStockMoves, invStores } from '../db/schema.js';
import { invCategories, invStockLayers } from '../db/schema-procurement.js';
import { domainEvents } from '../db/schema-foundation.js';
import { DomainEvents } from '../events/events.js';
import { drawLayers, issueCost, type Draw, type Valuation } from './stores.logic.js';

/** A batch coming in: its number, dates, quantity and unit cost (a transfer carries the batches it took out). */
export interface InLayer {
  batchNo?: string | null;
  mfgOn?: string | null;
  expiryOn?: string | null;
  qty: number;
  unitCostPaise: number;
}

export interface StockMove {
  storeId: string;
  itemId: string;
  delta: number;
  kind: string;
  qty: number;
  note: string;
  issuedTo?: string;
  departmentId?: string | null;
  refType?: string;
  refId?: string;
  /** Stock in: the unit cost (else the store's average cost, else the last purchase price) and the batch. */
  unitCostPaise?: number | null;
  batchNo?: string | null;
  mfgOn?: string | null;
  expiryOn?: string | null;
  /** Stock in as these batches (a transfer in); the quantities add up to `delta`. */
  layers?: InLayer[];
  /** Stock out: from this batch only; `includeExpired` lets a write-off take expired stock. */
  fromBatch?: string | null;
  includeExpired?: boolean;
  /** The day of the move in the institution's time zone (layers are dated by it; expiry is checked against it). */
  today: string;
}

export interface MoveResult {
  id: string;
  qtyAfter: number;
  valuePaise: number;
  unitCostPaise: number;
  /** For stock out: the batches drawn, at their cost, so a transfer can carry them into the other store. */
  draws: Draw[];
  [k: string]: unknown;
}

/**
 * Changes stock under a row lock and writes the ledger row with its cost. Stock in adds a cost layer (a batch, for a
 * batch-tracked item); stock out draws the earliest-expiring unexpired layers and is valued by the item's method
 * (FIFO: the layers' cost; weighted average: the store's average cost). Stock never goes below zero unless the
 * settings allow it. When the item falls to its reorder level an `inventory.reorder_level_reached` event is written.
 */
export async function applyStockMove(tx: Tx, p: Pick<UserPrincipal, 'tenantId' | 'userId'>, m: StockMove): Promise<MoveResult> {
  const [store] = await tx.select({ id: invStores.id, active: invStores.active }).from(invStores).where(eq(invStores.id, m.storeId));
  const [item] = await tx.select().from(invItems).where(eq(invItems.id, m.itemId));
  if (!store || !item) throw new NotFoundException('Store or item not found');
  if (m.delta === 0) throw new BadRequestException('Nothing to move');
  await tx.insert(invStock).values({ tenantId: p.tenantId, storeId: m.storeId, itemId: m.itemId }).onConflictDoNothing();
  const [row] = await tx.select().from(invStock).where(and(eq(invStock.storeId, m.storeId), eq(invStock.itemId, m.itemId))).for('update');
  const before = await onHandAll(tx, m.itemId);
  let value = 0;
  let draws: Draw[] = [];
  let batchLabel: string | null = null;
  let expiryOn: string | null = null;
  if (m.delta > 0) {
    const avg = row.qty > 0 ? Math.round(row.valuePaise / row.qty) : null;
    const layers: InLayer[] = m.layers?.length ? m.layers : [{ batchNo: m.batchNo, mfgOn: m.mfgOn, expiryOn: m.expiryOn, qty: m.delta, unitCostPaise: m.unitCostPaise ?? avg ?? item.lastPricePaise }];
    if (layers.reduce((s, l) => s + l.qty, 0) !== m.delta) throw new BadRequestException('The batches do not add up to the quantity');
    if (item.batchTracked && layers.some((l) => !l.batchNo?.trim())) throw new BadRequestException(`${item.name} is kept by batch: give the batch number`);
    for (const l of layers) if (l.expiryOn && l.mfgOn && l.expiryOn < l.mfgOn) throw new BadRequestException('A batch expires before it was made');
    value = layers.reduce((s, l) => s + l.qty * l.unitCostPaise, 0);
    batchLabel = joinBatches(layers.map((l) => l.batchNo ?? ''));
    expiryOn = layers.length === 1 ? (layers[0].expiryOn ?? null) : null;
    const [mv] = await insertMove(tx, p, m, value, batchLabel, expiryOn);
    await tx.insert(invStockLayers).values(layers.map((l) => ({ tenantId: p.tenantId, storeId: m.storeId, itemId: m.itemId, batchNo: l.batchNo?.trim() ?? '', mfgOn: l.mfgOn ?? null, expiryOn: l.expiryOn ?? null, receivedOn: m.today, qtyIn: l.qty, qtyLeft: l.qty, unitCostPaise: l.unitCostPaise, sourceMoveId: mv.id })));
    await tx.update(invStock).set({ qty: row.qty + m.delta, valuePaise: row.valuePaise + value }).where(eq(invStock.id, row.id));
    await auditMove(tx, p, m, value);
    return { ...mv, qtyAfter: row.qty + m.delta, valuePaise: value, unitCostPaise: Math.round(value / m.delta), draws: [] };
  }
  const need = -m.delta;
  const open = await tx
    .select()
    .from(invStockLayers)
    .where(and(eq(invStockLayers.storeId, m.storeId), eq(invStockLayers.itemId, m.itemId), gt(invStockLayers.qtyLeft, 0)))
    .for('update');
  const got = drawLayers(open.map((l) => ({ id: l.id, batchNo: l.batchNo, expiryOn: l.expiryOn, receivedOn: l.receivedOn, qtyLeft: l.qtyLeft, unitCostPaise: l.unitCostPaise })), need, { today: m.today, includeExpired: m.includeExpired, batchNo: m.fromBatch });
  draws = got.draws;
  if (got.short > 0) {
    const allowNegative = !!(await readSettings(tx, p.tenantId, 'inventory')).rules.allowNegativeStock;
    const expired = open.filter((l) => l.expiryOn && l.expiryOn < m.today && (!m.fromBatch || l.batchNo === m.fromBatch)).reduce((s, l) => s + l.qtyLeft, 0);
    const usable = need - got.short;
    if (!allowNegative || m.fromBatch || m.includeExpired) {
      const what = m.fromBatch ? `${item.name} (batch ${m.fromBatch})` : item.name;
      throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'STOCK_SHORT', message: `Only ${usable} of ${what} can be taken from this store${expired && !m.includeExpired ? `; ${expired} more have expired and must be written off` : ''}`, available: usable, expired });
    }
  }
  const method = (item.valuation as Valuation) ?? 'weighted_average';
  const drawnQty = need - got.short;
  value = drawnQty > 0 ? issueCost(method, draws, { qty: row.qty, valuePaise: row.valuePaise }) : 0;
  // Beyond the layers (negative stock allowed): at the last purchase price.
  if (got.short > 0) value += got.short * item.lastPricePaise;
  for (const d of draws) await tx.update(invStockLayers).set({ qtyLeft: sql`${invStockLayers.qtyLeft} - ${d.qty}` }).where(eq(invStockLayers.id, d.layerId));
  batchLabel = joinBatches(draws.map((d) => d.batchNo));
  expiryOn = draws.length === 1 ? draws[0].expiryOn : null;
  const [mv] = await insertMove(tx, p, m, -value, batchLabel, expiryOn);
  await tx.update(invStock).set({ qty: row.qty + m.delta, valuePaise: row.valuePaise - value }).where(eq(invStock.id, row.id));
  await auditMove(tx, p, m, -value);
  const after = before + m.delta;
  if (item.active && item.reorderLevel > 0 && before > item.reorderLevel && after <= item.reorderLevel && (await readSettings(tx, p.tenantId, 'inventory')).rules.reorderAlerts !== false) {
    // Written like EventBus.emit (the outbox row in this transaction); the alerts consumer tells the store.
    await tx.insert(domainEvents).values({ tenantId: p.tenantId, type: DomainEvents.StockReorderLevel, aggregateType: 'inv_item', aggregateId: item.id, payload: { itemId: item.id, sku: item.sku, name: item.name, unit: item.unit, onHand: after, reorderLevel: item.reorderLevel, reorderQty: item.reorderQty }, actorId: p.userId });
  }
  return { ...mv, qtyAfter: row.qty + m.delta, valuePaise: value, unitCostPaise: Math.round(value / need), draws };
}

const joinBatches = (xs: string[]) => {
  const u = [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  return u.length ? u.join(', ').slice(0, 200) : null;
};

function insertMove(tx: Tx, p: Pick<UserPrincipal, 'tenantId' | 'userId'>, m: StockMove, valuePaise: number, batchNo: string | null, expiryOn: string | null) {
  const qty = Math.abs(m.delta);
  return tx
    .insert(invStockMoves)
    .values({ tenantId: p.tenantId, storeId: m.storeId, itemId: m.itemId, delta: m.delta, kind: m.kind, refType: m.refType, refId: m.refId, issuedTo: m.issuedTo, departmentId: m.departmentId ?? null, note: m.note, createdBy: p.userId, unitCostPaise: Math.round(Math.abs(valuePaise) / qty), valuePaise, batchNo, expiryOn })
    .returning();
}

function auditMove(tx: Tx, p: Pick<UserPrincipal, 'tenantId' | 'userId'>, m: StockMove, valuePaise: number) {
  return audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `inventory.stock_${m.kind}`, subjectType: 'inv_item', subjectId: m.itemId, data: { storeId: m.storeId, delta: m.delta, valuePaise } });
}

/** An item's quantity across every store. */
export async function onHandAll(tx: Tx, itemId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`coalesce(sum(${invStock.qty}), 0)::int` }).from(invStock).where(eq(invStock.itemId, itemId));
  return r?.n ?? 0;
}

/** Every item named is active. */
export async function assertActiveItems(tx: Tx, ids: string[]) {
  const uniq = [...new Set(ids)];
  const found = await tx.select({ id: invItems.id }).from(invItems).where(and(inArray(invItems.id, uniq), eq(invItems.active, true)));
  if (found.length !== uniq.length) throw new BadRequestException('An item was not found');
}

/** Makes sure a category of this name exists (items carry the category's name), matching case-insensitively. */
export async function ensureCategory(tx: Tx, tenantId: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  const [hit] = await tx.select({ id: invCategories.id }).from(invCategories).where(sql`lower(${invCategories.name}) = ${clean.toLowerCase()}`);
  if (!hit) await tx.insert(invCategories).values({ tenantId, name: clean }).onConflictDoNothing();
}
