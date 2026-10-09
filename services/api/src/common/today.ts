import type { Tx } from '../db/db.service.js';
import { tenants } from '../db/schema.js';
import { type Clock, localParts } from './time.js';

/** Today's date (YYYY-MM-DD) in the institution's time zone. */
export async function tenantToday(tx: Tx, clock: Clock): Promise<string> {
  const [t] = await tx.select({ timezone: tenants.timezone }).from(tenants);
  return localParts(clock.now(), t?.timezone ?? 'Asia/Kolkata').date;
}
