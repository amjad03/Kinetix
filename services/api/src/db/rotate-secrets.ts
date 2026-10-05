/**
 * Re-encrypts every stored secret (institutions' Razorpay key and webhook secrets) with the
 * current SECRETS_ENCRYPTION_KEY. Rotation: set the new key with a higher
 * SECRETS_ENCRYPTION_KEY_VERSION, keep the old one in SECRETS_ENCRYPTION_OLD_KEYS
 * ("1:<base64>"), deploy, run this, then remove the old key. Runs as the owner role
 * (DATABASE_URL) because it touches every institution. Safe to run again.
 *
 *   pnpm secrets:rotate        (Docker: `kinetix-api rotate-secrets`)
 */
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { SecretBox } from '../common/secret-box.js';
import { loadEnv } from '../config/env.js';
import * as s from './schema.js';

export async function rotateSecrets(db: NodePgDatabase<typeof s>, box: SecretBox): Promise<{ rows: number; rotated: number }> {
  const rows = await db.select().from(s.paymentGatewayAccounts);
  let rotated = 0;
  for (const r of rows) {
    if (!box.isStale(r.keySecretEnc) && !box.isStale(r.webhookSecretEnc)) continue;
    await db
      .update(s.paymentGatewayAccounts)
      .set({ keySecretEnc: box.rotate(r.keySecretEnc, `${r.tenantId}:razorpay.key_secret`), webhookSecretEnc: box.rotate(r.webhookSecretEnc, `${r.tenantId}:razorpay.webhook_secret`) })
      .where(eq(s.paymentGatewayAccounts.tenantId, r.tenantId));
    rotated++;
  }
  return { rows: rows.length, rotated };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = loadEnv();
  const box = SecretBox.fromEnv(env);
  if (!box) throw new Error('SECRETS_ENCRYPTION_KEY is not set');
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
  try {
    const r = await rotateSecrets(drizzle(pool, { schema: s }), box);
    console.log(`Secrets on key version ${box.currentVersion}: ${r.rotated} of ${r.rows} institutions re-encrypted.`);
  } finally {
    await pool.end();
  }
}
