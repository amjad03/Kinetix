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

/**
 * SQL condition: the global curriculum `codeCol` (curricula.code / courses.curriculum_code) fits the
 * institution of the current transaction, so a school is not shown MBA/MCA courses and a college is
 * not shown Class 7 science. In order:
 * 1. programmes that name a curriculum (programs.curriculum_code) decide it outright;
 * 2. otherwise the institution's programme levels (k12 / ug / pg…), or, with no programmes yet, its
 *    kind (school → k12, college → ug + pg);
 * 3. a school whose profile names its board (CBSE, ICSE/CISCE, Karnataka State) sees that board's
 *    courses plus early years, not the other boards'.
 * Reads only rows the tenant can see (RLS), so it must run inside `withTenant`.
 */
export function curriculumFits(codeCol: PgColumn | SQL): SQL {
  return sql`(
    ${codeCol} in (select p.curriculum_code from programs p where p.curriculum_code is not null)
    or (
      not exists (select 1 from programs p where p.curriculum_code is not null)
      and exists (
        select 1 from curricula c, (select t.kind::text as kind,
            case
              when concat_ws(' ', t.settings->'profile'->>'affiliation', t.settings->'profile'->>'scheme', t.settings->>'board') ~* 'cbse' then 'cbse'
              when concat_ws(' ', t.settings->'profile'->>'affiliation', t.settings->'profile'->>'scheme', t.settings->>'board') ~* '(icse|cisce)' then 'icse'
              when concat_ws(' ', t.settings->'profile'->>'affiliation', t.settings->'profile'->>'scheme', t.settings->>'board') ~* '(karnataka|state board|sslc)' then 'ka-state'
            end as board
          from tenants t where t.id = nullif(current_setting('app.tenant_id', true), '')::uuid) me
        where c.code = ${codeCol}
          and (
            c.level in (select p.level from programs p)
            or (not exists (select 1 from programs p) and (
              (me.kind = 'school' and c.level = 'k12') or (me.kind <> 'school' and c.level in ('ug', 'pg'))))
          )
          and (c.level <> 'k12' or me.board is null or c.code in (me.board, 'early-years'))
      )
    )
  )`;
}
