import { sql } from 'drizzle-orm';

/**
 * Today's date in the institution's time zone, as SQL. `current_date` is the database server's date (UTC on our
 * hosts), which is still yesterday from midnight to 05:30 IST: list filters such as "overdue", "in force today" or
 * "upcoming" then show the wrong rows. The tenants table shows a session only its own institution (RLS tenant_self).
 */
export const LOCAL_TODAY = sql.raw(`(now() at time zone coalesce((select t.timezone from tenants t limit 1), 'Asia/Kolkata'))::date`);
