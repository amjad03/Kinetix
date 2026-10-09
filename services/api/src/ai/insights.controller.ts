import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ADMISSIONS_ROLES } from '../admissions/admissions.controller.js';
import { EnquiriesService } from '../admissions/enquiries.service.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { auditNonConformities, leaveRequests, leaveTypes, payrollRuns, payslips, researchGrants, staffAttendance } from '../db/schema.js';
import { feeSummary } from '../fees/fees.controller.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { budgetReportRows, currentFiscalYear } from '../finance/finance.controller.js';
import { HR_ROLES } from '../hr/hr.access.js';
import { PLACEMENT_VIEW_ROLES } from '../placements/placements.access.js';
import { RESEARCH_VIEW_ROLES } from '../research/research.controller.js';
import { countsByStatus } from './learning-facts.js';
import { AiService } from './ai.service.js';
import { Language } from './tasks.js';

const Request = z.object({ language: Language.default('en'), fresh: z.boolean().default(false) });
const FinanceRequest = Request.extend({ fiscalYear: z.string().regex(/^\d{4}-\d{2}$/).optional() });

const rupees = (paise: number) => Math.round(paise / 100);
const day = (offset: number) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);

/**
 * Domain assistants (PRD §64): finance, admissions and HR summaries. The figures are computed
 * here from the database and only those aggregates reach the model: never a student's or a
 * staff member's name. The answer is a draft for the office head to read, not a record.
 */
@Controller('v1/ai/insights')
export class InsightsController {
  private readonly enquiries = new EnquiriesService();

  constructor(
    private readonly ai: AiService,
    private readonly db: DbService,
  ) {}

