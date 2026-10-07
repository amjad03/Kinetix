import { Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import type { ApplicantStage, JobApplicant, JobOpening } from '@kinetix/shared';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { departments, designations, jobApplicants, jobOpenings } from '../db/schema.js';
import { HR_ROLES } from './hr.access.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const OpeningBody = z.object({
  title: z.string().trim().min(1).max(120),
  departmentId: z.uuid().nullable().optional(),
  designationId: z.uuid().nullable().optional(),
  positions: z.number().int().min(1).max(500).default(1),
  description: z.string().trim().max(5000).default(''),
  status: z.enum(['open', 'on_hold', 'closed']).default('open'),
  closesOn: Day.nullable().optional(),
});
const ApplicantBody = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.email().nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  notes: z.string().trim().max(2000).default(''),
});
const StageBody = z.object({ stage: z.enum(['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']), note: z.string().trim().max(500).optional() });
const TERMINAL: ApplicantStage[] = ['hired', 'rejected', 'withdrawn'];

/** Recruitment basics: job openings and their applicants through a simple pipeline. */
@Controller('v1/hr')
export class RecruitmentController {
  constructor(private readonly db: DbService) {}

  private async openings(tx: Tx, id?: string): Promise<JobOpening[]> {
    const rows = await tx
      .select({ o: jobOpenings, dept: { id: departments.id, name: departments.name }, des: { id: designations.id, name: designations.name } })
      .from(jobOpenings)
      .leftJoin(departments, eq(departments.id, jobOpenings.departmentId))
      .leftJoin(designations, eq(designations.id, jobOpenings.designationId))
      .where(id ? eq(jobOpenings.id, id) : undefined)
      .orderBy(desc(jobOpenings.createdAt));
    const counts = await tx.select({ openingId: jobApplicants.openingId, stage: jobApplicants.stage, n: sql<number>`count(*)::int` }).from(jobApplicants).groupBy(jobApplicants.openingId, jobApplicants.stage);
    return rows.map(({ o, dept, des }) => ({
      id: o.id,
      title: o.title,
      department: dept?.id ? dept : null,
      designation: des?.id ? des : null,
      positions: o.positions,
      description: o.description,
      status: o.status as JobOpening['status'],
      closesOn: o.closesOn,
      pipeline: Object.fromEntries(counts.filter((c) => c.openingId === o.id).map((c) => [c.stage, c.n])),
      createdAt: o.createdAt.toISOString(),
    }));
  }

  @Get('openings')
  @Auth('user', HR_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.openings(tx));
  }

  @Post('openings')
  @Auth('user', HR_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(OpeningBody)) b: z.infer<typeof OpeningBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(jobOpenings).values({ tenantId: p.tenantId, ...b, departmentId: b.departmentId ?? null, designationId: b.designationId ?? null, closesOn: b.closesOn ?? null, createdBy: p.userId }).returning({ id: jobOpenings.id });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'recruitment.opening_created', subjectType: 'job_opening', subjectId: row.id, data: { title: b.title, positions: b.positions } });
      return (await this.openings(tx, row.id))[0];
    });
  }

  @Put('openings/:id')
  @Auth('user', HR_ROLES)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(OpeningBody)) b: z.infer<typeof OpeningBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(jobOpenings).set({ ...b, departmentId: b.departmentId ?? null, designationId: b.designationId ?? null, closesOn: b.closesOn ?? null }).where(eq(jobOpenings.id, id)).returning({ id: jobOpenings.id });
      if (!row) throw new NotFoundException('Opening not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'recruitment.opening_updated', subjectType: 'job_opening', subjectId: id, data: { status: b.status } });
      return (await this.openings(tx, id))[0];
    });
  }

  private applicant(a: typeof jobApplicants.$inferSelect): JobApplicant {
    return { id: a.id, openingId: a.openingId, fullName: a.fullName, email: a.email, phone: a.phone, notes: a.notes, stage: a.stage as ApplicantStage, stageHistory: a.stageHistory as JobApplicant['stageHistory'], createdAt: a.createdAt.toISOString() };
  }

  @Get('openings/:id/applicants')
  @Auth('user', HR_ROLES)
  applicants(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => (await tx.select().from(jobApplicants).where(eq(jobApplicants.openingId, id)).orderBy(asc(jobApplicants.createdAt))).map((a) => this.applicant(a)));
  }

  @Post('openings/:id/applicants')
  @Auth('user', HR_ROLES)
  addApplicant(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ApplicantBody)) b: z.infer<typeof ApplicantBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [opening] = await tx.select({ status: jobOpenings.status }).from(jobOpenings).where(eq(jobOpenings.id, id));
      if (!opening) throw new NotFoundException('Opening not found');
      if (opening.status === 'closed') throw new ConflictException('This opening is closed');
      const [row] = await tx
        .insert(jobApplicants)
        .values({ tenantId: p.tenantId, openingId: id, fullName: b.fullName, email: b.email ?? null, phone: b.phone ?? null, notes: b.notes, stageHistory: [{ stage: 'applied', at: new Date().toISOString(), by: p.userId }] })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'recruitment.applicant_added', subjectType: 'job_applicant', subjectId: row.id, data: { openingId: id } });
      return this.applicant(row);
    });
  }

  @Put('applicants/:id/stage')
  @HttpCode(200)
  @Auth('user', HR_ROLES)
  stage(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(StageBody)) b: z.infer<typeof StageBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select().from(jobApplicants).where(eq(jobApplicants.id, id)).for('update');
      if (!a) throw new NotFoundException('Applicant not found');
      if (TERMINAL.includes(a.stage as ApplicantStage)) throw new ConflictException(`This applicant is already ${a.stage}`);
      if (a.stage === b.stage) return this.applicant(a);
      const history = [...(a.stageHistory as JobApplicant['stageHistory']), { stage: b.stage, at: new Date().toISOString(), by: p.userId, ...(b.note ? { note: b.note } : {}) }];
      const [row] = await tx.update(jobApplicants).set({ stage: b.stage, stageHistory: history }).where(eq(jobApplicants.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'recruitment.stage_changed', subjectType: 'job_applicant', subjectId: id, data: { from: a.stage, to: b.stage } });
      return this.applicant(row);
    });
  }
}
