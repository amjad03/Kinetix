import { BadRequestException, Controller, Get, Module, Query } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { reportsFor } from '../analytics/catalogue.js';
import { rows } from '../analytics/queries.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { licenceAllows, topicLicensed } from '../content/licensing.js';
import { DbService } from '../db/db.service.js';
import { STAFF_VAULT_MANAGERS, STUDENT_VAULT_MANAGERS } from '../documents/documents.access.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { RequireFeature } from '../flags/flags.js';
import { describe, parseQuestion } from './nl-search.js';

export const SEARCH_TYPES = ['students', 'staff', 'courses', 'topics', 'documents', 'reports', 'events', 'fees', 'messages', 'knowledge'] as const;
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
      if (wants('events')) {
        add('events', await rows(tx, sql`select e.id::text as id, e.title as title, 'Campus event · ' || to_char(e.starts_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') as subtitle, '/campus-life' as url, similarity(e.title, ${term}) as score
          from campus_events e where e.title ilike ${like} or e.title % ${term}
          union all
          select c.id::text, c.title, 'Calendar · ' || to_char(c.starts_on, 'DD Mon YYYY'), '/calendar', similarity(c.title, ${term})
          from calendar_events c where c.title ilike ${like} or c.title % ${term}
          order by score desc limit ${limit}`));
      }
      if (wants('fees') && hasAny(p, FEE_ROLES)) {
        add('fees', await rows(tx, sql`select i.id::text as id, i.title || ' · ' || s.full_name as title, 'Due ' || to_char(i.due_on, 'DD Mon YYYY') || ' · balance ₹' || ((i.amount_paise - i.paid_paise) / 100)::text as subtitle, '/fees' as url,
            greatest(similarity(s.full_name, ${term}), similarity(i.title, ${term}), case when i.title ilike ${like} then 0.6 else 0 end) as score
          from fee_invoices i join students s on s.id = i.student_id
          where s.full_name ilike ${like} or s.full_name % ${term} or i.title ilike ${like}
          order by score desc, i.due_on desc limit ${limit}`));
      }
      if (wants('messages')) {
        add('messages', await rows(tx, sql`select m.id::text as id, left(m.body, 80) as title, 'Message · ' || to_char(m.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') as subtitle, '/messages' as url,
            ts_rank(to_tsvector('simple', m.body), websearch_to_tsquery('simple', ${term})) + case when m.body ilike ${like} then 0.3 else 0 end as score
          from messages m join conversations c on c.id = m.conversation_id
          where (c.staff_id = ${p.userId}::uuid or c.family_id = ${p.userId}::uuid) and m.body ilike ${like}
          order by m.created_at desc limit ${limit}`));
      }
      if (wants('knowledge')) {
        add('knowledge', await rows(tx, sql`select k.id::text as id, k.name as title, 'Skill · ' || k.category as subtitle, '/skills' as url, greatest(similarity(k.name, ${term}), case when k.name ilike ${like} then 0.6 else 0 end) as score
          from skills k where k.active and (k.name ilike ${like} or k.name % ${term} or k.description ilike ${like})
          union all
          select o.id::text, o.code || ' · ' || left(o.statement, 70), 'Course outcome', '/obe', similarity(o.statement, ${term})
          from course_outcomes o where o.statement ilike ${like} or o.code ilike ${like}
          order by score desc limit ${limit}`));
      }
      return { q: term, hits: hits.sort((a, b) => b.score - a.score) };
    });
  }

  /**
   * Ask a question in plain words: "students absent today in class 8A", "fees overdue", "attendance below 75%". The
   * sentence is read by rules into one of a few exact queries; the answer says how it was read. Anything else is a search.
   */
  @Get('ask')
  @Auth('user')
  async ask(@CurrentPrincipal() p: UserPrincipal, @Query('q') q = '') {
    const text = q.trim().slice(0, 200);
    if (text.length < 3) return { q: text, interpretation: '', columns: [], rows: [], url: null };
    const intent = parseQuestion(text);
    const interpretation = describe(intent);
    const deny = () => ({ q: text, intent: intent.kind, interpretation, columns: [], rows: [], url: null, note: 'Your role cannot see this list.' });
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cls = 'className' in intent && intent.className ? sql` and replace(replace(upper(sec.display_name), ' ', ''), '-', '') like ${'%' + intent.className + '%'}` : sql``;
      switch (intent.kind) {
        case 'fees_overdue': {
          if (!hasAny(p, FEE_ROLES)) return deny();
          const r = await rows(tx, sql`select s.full_name as student, sec.display_name as class, i.title as invoice, ((i.amount_paise - i.paid_paise) / 100)::int as balance_rupees, to_char(i.due_on, 'DD Mon YYYY') as due
            from fee_invoices i join students s on s.id = i.student_id join sections sec on sec.id = s.section_id
            where i.due_on < current_date and i.paid_paise < i.amount_paise ${cls} order by i.due_on limit 50`);
          return { q: text, intent: intent.kind, interpretation, columns: ['student', 'class', 'invoice', 'balance_rupees', 'due'], rows: r, url: '/fees' };
        }
        case 'absent_today': {
          if (!hasAny(p, STUDENT_SEARCH)) return deny();
          const r = await rows(tx, sql`select s.full_name as student, s.roll_no as roll_no, sec.display_name as class
            from attendance_records a join students s on s.id = a.student_id join sections sec on sec.id = s.section_id
            where a.date = (now() at time zone 'Asia/Kolkata')::date and a.timetable_slot_id is null and a.status = 'absent' ${cls} order by sec.display_name, s.roll_no limit 100`);
          return { q: text, intent: intent.kind, interpretation, columns: ['student', 'roll_no', 'class'], rows: r, url: '/attendance' };
        }
        case 'low_attendance': {
          if (!hasAny(p, STUDENT_SEARCH)) return deny();
          const r = await rows(tx, sql`select s.full_name as student, sec.display_name as class, round(100.0 * count(*) filter (where a.status in ('present', 'late')) / count(*), 1) as attendance_pct
            from attendance_records a join students s on s.id = a.student_id join sections sec on sec.id = s.section_id
            where a.timetable_slot_id is null and a.date >= current_date - 30 and s.status = 'active' ${cls}
            group by s.id, s.full_name, sec.display_name having 100.0 * count(*) filter (where a.status in ('present', 'late')) / count(*) < ${intent.belowPct}
            order by attendance_pct limit 100`);
          return { q: text, intent: intent.kind, interpretation, columns: ['student', 'class', 'attendance_pct'], rows: r, url: '/attendance' };
        }
        case 'staff_on_leave': {
          if (!hasAny(p, STAFF_SEARCH)) return deny();
          const r = await rows(tx, sql`select u.full_name as staff, to_char(l.from_date, 'DD Mon') as from_date, to_char(l.to_date, 'DD Mon') as to_date, l.reason as reason
            from leave_requests l join users u on u.id = l.user_id where l.status = 'approved' and current_date between l.from_date and l.to_date order by u.full_name limit 100`);
          return { q: text, intent: intent.kind, interpretation, columns: ['staff', 'from_date', 'to_date', 'reason'], rows: r, url: '/hr' };
        }
        case 'upcoming_events': {
          const r = await rows(tx, sql`select title, to_char(starts_at at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') as starts, venue from campus_events
            where starts_at >= now() and starts_at < now() + interval '30 days' order by starts_at limit 20`);
          return { q: text, intent: intent.kind, interpretation, columns: ['title', 'starts', 'venue'], rows: r, url: '/campus-life' };
        }
        case 'my_tasks': {
          const r = await rows(tx, sql`select title, priority, status, to_char(due_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') as due from tasks
            where assignee_id = ${p.userId}::uuid and status in ('open', 'in_progress') order by due_at nulls last limit 50`);
          return { q: text, intent: intent.kind, interpretation, columns: ['title', 'priority', 'status', 'due'], rows: r, url: '/tasks' };
        }
        default: {
          const found = await this.search(p, intent.term, undefined, '8');
          return { q: text, intent: 'search', interpretation, columns: ['title', 'subtitle', 'type'], rows: found.hits.map((h) => ({ title: h.title, subtitle: h.subtitle, type: h.type })), url: null, hits: found.hits };
        }
      }
    });
  }
}

@Module({ controllers: [SearchController] })
export class SearchModule {}
