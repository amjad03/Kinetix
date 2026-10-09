import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { DbService } from '../db/db.service.js';
import { RESEARCH_VIEW_ROLES } from './research.controller.js';

interface Row { [k: string]: unknown }

/**
 * The university research office: one view across every department of projects, funding, outputs, scholars and
 * theses, so the office does not have to add up each department's page.
 */
@Controller('v1/research/office')
export class ResearchOfficeController {
  constructor(private readonly db: DbService) {}

  @Get('summary')
  @Auth('user', RESEARCH_VIEW_ROLES)
  summary(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = async <T extends Row>(q: ReturnType<typeof sql>) => (await tx.execute<T>(q)).rows as T[];
      const [totals] = await rows<{ projects: number; active: number; sanctioned: number; spent: number; publications: number; patents: number; datasets: number; ethics_pending: number; scholars: number }>(sql`
        select (select count(*)::int from research_projects) as projects,
               (select count(*)::int from research_projects where status = 'active') as active,
               (select coalesce(sum(sanctioned_paise), 0)::float from research_grants where status <> 'cancelled') as sanctioned,
               (select coalesce(sum(amount_paise), 0)::float from grant_expenses) as spent,
               (select count(*)::int from publications) as publications,
               (select count(*)::int from patents) as patents,
               (select count(*)::int from research_datasets) as datasets,
               (select count(*)::int from research_proposals where ethics_status = 'pending') as ethics_pending,
               (select count(*)::int from research_scholars where status in ('enrolled', 'thesis_submitted')) as scholars`);
      const byDepartment = await rows<{ department: string; projects: number; publications: number; sanctioned: number }>(sql`
        select d.name as department,
               (select count(*)::int from research_projects rp where rp.department_id = d.id) as projects,
               (select count(*)::int from publications pb join staff_profiles sp on sp.user_id = pb.owner_user_id where sp.department_id = d.id) as publications,
               (select coalesce(sum(g.sanctioned_paise), 0)::float from research_grants g join research_projects rp on rp.id = g.project_id where rp.department_id = d.id and g.status <> 'cancelled') as sanctioned
        from departments d order by d.name`);
      const publicationsByYear = await rows<{ year: number; n: number }>(sql`select year::int as year, count(*)::int as n from publications group by year order by year desc limit 6`);
      const scholarsByStatus = await rows<{ status: string; n: number }>(sql`select status, count(*)::int as n from research_scholars group by status order by status`);
      const thesesByStage = await rows<{ stage: string; n: number }>(sql`select stage, count(*)::int as n from thesis_records group by stage order by stage`);
      const supervisors = await rows<{ full_name: string; load: number; max_scholars: number }>(sql`
        select u.full_name, count(*)::int as load, coalesce(c.max_scholars, 8)::int as max_scholars
        from research_scholars s join users u on u.id = s.supervisor_user_id left join supervisor_capacity c on c.user_id = u.id
        where s.status in ('enrolled', 'thesis_submitted') group by u.full_name, c.max_scholars order by load desc limit 10`);
      return {
        totals: { ...totals, sanctionedPaise: totals.sanctioned, spentPaise: totals.spent, utilisationPercent: totals.sanctioned ? Math.round((totals.spent / totals.sanctioned) * 1000) / 10 : 0 },
        byDepartment,
        publicationsByYear,
        scholarsByStatus,
        thesesByStage,
        supervisorLoad: supervisors.map((s) => ({ fullName: s.full_name, load: s.load, maxScholars: s.max_scholars })),
      };
    });
  }
}
