import { BadRequestException, Controller, Get, Module, Query } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { reportsFor } from '../analytics/catalogue.js';
import { rows } from '../analytics/queries.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { licenceAllows, topicLicensed } from '../content/licensing.js';
import { DbService } from '../db/db.service.js';
import { STAFF_VAULT_MANAGERS, STUDENT_VAULT_MANAGERS } from '../documents/documents.access.js';
import { RequireFeature } from '../flags/flags.js';

export const SEARCH_TYPES = ['students', 'staff', 'courses', 'topics', 'documents', 'reports'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export interface SearchHit {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string;
  /** Where the ERP opens it. */
  url: string;
  score: number;
}

/** Who may search which kind of record. Anything not listed returns nothing, so ids and names do not leak. */
const STUDENT_SEARCH: RoleName[] = ['tenant_admin', 'principal', 'hod', 'accountant', 'admissions_officer', 'librarian'];
const STAFF_SEARCH: RoleName[] = ['tenant_admin', 'principal', 'hr_manager'];
const hasAny = (p: UserPrincipal, roles: RoleName[]) => p.roles.some((r) => roles.includes(r));
const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Global search for the ERP top bar: Postgres full text and trigram similarity over students, staff,
 * courses, topics, documents and reports. Results are scoped by role: a teacher finds only students
 * they teach, staff records need an HR role, documents follow the vault's own visibility rules.
 */
@Controller('v1/search')
@RequireFeature('search.global')
export class SearchController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Auth('user')
  async search(@CurrentPrincipal() p: UserPrincipal, @Query('q') q = '', @Query('types') typesQ?: string, @Query('limit') limitQ?: string): Promise<{ q: string; hits: SearchHit[] }> {
    const term = q.trim().slice(0, 80);
    if (term.length < 2) return { q: term, hits: [] };
    const types = typesQ ? typesQ.split(',').map((t) => t.trim()) : [...SEARCH_TYPES];
    const bad = types.find((t) => !SEARCH_TYPES.includes(t as SearchType));
    if (bad) throw new BadRequestException(`Unknown type "${bad}"; use ${SEARCH_TYPES.join(', ')}`);
    const limit = Math.min(Math.max(Number(limitQ) || 5, 1), 20);
    const like = likeOf(term);
    const wants = (t: SearchType) => types.includes(t);

    return this.db.withTenant(p.tenantId, async (tx) => {
      const hits: SearchHit[] = [];
      const add = (type: SearchType, list: { id: string; title: string; subtitle: string; url: string; score: number }[]) => hits.push(...list.map((h) => ({ type, ...h, score: Math.round(Number(h.score) * 1000) / 1000 })));

      if (wants('students') && hasAny(p, [...STUDENT_SEARCH, 'teacher'])) {
        const scope: SQL = hasAny(p, STUDENT_SEARCH) ? sql`true` : sql`exists (select 1 from timetable_slots ts where ts.section_id = s.section_id and ts.teacher_id = ${p.userId}::uuid)`;
        add('students', await rows(tx, sql`select s.id::text as id, s.full_name as title, s.roll_no || ' · ' || sec.display_name as subtitle, '/students/' || s.id as url,
            greatest(similarity(s.full_name, ${term}), case when s.roll_no ilike ${like} then 0.9 else 0 end) as score
          from students s join sections sec on sec.id = s.section_id
          where (s.full_name ilike ${like} or s.full_name % ${term} or s.roll_no ilike ${like}) and ${scope}
          order by score desc, s.full_name limit ${limit}`));
      }
      if (wants('staff') && hasAny(p, STAFF_SEARCH)) {
        add('staff', await rows(tx, sql`select u.id::text as id, u.full_name as title, coalesce(sp.employee_code, '') || coalesce(' · ' || d.name, '') as subtitle, '/hr/staff/' || u.id as url, similarity(u.full_name, ${term}) as score
          from staff_profiles sp join users u on u.id = sp.user_id left join departments d on d.id = sp.department_id
          where u.full_name ilike ${like} or u.full_name % ${term} or sp.employee_code ilike ${like}
          order by score desc, u.full_name limit ${limit}`));
      }
      if (wants('courses')) {
        add('courses', await rows(tx, sql`select c.id::text as id, c.title as title, c.curriculum_code || ' · term ' || c.term as subtitle, '/syllabus/' || c.id as url, similarity(c.title, ${term}) as score
          from courses c where (c.title ilike ${like} or c.title % ${term}) and ${licenceAllows('course', sql`c.id`)}
          order by score desc, c.title limit ${limit}`));
      }
      if (wants('topics')) {
        add('topics', await rows(tx, sql`select t.id::text as id, t.title as title, c.title || ' · ' || ch.title as subtitle, '/syllabus/' || c.id as url,
            greatest(similarity(t.title, ${term}), ts_rank(to_tsvector('simple', t.title || ' ' || t.summary), websearch_to_tsquery('simple', ${term}))) as score
          from topics t join chapters ch on ch.id = t.chapter_id join courses c on c.id = ch.course_id
          where (t.title ilike ${like} or t.title % ${term} or to_tsvector('simple', t.title || ' ' || t.summary) @@ websearch_to_tsquery('simple', ${term}))
            and (t.tenant_id is null or t.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) and ${topicLicensed(sql`t.id`, sql`c.id`)}
          order by score desc, t.title limit ${limit}`));
      }
      if (wants('documents')) {
        const studentMgr = hasAny(p, STUDENT_VAULT_MANAGERS);
        const staffMgr = hasAny(p, STAFF_VAULT_MANAGERS);
        add('documents', await rows(tx, sql`select d.id::text as id, d.title as title, d.category || ' · ' || (case when d.owner_type = 'student' then coalesce(st.full_name, 'student') else coalesce(u.full_name, 'staff') end) as subtitle,
            (case when d.owner_type = 'student' then '/students/' || d.student_id else '/hr/staff/' || d.staff_user_id end) as url, similarity(d.title, ${term}) as score
          from vault_documents d left join students st on st.id = d.student_id left join users u on u.id = d.staff_user_id
          where d.archived_at is null and d.scan_status = 'clean' and (d.title ilike ${like} or d.title % ${term})
            and ((d.owner_type = 'student' and ${studentMgr}) or (d.owner_type = 'staff' and ${staffMgr})
              or (d.visibility = 'owner' and ((d.owner_type = 'staff' and d.staff_user_id = ${p.userId}::uuid)
                or (d.owner_type = 'student' and (st.user_id = ${p.userId}::uuid or exists (select 1 from guardians g where g.student_id = d.student_id and g.user_id = ${p.userId}::uuid))))))
          order by score desc, d.title limit ${limit}`));
      }
      if (wants('reports')) {
        const t = term.toLowerCase();
        add('reports', reportsFor(p.roles).filter((r) => `${r.title} ${r.description} ${r.key}`.toLowerCase().includes(t)).slice(0, limit).map((r) => ({ id: r.key, title: r.title, subtitle: r.description, url: `/reports?report=${encodeURIComponent(r.key)}`, score: r.title.toLowerCase().startsWith(t) ? 1 : 0.5 })));
      }
      return { q: term, hits: hits.sort((a, b) => b.score - a.score) };
    });
  }
}

@Module({ controllers: [SearchController] })
export class SearchModule {}
