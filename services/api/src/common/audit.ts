import type { Tx } from '../db/db.service.js';
import { auditLog } from '../db/schema.js';

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
