import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assets, inventory } from '../src/db/soundarya/campus.js';
import type { Ctx } from '../src/db/soundarya/ctx.js';
import { inventoryPass } from '../src/db/soundarya/inventory-pass.js';
import { makeKit } from '../src/db/soundarya/kit.js';
import { DEFAULT_CHART } from '../src/books/books.logic.js';
import { createTenant, ownerPool } from './helpers.js';

// The Soundarya stores and assets sample must load into the schema with the stock, its layers and the books agreeing.
describe('Soundarya inventory pass sample', () => {
  const owner = ownerPool();
  afterAll(() => owner.end());
  let t: Awaited<ReturnType<typeof createTenant>>;
  beforeAll(async () => {
    t = await createTenant(owner);
  });

  it('values the stock over layers and batches, and posts balanced vouchers', async () => {
    const q = (sql: string, p: unknown[] = []) => owner.query(sql, [t.tenantId, ...p]);
    const dept = async (name: string) => (await q(`insert into departments (tenant_id, name) values ($1, $2) returning id`, [name])).rows[0].id as string;
    const departments = { Commerce: await dept('Commerce'), 'Aviation Studies': await dept('Aviation Studies'), 'Computer Applications': await dept('Computer Applications') };
    for (const a of DEFAULT_CHART) await q('insert into acct_accounts (tenant_id, code, name, group_type, is_cash_bank) values ($1,$2,$3,$4,$5)', [a.code, a.name, a.groupType, a.isCashBank ?? false]);
    const me = { id: t.principal.id, name: 'Staff', email: 'x@x.in' };
    const ctx = {
      kit: makeKit(owner, t.tenantId),
      r: { int: (a: number) => a, pick: <T>(xs: T[]) => xs[0] },
      tenantId: t.tenantId,
      today: '2026-11-03',
      byEmail: new Proxy({}, { get: () => me }),
      departments,
      rooms: [{ id: t.room.id, name: 'Computer Lab 2' }],
    } as unknown as Ctx;
    await inventory(ctx);
    await assets(ctx);
    await inventoryPass(ctx);

    // Every stock row agrees with its layers, in quantity and in value.
    const off = (await q(`select s.id from inv_stock s left join (select store_id, item_id, sum(qty_left)::int as q, sum(qty_left::bigint * unit_cost_paise)::bigint as v from inv_stock_layers group by 1, 2) l on l.store_id = s.store_id and l.item_id = s.item_id where s.tenant_id = $1 and (coalesce(l.q, 0) <> s.qty or coalesce(l.v, 0) <> s.value_paise)`)).rows;
    expect(off).toEqual([]);
    // The mess store's stock: batches with one expired and one expiring.
    const mess = (await q(`select l.batch_no, l.expiry_on::text as e, l.qty_left from inv_stock_layers l join inv_stores s on s.id = l.store_id where l.tenant_id = $1 and s.kind = 'mess' and l.qty_left > 0 order by l.expiry_on`)).rows;
    expect(mess[0]).toMatchObject({ batch_no: 'MLK-2604', qty_left: 4 });
    expect(mess[0].e < '2026-11-03').toBe(true);
    // Every voucher balances; the IGST invoice is in the books and paid less the debit note.
    const unbalanced = (await q(`select v.number from acct_vouchers v join acct_voucher_lines l on l.voucher_id = v.id where v.tenant_id = $1 group by v.id having sum(l.debit_paise) <> sum(l.credit_paise)`)).rows;
    expect(unbalanced).toEqual([]);
    const inv = (await q(`select amount_paise, igst_paise, debit_paise, journal_voucher_id, payment_voucher_id from inv_invoices where tenant_id = $1 and invoice_no = 'MPM/26-27/1188'`)).rows[0];
    expect(Number(inv.amount_paise)).toBe(55_460_00);
    expect(Number(inv.igst_paise)).toBe(8_460_00);
    expect(Number(inv.debit_paise)).toBe(2_773_00);
    expect(inv.journal_voucher_id && inv.payment_voucher_id).toBeTruthy();
    // An MSME invoice past due, two write-offs, lab equipment in the register.
    expect(Number((await q(`select count(*)::int as n from inv_invoices i join inv_vendors v on v.id = i.vendor_id where i.tenant_id = $1 and v.msme_category = 'micro' and i.status <> 'paid' and i.due_on < '2026-11-03'`)).rows[0].n)).toBe(1);
    expect(Number((await q(`select count(*)::int as n from inv_write_offs where tenant_id = $1`)).rows[0].n)).toBe(2);
    expect(Number((await q(`select count(*)::int as n from assets where tenant_id = $1 and lab_equipment`)).rows[0].n)).toBeGreaterThanOrEqual(6);
    expect(Number((await q(`select count(*)::int as n from inv_items where tenant_id = $1 and hsn_code is null`)).rows[0].n)).toBe(0);
  });
});
