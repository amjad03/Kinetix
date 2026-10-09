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
  },
): Promise<void> {
  const { changes, ...rest } = entry;
  const data = changes && Object.keys(changes).length ? { ...(typeof entry.data === 'object' && entry.data !== null ? entry.data : entry.data === undefined ? {} : { value: entry.data }), changes } : (entry.data ?? null);
  await tx.insert(auditLog).values({ ...rest, data });
}

/** The fields that differ between two records, as `{ field: { before, after } }`. Only the named fields are compared when `fields` is given. */
export function changesOf(before: Record<string, unknown>, after: Record<string, unknown>, fields?: string[]): Record<string, { before: unknown; after: unknown }> {
  const out: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of fields ?? [...new Set([...Object.keys(before), ...Object.keys(after)])]) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) out[k] = { before: before[k] ?? null, after: after[k] ?? null };
  }
  return out;
}
