import type { Tx } from '../db/db.service.js';
import { tenants } from '../db/schema.js';
import { Clock, localParts } from './time.js';

/** Today's date (`2026-10-20`) in the institution's time zone. */
export async function tenantToday(tx: Tx, clock: Clock): Promise<string> {
  const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
  return localParts(clock.now(), t?.tz ?? 'Asia/Kolkata').date;
}

/** The institution's current instant plus whole hours: SLA deadlines. */
export const addHours = (at: Date, hours: number) => new Date(at.getTime() + hours * 3_600_000);
