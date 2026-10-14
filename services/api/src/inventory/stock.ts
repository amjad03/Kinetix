import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { readSettings } from '../campus-ops/settings.js';
import type { UserPrincipal } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { invItems, invStock, invStockMoves, invStores } from '../db/schema.js';
import { invCategories } from '../db/schema-procurement.js';

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
}

/** Changes stock under a row lock and writes the ledger row; stock never goes below zero (unless the settings allow it). */
export async function applyStockMove(tx: Tx, p: Pick<UserPrincipal, 'tenantId' | 'userId'>, m: StockMove) {
  const [store] = await tx.select({ id: invStores.id }).from(invStores).where(eq(invStores.id, m.storeId));
  const [item] = await tx.select({ id: invItems.id, name: invItems.name }).from(invItems).where(eq(invItems.id, m.itemId));
  if (!store || !item) throw new NotFoundException('Store or item not found');
  await tx.insert(invStock).values({ tenantId: p.tenantId, storeId: m.storeId, itemId: m.itemId }).onConflictDoNothing();
  const [row] = await tx.select().from(invStock).where(and(eq(invStock.storeId, m.storeId), eq(invStock.itemId, m.itemId))).for('update');
  if (row.qty + m.delta < 0 && !(await readSettings(tx, p.tenantId, 'inventory')).rules.allowNegativeStock) throw new ConflictException(`Only ${row.qty} of ${item.name} in this store`);
  await tx.update(invStock).set({ qty: row.qty + m.delta }).where(eq(invStock.id, row.id));
  const [mv] = await tx
    .insert(invStockMoves)
    .values({ tenantId: p.tenantId, storeId: m.storeId, itemId: m.itemId, delta: m.delta, kind: m.kind, refType: m.refType, refId: m.refId, issuedTo: m.issuedTo, departmentId: m.departmentId ?? null, note: m.note, createdBy: p.userId })
    .returning();
  await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `inventory.stock_${m.kind}`, subjectType: 'inv_item', subjectId: m.itemId, data: { storeId: m.storeId, delta: m.delta } });
  return { ...mv, qtyAfter: row.qty + m.delta };
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
