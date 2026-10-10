import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { integrationSettings } from '../db/schema-integrations.js';

export const INTEGRATION_ADMIN = ['tenant_admin', 'principal'] as const;
export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const newSecret = () => randomBytes(24).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** One tenant's settings for an integration (base URLs, client ids, secrets). Missing values fall back to `env`. */
export async function getSetting(tx: Tx, tenantId: string, key: string, env: Record<string, string | undefined> = {}): Promise<Record<string, any>> {
  const [row] = await tx.select().from(integrationSettings).where(and(eq(integrationSettings.tenantId, tenantId), eq(integrationSettings.key, key)));
  return { ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== '')), ...(row?.value ?? {}) };
}

export async function putSetting(tx: Tx, tenantId: string, key: string, patch: Record<string, unknown>): Promise<Record<string, any>> {
  const [row] = await tx.select().from(integrationSettings).where(and(eq(integrationSettings.tenantId, tenantId), eq(integrationSettings.key, key)));
  const value: Record<string, any> = { ...(row?.value ?? {}) };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && v !== '') value[k] = v;
  if (row) await tx.update(integrationSettings).set({ value, updatedAt: new Date() }).where(eq(integrationSettings.id, row.id));
  else await tx.insert(integrationSettings).values({ tenantId, key, value });
  return value;
}

/** Settings as shown to an administrator: secrets are reported as set or not, never returned. */
export function maskSecrets(v: Record<string, any>, secretKeys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) if (!secretKeys.includes(k)) out[k] = val;
  for (const k of secretKeys) out[`${k}Set`] = !!v[k];
  return out;
}

/** fetch with a timeout; a failure comes back as `{ ok: false, error }` so callers can record it on the row. */
export async function call(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<{ ok: boolean; status: number; body: any; error?: string }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* plain text */
    }
    return { ok: res.ok, status: res.status, body, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, body: null, error: (e as Error).message };
  }
}
