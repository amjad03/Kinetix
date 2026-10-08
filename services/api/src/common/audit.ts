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
  },
): Promise<void> {
  await tx.insert(auditLog).values({ ...entry, data: entry.data ?? null });
}
