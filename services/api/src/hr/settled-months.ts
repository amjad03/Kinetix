import { and, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { separations } from '../db/schema.js';
import { monthEnd, monthStart } from './dates.js';

/** Staff whose full and final settlement paid a month's salary, so that month's regular payroll leaves them out. */
export async function settledFor(tx: Tx, month: string): Promise<Set<string>> {
  const rows = await tx
    .select({ userId: separations.userId, lines: separations.settlementLines })
    .from(separations)
    .where(and(inArray(separations.status, ['settled', 'relieved']), sql`${separations.lastWorkingDay} between ${monthStart(month)}::date and ${monthEnd(month)}::date`));
  return new Set(rows.filter((r) => r.lines?.some((l) => l.code === 'SALARY')).map((r) => r.userId));
}
