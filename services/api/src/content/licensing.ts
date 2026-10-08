import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

export type LicensedType = 'course' | 'topic' | 'concept_video';

/**
 * SQL condition: the global library item `idCol` may be shown to the institution of the current
 * transaction. A licence (content_licenses) hides it once it has expired, or when it names allowed
 * institutions and this one is not among them. No licence row = unrestricted. Use in any `where`
 * on a listing: `licenceAllows('course', courses.id)`.
 */
export function licenceAllows(type: LicensedType, idCol: PgColumn | SQL): SQL {
  return sql`not exists (
    select 1 from content_licenses l
    where l.content_type = ${type} and l.content_id = ${idCol}
      and ((l.expires_on is not null and l.expires_on < current_date)
        or (cardinality(l.allowed_tenants) > 0 and not (nullif(current_setting('app.tenant_id', true), '')::uuid = any (l.allowed_tenants)))))`;
}

/** A topic is shown only when it and its course are both licensed to the institution. */
export const topicLicensed = (topicIdCol: PgColumn | SQL, courseIdCol: PgColumn | SQL): SQL => sql`${licenceAllows('topic', topicIdCol)} and ${licenceAllows('course', courseIdCol)}`;
