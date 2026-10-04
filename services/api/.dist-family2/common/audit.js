import { auditLog } from '../db/schema.js';
export async function audit(tx, entry) {
    await tx.insert(auditLog).values({ ...entry, data: entry.data ?? null });
}
//# sourceMappingURL=audit.js.map