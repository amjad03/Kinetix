/**
 * Re-encrypts every value kept under SECRETS_ENCRYPTION_KEY with the current key: institutions' and fee accounts' payment gateway secrets,
 * connector settings, SSO client secrets, offline pairing signing keys, staff two-factor secrets, staff Aadhaar, bank
 * accounts, PAN and UAN (hr/staff-ids.ts), and the encrypted health and counselling fields (common/sensitive.ts; plain values from before encryption are
 * sealed on the way). Rotation: set the new key with a higher SECRETS_ENCRYPTION_KEY_VERSION, keep the old one in
 * SECRETS_ENCRYPTION_OLD_KEYS ("1:<base64>"), deploy, run this, then remove the old key. Runs as the owner role
 * (DATABASE_URL) because it touches every institution. Safe to run again.
 *
 *   pnpm secrets:rotate        (Docker: `zynetix-api rotate-secrets`)
 */
import { eq, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { SecretBox } from '../common/secret-box.js';
import { isSealed, reseal, sensitiveAad } from '../common/sensitive.js';
import { loadEnv } from '../config/env.js';
import * as s from './schema.js';
import { gatewayAad } from '../fees/payment-gateway.service.js';
import { tenantSigningKeys } from './schema-assist.js';
import { userMfa } from './schema-foundation.js';
import { feeChallans } from './schema-fee-depth.js';
import { resealNumber } from '../fee-depth/bank-numbers.js';
import { resealStaffIds } from '../hr/staff-ids.js';
import { debitAccountAad } from '../hr/bank-files.js';
import { taxDeclarations } from './schema-hr3.js';
import { landlordAad } from '../hr/tax-declarations.service.js';

type Db = NodePgDatabase<typeof s>;

/** Payment gateway secrets (the original scope of this job). */
export async function rotateSecrets(db: Db, box: SecretBox): Promise<{ rows: number; rotated: number }> {
  const rows = await db.select().from(s.paymentGatewayAccounts);
  let rotated = 0;
  for (const r of rows) {
    if (!box.isStale(r.keySecretEnc) && !box.isStale(r.webhookSecretEnc)) continue;
    await db
      .update(s.paymentGatewayAccounts)
      .set({ keySecretEnc: box.rotate(r.keySecretEnc, gatewayAad(r.tenantId, r.feeAccountId, 'key_secret')), webhookSecretEnc: r.webhookSecretEnc ? box.rotate(r.webhookSecretEnc, gatewayAad(r.tenantId, r.feeAccountId, 'webhook_secret')) : r.webhookSecretEnc })
      .where(eq(s.paymentGatewayAccounts.id, r.id));
    rotated++;
  }
  return { rows: rows.length, rotated };
}

/** Every other encrypted column, table by table: rows looked at and rows rewritten. */
export async function rotateAll(db: Db, box: SecretBox): Promise<Record<string, { rows: number; rotated: number; failed: number }>> {
  const out: Record<string, { rows: number; rotated: number; failed: number }> = { payment_gateway_accounts: { ...(await rotateSecrets(db, box)), failed: 0 } };
  const count = (key: string, changed: boolean) => {
    out[key] ??= { rows: 0, rotated: 0, failed: 0 };
    out[key].rows++;
    if (changed) out[key].rotated++;
  };
  /** One row: a value that does not decrypt (moved by hand, or under a key no longer configured) is left as it is and counted. */
  const row = async (key: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch {
      out[key] ??= { rows: 0, rotated: 0, failed: 0 };
      out[key].rows++;
      out[key].failed++;
    }
  };
  const rot = (blob: string | null, aad: string) => (blob && box.isStale(blob) ? box.rotate(blob, aad) : blob);

  for (const r of await db.select().from(s.connectors)) {
    await row('connectors', async () => {
      const next = rot(r.configEnc, `${r.tenantId}:connector.${r.id}`)!;
      count('connectors', next !== r.configEnc);
      if (next !== r.configEnc) await db.update(s.connectors).set({ configEnc: next }).where(eq(s.connectors.id, r.id));
    });
  }
  for (const r of await db.select().from(s.ssoProviders)) {
    await row('sso_providers', async () => {
      const next = rot(r.clientSecretEnc, `${r.tenantId}:sso.client_secret`)!;
      count('sso_providers', next !== r.clientSecretEnc);
      if (next !== r.clientSecretEnc) await db.update(s.ssoProviders).set({ clientSecretEnc: next }).where(eq(s.ssoProviders.id, r.id));
    });
  }
  for (const r of await db.select().from(tenantSigningKeys)) {
    await row('tenant_signing_keys', async () => {
      const next = rot(r.privateKeyEnc, `${r.tenantId}:pairing.signing_key`)!;
      count('tenant_signing_keys', next !== r.privateKeyEnc);
      if (next !== r.privateKeyEnc) await db.update(tenantSigningKeys).set({ privateKeyEnc: next }).where(eq(tenantSigningKeys.tenantId, r.tenantId));
    });
  }
  for (const r of await db.select().from(userMfa)) {
    await row('user_mfa', async () => {
      const next = rot(r.secretEnc, `${r.tenantId}:mfa.${r.userId}`)!;
      count('user_mfa', next !== r.secretEnc);
      if (next !== r.secretEnc) await db.update(userMfa).set({ secretEnc: next }).where(eq(userMfa.userId, r.userId));
    });
  }
  for (const r of await db.select({ tenantId: s.staffProfiles.tenantId, userId: s.staffProfiles.userId, aadhaarEnc: s.staffProfiles.aadhaarEnc, bankAccountEnc: s.staffProfiles.bankAccountEnc }).from(s.staffProfiles).where(sql`${s.staffProfiles.aadhaarEnc} is not null or ${s.staffProfiles.bankAccountEnc} is not null`)) {
    await row('staff_profiles', async () => {
      const aadhaarEnc = rot(r.aadhaarEnc, `${r.tenantId}:staff.${r.userId}.aadhaar`);
      const bankAccountEnc = rot(r.bankAccountEnc, `${r.tenantId}:staff.${r.userId}.bank_account`);
      const changed = aadhaarEnc !== r.aadhaarEnc || bankAccountEnc !== r.bankAccountEnc;
      count('staff_profiles', changed);
      if (changed) await db.update(s.staffProfiles).set({ aadhaarEnc, bankAccountEnc }).where(eq(s.staffProfiles.userId, r.userId));
    });
  }

  // Staff PAN and UAN (hr/staff-ids.ts): plain values from before migration 0198 are sealed on the way.
  out.staff_identifiers = await resealStaffIds(db, box);
  // The institution's salary debit account (hr/bank-files.ts) and landlords' PANs on investment declarations.
  for (const r of await db.select({ tenantId: s.payrollSettings.tenantId, b: s.payrollSettings.bankFile }).from(s.payrollSettings)) {
    if (!r.b?.debitAccountEnc) continue;
    await row('payroll_settings', async () => {
      const next = reseal(debitAccountAad(r.tenantId), r.b.debitAccountEnc, box);
      count('payroll_settings', next !== r.b.debitAccountEnc);
      if (next !== r.b.debitAccountEnc) await db.update(s.payrollSettings).set({ bankFile: { ...r.b, debitAccountEnc: next } }).where(eq(s.payrollSettings.tenantId, r.tenantId));
    });
  }
  for (const r of await db.select({ id: taxDeclarations.id, tenantId: taxDeclarations.tenantId, enc: taxDeclarations.landlordPanEnc }).from(taxDeclarations).where(sql`${taxDeclarations.landlordPanEnc} is not null`)) {
    await row('tax_declarations', async () => {
      const next = reseal(landlordAad(r.tenantId, r.id), r.enc, box);
      count('tax_declarations', next !== r.enc);
      if (next !== r.enc) await db.update(taxDeclarations).set({ landlordPanEnc: next }).where(eq(taxDeclarations.id, r.id));
    });
  }

  // Bank account numbers of the fee and accounts desk (fee-depth/bank-numbers.ts): plain ones are sealed on the way.
  for (const r of await db.select({ id: s.acctAccounts.id, tenantId: s.acctAccounts.tenantId, accountNo: s.acctAccounts.accountNo }).from(s.acctAccounts).where(sql`${s.acctAccounts.accountNo} is not null and ${s.acctAccounts.accountNo} <> ''`)) {
    await row('acct_accounts', async () => {
      const next = resealNumber(r.tenantId, 'acct_account', r.id, r.accountNo, box);
      count('acct_accounts', next !== r.accountNo);
      if (next !== r.accountNo) await db.update(s.acctAccounts).set({ accountNo: next }).where(eq(s.acctAccounts.id, r.id));
    });
  }
  for (const r of await db.select({ id: feeChallans.id, tenantId: feeChallans.tenantId, bankAccount: feeChallans.bankAccount }).from(feeChallans).where(sql`${feeChallans.bankAccount} <> ''`)) {
    await row('fee_challans', async () => {
      const next = resealNumber(r.tenantId, 'fee_challan', r.id, r.bankAccount, box) ?? '';
      count('fee_challans', next !== r.bankAccount);
      if (next !== r.bankAccount) await db.update(feeChallans).set({ bankAccount: next }).where(eq(feeChallans.id, r.id));
    });
  }

  // Health and counselling: sealed values move to the current key, plain ones from before encryption are sealed.
  const needs = (v: string | null) => !!v && (!isSealed(v) || box.isStale(v));
  for (const r of await db.select().from(s.healthProfiles)) {
    await row('health_profiles', async () => {
      const a = (f: string) => sensitiveAad(r.tenantId, 'health', r.studentId, f);
      const list = (f: 'allergies' | 'conditions' | 'medications') => r[f].map((x, i) => reseal(`${a(f)}.${i}`, x, box)!);
      const changed = [...r.allergies, ...r.conditions, ...r.medications, r.notes].some(needs);
      count('health_profiles', changed);
      if (changed) await db.update(s.healthProfiles).set({ allergies: list('allergies'), conditions: list('conditions'), medications: list('medications'), notes: reseal(a('notes'), r.notes, box)! }).where(eq(s.healthProfiles.id, r.id));
    });
  }
  for (const r of await db.select({ id: s.healthVisits.id, tenantId: s.healthVisits.tenantId, studentId: s.healthVisits.studentId, complaint: s.healthVisits.complaint, action: s.healthVisits.action }).from(s.healthVisits)) {
    await row('health_visits', async () => {
      // '[removed]' is the retention job's marker, not data.
      const changed = (r.complaint !== '[removed]' && needs(r.complaint)) || needs(r.action);
      count('health_visits', changed);
      if (changed)
        await db
          .update(s.healthVisits)
          .set({ complaint: r.complaint === '[removed]' ? r.complaint : reseal(sensitiveAad(r.tenantId, 'health_visit', r.studentId, 'complaint'), r.complaint, box)!, action: reseal(sensitiveAad(r.tenantId, 'health_visit', r.studentId, 'action'), r.action, box)! })
          .where(eq(s.healthVisits.id, r.id));
    });
  }
  for (const r of await db.select({ id: s.counsellingSessions.id, tenantId: s.counsellingSessions.tenantId, studentId: s.counsellingSessions.studentId, notes: s.counsellingSessions.confidentialNotes }).from(s.counsellingSessions).where(sql`${s.counsellingSessions.confidentialNotes} is not null`)) {
    await row('counselling_sessions', async () => {
      const changed = needs(r.notes);
      count('counselling_sessions', changed);
      if (changed) await db.update(s.counsellingSessions).set({ confidentialNotes: reseal(sensitiveAad(r.tenantId, 'counselling', r.studentId, 'notes'), r.notes, box) }).where(eq(s.counsellingSessions.id, r.id));
    });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = loadEnv();
  const box = SecretBox.fromEnv(env);
  if (!box) throw new Error('SECRETS_ENCRYPTION_KEY is not set');
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
  try {
    const r = await rotateAll(drizzle(pool, { schema: s }), box);
    for (const [table, n] of Object.entries(r)) console.log(`${table}: ${n.rotated} of ${n.rows} rows re-encrypted with key version ${box.currentVersion}${n.failed ? `; ${n.failed} could not be decrypted (left as they are)` : ''}.`);
  } finally {
    await pool.end();
  }
}
