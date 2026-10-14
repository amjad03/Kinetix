import { Controller, Get, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import { cycleOn } from './engine.js';

const READ: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'hod', 'accreditation_reviewer'];
/** NAAC expects the IQAC to meet at least once a quarter. */
const MEETINGS_A_YEAR = 4;
/** Categories NAAC lists for the composition of the IQAC. */
const CATEGORIES = ['chairperson', 'coordinator', 'management', 'teacher', 'administrative', 'external_expert', 'alumni', 'student', 'employer', 'local_society'] as const;

/** The IQAC at a glance for a year: composition against NAAC's list, meetings against the quarterly norm, actions, initiatives and the AQAR. */
@Controller('v1/accreditation/iqac')
export class IqacController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  @Get('summary')
  @Auth('user', READ)
  summary(@CurrentPrincipal() p: UserPrincipal, @Query('cycle') cycleQ?: string) {
    const cycle = cycleQ && /^\d{4}-\d{2}$/.test(cycleQ) ? cycleQ : cycleOn(this.clock.now());
    const y = Number(cycle.slice(0, 4));
    const from = `${y}-06-01`;
    const to = `${y + 1}-05-31`;
    const today = this.clock.now().toISOString().slice(0, 10);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const one = async <T>(q: ReturnType<typeof sql>) => (await tx.execute(q)).rows[0] as T;
      const members = (await tx.execute(sql`select category, count(*)::int as n from iqac_members where term_from <= ${to}::date and (term_to is null or term_to >= ${from}::date) group by category`)).rows as { category: string; n: number }[];
      const meet = await one<{ held: number; scheduled: number; approved: number }>(sql`select count(*) filter (where status <> 'scheduled')::int as held, count(*) filter (where status = 'scheduled')::int as scheduled, count(*) filter (where status = 'minutes_approved')::int as approved from iqac_meetings where meeting_on between ${from}::date and ${to}::date`);
      const acts = await one<{ open: number; overdue: number; done: number; total: number }>(sql`select count(*) filter (where a.status in ('open', 'in_progress'))::int as open, count(*) filter (where a.status in ('open', 'in_progress') and a.due_on < ${today}::date)::int as overdue, count(*) filter (where a.status = 'done')::int as done, count(*)::int as total from iqac_actions a join iqac_meetings m on m.id = a.meeting_id where m.meeting_on between ${from}::date and ${to}::date`);
      const ini = await one<{ planned: number; done: number }>(sql`select count(*) filter (where status = 'planned')::int as planned, count(*) filter (where status = 'done')::int as done from iqac_initiatives where coalesce(held_on, planned_on) between ${from}::date and ${to}::date`);
      const fb = (await tx.execute(sql`select stakeholder, status from iqac_feedback_reports where cycle = ${cycle}`)).rows as { stakeholder: string; status: string }[];
      const aqar = (await tx.execute(sql`select year, due_on::text as "dueOn", submitted_on::text as "submittedOn", status, reference from iqac_aqar_submissions order by year desc limit 5`)).rows;
      const byCat = Object.fromEntries(members.map((m) => [m.category, m.n]));
      const missing = CATEGORIES.filter((c) => !byCat[c]);
      return {
        cycle,
        composition: { total: members.reduce((a, m) => a + m.n, 0), byCategory: byCat, missing },
        meetings: { ...meet, norm: MEETINGS_A_YEAR, short: Math.max(0, MEETINGS_A_YEAR - meet.held - meet.scheduled) },
        actions: acts,
        initiatives: ini,
        feedback: { stakeholders: ['students', 'teachers', 'employers', 'alumni', 'parents'].map((s) => ({ stakeholder: s, status: fb.find((f) => f.stakeholder === s)?.status ?? 'missing' })) },
        aqar,
      };
    });
  }
}
