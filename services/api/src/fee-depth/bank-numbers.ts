import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { SecretBox } from '../common/secret-box.js';
import { isSealed, sensitiveBox } from '../common/sensitive.js';

/**
 * Bank account numbers in the fee and accounts desk (a cash/bank ledger's account, the account printed on a bank challan)
 * are kept encrypted: `••••1234|<sealed>`, the last four for lists and the full number under SECRETS_ENCRYPTION_KEY
 * (common/sensitive.ts, rotated by `pnpm secrets:rotate`), bound to the institution, the row and the field, so a value
 * copied elsewhere does not decrypt. Numbers stored before this are read as they are and sealed on their next write or by
 * the rotation job.
 */
export type BankNumberKind = 'acct_account' | 'fee_challan';

const MASK = '••••';
export const bankNumberAad = (tenantId: string, kind: BankNumberKind, id: string) => `${tenantId}:${kind}.${id}.bank_account_no`;

/** What lists show: the last four digits. */
export const maskedNumber = (plain: string) => `${MASK}${plain.slice(-4)}`;
/** A value the ERP sent back unchanged from a list or form (the masked form), not a new number. */
export const isMaskedNumber = (v: string) => v.startsWith(MASK);

/** Whether a stored value is in the encrypted form. */
export const isSealedNumber = (stored: string) => {
  const i = stored.indexOf('|');
  return i > 0 && stored.startsWith(MASK) && isSealed(stored.slice(i + 1));
};

/** The stored form of a number; empty stays empty. */
export function sealNumber(tenantId: string, kind: BankNumberKind, id: string, plain: string | null, box: SecretBox = sensitiveBox()): string | null {
  if (plain === null) return null;
  const v = plain.trim();
  if (!v) return '';
  if (isSealedNumber(v)) return v;
  return `${maskedNumber(v)}|${box.encrypt(v, bankNumberAad(tenantId, kind, id))}`;
}

/** The full number, for a challan or a bank reconciliation; numbers from before encryption come back as they are. */
export function openNumber(tenantId: string, kind: BankNumberKind, id: string, stored: string | null, box: SecretBox = sensitiveBox()): string | null {
  if (!stored || !isSealedNumber(stored)) return stored;
  try {
    return box.decrypt(stored.slice(stored.indexOf('|') + 1), bankNumberAad(tenantId, kind, id));
  } catch {
    return '[cannot be decrypted]';
  }
}

/** The stored value under the current key (plain values are sealed). Used by `pnpm secrets:rotate`. */
export function resealNumber(tenantId: string, kind: BankNumberKind, id: string, stored: string | null, box: SecretBox): string | null {
  if (!stored) return stored;
  if (!isSealedNumber(stored)) return sealNumber(tenantId, kind, id, stored, box);
  const blob = stored.slice(stored.indexOf('|') + 1);
  return box.isStale(blob) ? `${stored.slice(0, stored.indexOf('|'))}|${box.rotate(blob, bankNumberAad(tenantId, kind, id))}` : stored;
}

/** The masked form of a stored value (sealed or from before encryption). */
export const maskOf = (stored: string | null): string | null => (!stored ? stored : isSealedNumber(stored) ? stored.slice(0, stored.indexOf('|')) : maskedNumber(stored));

/** The masked number in SQL for a list (sealed or not, only the last four leave the database). */
export const maskedSql = (col: AnyPgColumn): SQL<string | null> =>
  sql<string | null>`case when ${col} is null or ${col} = '' then ${col} when position('|' in ${col}) > 0 then split_part(${col}, '|', 1) else ${MASK} || right(${col}, 4) end`;