  @Post('finance')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  async finance(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FinanceRequest)) b: z.infer<typeof FinanceRequest>) {
    const facts = await this.db.withTenant(p.tenantId, async (tx) => {
      const fees = await feeSummary(tx);
      const budget = await budgetReportRows(tx, b.fiscalYear ?? currentFiscalYear());
      const collectedPct = fees.billedPaise ? Math.round((fees.collectedPaise / fees.billedPaise) * 1000) / 10 : 0;
      return {
        fees: {
          billedRupees: rupees(fees.billedPaise),
          collectedRupees: rupees(fees.collectedPaise),
          outstandingRupees: rupees(fees.outstandingPaise),
          collectedPercent: collectedPct,
          overdueInvoices: fees.overdueInvoices,
          overdueRupees: rupees(fees.overduePaise),
          openInvoices: fees.openInvoices,
          // Classes with the most overdue money (no student names).
          topOverdueClasses: [...fees.classes]
            .filter((c) => c.overduePaise > 0)
            .sort((a, c) => c.overduePaise - a.overduePaise)
            .slice(0, 5)
            .map((c) => ({ class: c.className, overdueRupees: rupees(c.overduePaise), overdueInvoices: c.overdue })),
        },
        budget: {
          fiscalYear: budget.fiscalYear,
          departments: budget.rows
            .filter((r) => r.budgetPaise > 0 || r.actualPaise > 0)
            .map((r) => ({ department: r.department, budgetRupees: rupees(r.budgetPaise), actualRupees: rupees(r.actualPaise), varianceRupees: rupees(r.budgetPaise - r.actualPaise) })),
        },
      };
    });
    return this.ai.run({ tenantId: p.tenantId, userId: p.userId }, 'financeInsight', { facts, language: b.language }, { fresh: b.fresh });
  }

  @Post('admissions')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  async admissions(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(Request)) b: z.infer<typeof Request>) {
    const facts = await this.db.withTenant(p.tenantId, async (tx) => {
      const pipeline = await this.enquiries.pipeline(tx, day(0));
      const report = await this.enquiries.campaignReport(tx, {});
      return {
        funnel: { stages: pipeline.stages, followUpsDue: pipeline.followUpsDue, newThisWeek: pipeline.newThisWeek },
        campaigns: report.campaigns.map((c) => ({
          name: c.name,
          channel: c.channel,
          active: c.active,
          enquiries: c.enquiries,
          applied: c.applied,
          enrolled: c.enrolled,
          conversionPercent: c.conversionPct,
          costPerEnrolmentRupees: c.costPerEnrolmentPaise === null ? null : rupees(c.costPerEnrolmentPaise),
        })),
        unattributed: report.unattributed,
      };
    });
    return this.ai.run({ tenantId: p.tenantId, userId: p.userId }, 'admissionsInsight', { facts, language: b.language }, { fresh: b.fresh });
  }

  @Post('hr')
  @HttpCode(200)
  @Auth('user', HR_ROLES)
  async hr(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(Request)) b: z.infer<typeof Request>) {
    const facts = await this.db.withTenant(p.tenantId, (tx) => this.hrFacts(tx));
    return this.ai.run({ tenantId: p.tenantId, userId: p.userId }, 'hrInsight', { facts, language: b.language }, { fresh: b.fresh });
  }

  /** Accreditation readiness: audits and non-conformities by status (counts only). */
  @Post('quality')
  @HttpCode(200)
  @Auth('user', ['tenant_admin', 'principal', 'quality_officer'])
  async quality(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(Request)) b: z.infer<typeof Request>) {
    const facts = await this.db.withTenant(p.tenantId, async (tx) => {
      const [overdue] = await tx.select({ n: sql<number>`count(*)::int` }).from(auditNonConformities).where(sql`${auditNonConformities.status} <> 'closed' and ${auditNonConformities.dueOn} < current_date`);
      return { audits: await countsByStatus(tx, 'academic_audits'), nonConformities: await countsByStatus(tx, 'audit_non_conformities'), overdueNonConformities: overdue.n };
    });
    return this.ai.run({ tenantId: p.tenantId, userId: p.userId }, 'qualityInsight', { facts, language: b.language }, { fresh: b.fresh });
  }

  /** Research office: proposals, projects, grants and scholars by status, and the sanctioned funding. */
  @Post('research')
  @HttpCode(200)
  @Auth('user', RESEARCH_VIEW_ROLES)
  async research(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(Request)) b: z.infer<typeof Request>) {
    const facts = await this.db.withTenant(p.tenantId, async (tx) => {
      const [g] = await tx.select({ sanctionedRupees: sql<number>`coalesce(sum(${researchGrants.sanctionedPaise}) / 100, 0)::float` }).from(researchGrants).where(sql`${researchGrants.status} = 'active'`);
      return { proposals: await countsByStatus(tx, 'research_proposals'), projects: await countsByStatus(tx, 'research_projects'), grants: await countsByStatus(tx, 'research_grants'), activeSanctionedRupees: g.sanctionedRupees, scholars: await countsByStatus(tx, 'research_scholars') };
    });
    return this.ai.run({ tenantId: p.tenantId, userId: p.userId }, 'researchInsight', { facts, language: b.language }, { fresh: b.fresh });
  }

  /** Placement cell: drives, registrations, offers and internships by status. */
  @Post('careers')
  @HttpCode(200)
  @Auth('user', PLACEMENT_VIEW_ROLES)
  async careers(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(Request)) b: z.infer<typeof Request>) {
    const facts = await this.db.withTenant(p.tenantId, async (tx) => ({
      drives: await countsByStatus(tx, 'placement_drives'),
      registrations: await countsByStatus(tx, 'drive_registrations'),
      offers: await countsByStatus(tx, 'placement_offers'),
      internships: await countsByStatus(tx, 'internships'),
    }));
    return this.ai.run({ tenantId: p.tenantId, userId: p.userId }, 'careerInsight', { facts, language: b.language }, { fresh: b.fresh });
  }

  /** Leave, attendance and the latest payroll run as counts and totals. */
  private async hrFacts(tx: Tx) {
    const since = day(-30);
    const leave = await tx
      .select({ type: leaveTypes.name, status: leaveRequests.status, requests: sql<number>`count(*)::int`, days: sql<number>`coalesce(sum(${leaveRequests.days}), 0)::float` })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(gte(leaveRequests.fromDate, since))
      .groupBy(leaveTypes.name, leaveRequests.status);
    const attendance = await tx
      .select({ status: staffAttendance.status, n: sql<number>`count(*)::int` })
      .from(staffAttendance)
      .where(gte(staffAttendance.date, since))
      .groupBy(staffAttendance.status);
    const [pendingNow] = await tx.select({ n: sql<number>`count(*)::int` }).from(leaveRequests).where(eq(leaveRequests.status, 'pending'));
    const [run] = await tx.select().from(payrollRuns).orderBy(desc(payrollRuns.month)).limit(1);
    let payroll: Record<string, unknown> | null = null;
    if (run) {
      const [t] = await tx
        .select({
          staff: sql<number>`count(*)::int`,
          gross: sql<number>`coalesce(sum(${payslips.grossPaise}), 0)::bigint`,
          net: sql<number>`coalesce(sum(${payslips.netPaise}), 0)::bigint`,
          cost: sql<number>`coalesce(sum(${payslips.employerCostPaise}), 0)::bigint`,
        })
        .from(payslips)
        .where(eq(payslips.runId, run.id));
      payroll = { month: run.month, status: run.status, staffPaid: t.staff, grossRupees: rupees(Number(t.gross)), netRupees: rupees(Number(t.net)), employerCostRupees: rupees(Number(t.cost)), skippedStaff: run.skipped.length };
    }
    return {
      windowDays: 30,
      leave: leave.map((l) => ({ type: l.type, status: l.status, requests: l.requests, days: l.days })),
      pendingLeaveRequests: pendingNow.n,
      attendance: Object.fromEntries(attendance.map((a) => [a.status, a.n])),
      latestPayroll: payroll,
    };
  }
}
