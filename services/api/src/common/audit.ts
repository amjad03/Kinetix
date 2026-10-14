import type { Tx } from '../db/db.service.js';
import { auditLog } from '../db/schema.js';

/** An audit entry for a signed-in user's action: `auditUser(tx, p, 'drive.created', 'drive', id, { ... })`. */
export const auditUser = (tx: Tx, p: { tenantId: string; userId: string }, action: string, subjectType: string, subjectId?: string, data?: unknown) =>
  audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action, subjectType, subjectId, data });

export async function audit(
  tx: Tx,
  entry: {
    tenantId: string;
    actorType: 'user' | 'device' | 'system';
    actorId?: string;
    action: string;
    subjectType?: string;
    subjectId?: string;
    data?: unknown;
    /** What this action changed, field by field (see {@link changesOf}); stored as `data.changes` so the audit viewer can show before and after. */
    changes?: Record<string, { before: unknown; after: unknown }>;
    /**
     * The record before and after the action: the fields that differ are stored as `changes`, the same as
     * passing `changes: changesOf(before, after, fields)`. A create passes only `after`, a delete only `before`.
     */
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    /** Only these fields of `before`/`after` are compared (leave out secrets and noise such as updated_at). */
    fields?: string[];
  },
): Promise<void> {
  const { before, after, fields, ...withChanges } = entry;
  const derived = before !== undefined || after !== undefined ? changesOf(before ?? {}, after ?? {}, fields ?? fieldsOf(before, after)) : undefined;
  const { changes = derived, ...rest } = withChanges;
  const data = changes && Object.keys(changes).length ? { ...(typeof entry.data === 'object' && entry.data !== null ? entry.data : entry.data === undefined ? {} : { value: entry.data }), changes } : (entry.data ?? null);
  await tx.insert(auditLog).values({ ...rest, data });
}

/** Fields compared by default: everything but bookkeeping columns. */
const NOISE = new Set(['updatedAt', 'updated_at', 'createdAt', 'created_at', 'tenantId', 'tenant_id', 'version', 'passwordHash', 'password_hash']);
function fieldsOf(before?: Record<string, unknown> | null, after?: Record<string, unknown> | null): string[] {
  return [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((k) => !NOISE.has(k) && !k.startsWith('_'));
}

/** The fields that differ between two records, as `{ field: { before, after } }`. Only the named fields are compared when `fields` is given. */
export function changesOf(before: Record<string, unknown>, after: Record<string, unknown>, fields?: string[]): Record<string, { before: unknown; after: unknown }> {
  const out: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of fields ?? [...new Set([...Object.keys(before), ...Object.keys(after)])]) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) out[k] = { before: before[k] ?? null, after: after[k] ?? null };
  }
  return out;
}
