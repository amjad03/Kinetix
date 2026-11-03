/**
 * Staff PAN and UAN at rest (migration 0198): AES-256-GCM under SECRETS_ENCRYPTION_KEY through common/sensitive.ts,
 * bound to the institution, the staff member and the field ("<tenantId>:staff.<userId>.pan"), so a value copied to
 * another row or institution does not decrypt. The last four characters stay in clear for lists and search.
 * Values written before encryption are read as they are and sealed on their next write, by `pnpm db:migrate`
 * and by `pnpm secrets:rotate` (db/rotate-secrets.ts).
 *
 * Payslips no longer copy PAN or UAN into their stored figures: statutory exports read them from the staff record.
 */
import { eq, inArray, isNotNull, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { SecretBox } from '../common/secret-box.js';
import { isSealed, reseal, seal, unseal } from '../common/sensitive.js';
import type { Tx } from '../db/db.service.js';
import { staffProfiles } from '../db/schema.js';

export type StaffIdField = 'pan' | 'uan';

export const staffIdAad = (tenantId: string, userId: string, field: StaffIdField) => `${tenantId}:staff.${userId}.${field}`;

/** The columns to write for a PAN or UAN (null clears it). */
export function sealStaffId(tenantId: string, userId: string, field: StaffIdField, value: string | null | undefined) {
  const v = value ? value.trim().toUpperCase() : null;
  const enc = v ? seal(staffIdAad(tenantId, userId, field), v) : null;
  const last4 = v ? v.slice(-4) : null;
  return field === 'pan' ? { panEnc: enc, panLast4: last4 } : { uanEnc: enc, uanLast4: last4 };
}

/** Both identifiers' columns, for an insert or update of a staff record. */
export const sealStaffIds = (tenantId: string, userId: string, v: { pan?: string | null; uan?: string | null }) => ({
  ...(v.pan !== undefined ? sealStaffId(tenantId, userId, 'pan', v.pan) : {}),
  ...(v.uan !== undefined ? sealStaffId(tenantId, userId, 'uan', v.uan) : {}),
});

/** The clear value of a stored identifier (a plain value from before encryption comes back as it is). */
export const openStaffId = (tenantId: string, userId: string, field: StaffIdField, stored: string | null | undefined): string | null =>
  stored ? unseal(staffIdAad(tenantId, userId, field), stored) : null;

/** PAN shown to people who do not file returns: the last four only. */
export const maskPan = (last4: string | null | undefined) => (last4 ? `XXXXXX${last4}` : null);

/** PAN and UAN of several staff members, decrypted (exports, Form 16, 24Q, NAAC lists). One query, no N+1. */
export async function staffIdsOf(tx: Tx, userIds: string[]): Promise<Map<string, { pan: string | null; uan: string | null }>> {
  const out = new Map<string, { pan: string | null; uan: string | null }>();
  if (!userIds.length) return out;
  const rows = await tx.select({ tenantId: staffProfiles.tenantId, userId: staffProfiles.userId, pan: staffProfiles.panEnc, uan: staffProfiles.uanEnc }).from(staffProfiles).where(inArray(staffProfiles.userId, [...new Set(userIds)]));
  for (const r of rows) out.set(r.userId, { pan: openStaffId(r.tenantId, r.userId, 'pan', r.pan), uan: openStaffId(r.tenantId, r.userId, 'uan', r.uan) });
  return out;
}

/**
 * Seals plain PAN/UAN values and moves sealed ones to the current key version, across every institution. Runs as the
 * owner role (after migrations and in the rotation job). Safe to run again. A value that does not decrypt (copied by
 * hand, or under a key no longer configured) is left as it is and counted.
 */
export async function resealStaffIds(db: NodePgDatabase<Record<string, unknown>> | Tx, box?: SecretBox): Promise<{ rows: number; rotated: number; failed: number }> {
  const rows = await db
    .select({ tenantId: staffProfiles.tenantId, userId: staffProfiles.userId, panEnc: staffProfiles.panEnc, uanEnc: staffProfiles.uanEnc, panLast4: staffProfiles.panLast4, uanLast4: staffProfiles.uanLast4 })
    .from(staffProfiles)
    .where(or(isNotNull(staffProfiles.panEnc), isNotNull(staffProfiles.uanEnc)));
  let rotated = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      const needs = (v: string | null) => !!v && (!isSealed(v) || (box ? box.isStale(v) : false));
      if (!needs(r.panEnc) && !needs(r.uanEnc) && (r.panEnc === null || r.panLast4) && (r.uanEnc === null || r.uanLast4)) continue;
      const panAad = staffIdAad(r.tenantId, r.userId, 'pan');
      const uanAad = staffIdAad(r.tenantId, r.userId, 'uan');
      const plainPan = r.panEnc && !isSealed(r.panEnc) ? r.panEnc : null;
      const plainUan = r.uanEnc && !isSealed(r.uanEnc) ? r.uanEnc : null;
      await db
        .update(staffProfiles)
        .set({
          panEnc: reseal(panAad, r.panEnc, box),
          uanEnc: reseal(uanAad, r.uanEnc, box),
          panLast4: r.panLast4 ?? (plainPan ? plainPan.slice(-4) : r.panLast4),
          uanLast4: r.uanLast4 ?? (plainUan ? plainUan.slice(-4) : r.uanLast4),
        })
        .where(eq(staffProfiles.userId, r.userId));
      rotated++;
    } catch {
      failed++;
    }
  }
  return { rows: rows.length, rotated, failed };
}
