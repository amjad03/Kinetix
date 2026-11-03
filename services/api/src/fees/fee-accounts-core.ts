import { asc, eq, inArray } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { acctAccounts, feeInvoices } from '../db/schema.js';
import { feeHeads } from '../db/schema-fee-depth.js';
import { feeAccounts } from '../db/schema-fee-flagship.js';

/**
 * Fee accounts: the collecting entities of an institution (the trust, the college, the hostel). An invoice belongs to
 * one account (its structure's, else the account of its main head, else the default); the account numbers its
 * receipts in its own series, receives money in its own bank and cash ledgers, keeps its own books (a fund), takes
 * online payments through its own gateway credentials and shows its own UPI id on invoices and receipts.
 * An institution with no fee accounts behaves as one default account (the settings' series and ledgers).
 */

export type FeeAccount = typeof feeAccounts.$inferSelect;

export async function feeAccountsOf(tx: Tx): Promise<FeeAccount[]> {
  return tx.select().from(feeAccounts).orderBy(asc(feeAccounts.sortOrder), asc(feeAccounts.name));
}

export async function feeAccountById(tx: Tx, id: string | null | undefined): Promise<FeeAccount | null> {
  if (id) {
    const [a] = await tx.select().from(feeAccounts).where(eq(feeAccounts.id, id));
    if (a) return a;
  }
  const [d] = await tx.select().from(feeAccounts).where(eq(feeAccounts.isDefault, true));
  return d ?? null;
}

/** The account an invoice is collected into (its own, else the default; null when the institution has none). */
export async function accountOfInvoice(tx: Tx, invoiceId: string): Promise<FeeAccount | null> {
  const [inv] = await tx.select({ a: feeInvoices.feeAccountId }).from(feeInvoices).where(eq(feeInvoices.id, invoiceId));
  return feeAccountById(tx, inv?.a ?? null);
}

/** The account of a set of head codes: the first head (by allocation order) that names one. */
export async function accountForHeads(tx: Tx, codes: string[]): Promise<string | null> {
  if (!codes.length) return null;
  const heads = await tx.select({ code: feeHeads.code, a: feeHeads.feeAccountId, o: feeHeads.sortOrder }).from(feeHeads).where(inArray(feeHeads.code, [...new Set(codes)])).orderBy(asc(feeHeads.sortOrder));
  return heads.find((h) => h.a)?.a ?? null;
}

/** The cash or bank ledger code of an account, when it names one. */
export async function accountLedgerCode(tx: Tx, a: FeeAccount | null, method: string): Promise<string | null> {
  if (!a) return null;
  const id = method === 'cash' ? a.cashAccountId : method === 'credit' ? null : a.bankAccountId;
  if (!id) return null;
  const [row] = await tx.select({ code: acctAccounts.code }).from(acctAccounts).where(eq(acctAccounts.id, id));
  return row?.code ?? null;
}

/** "SET" for a receipt prefix "SET/{FY}/": the counter key of the account's series. */
export const seriesKey = (a: FeeAccount) => `acct:${a.code}`;
