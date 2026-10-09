import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, OnModuleInit, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { interventionPlans, students, users } from '../db/schema.js';
import { interventionReassessments, interventionSupport } from '../db/schema-depth.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { hasRole } from '../placements/placements.access.js';
import { MENTORING_ADMIN } from './mentoring-rules.js';
import { MentoringService } from './mentoring.service.js';

const REASSESS_JOB = 'mentoring.reassess';
const SupportBody = z.object({ kind: z.enum(['content', 'tutoring', 'remedial_class', 'counselling', 'other']), title: z.string().trim().min(3).max(200), ref: z.string().trim().max(200).optional(), dueOn: z.iso.date().optional() });

/** Support set against intervention plans, and the re-assessment of risk when a plan reaches its review date or closes (PRD section 41). */
@Controller('v1/mentoring')
export class MentoringDepthController implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly svc: MentoringService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerDaily(REASSESS_JOB, (job: Job) => this.db.withTenant(job.tenantId, (tx) => this.svc.reassessDue(tx)).then(() => undefined));
  }

  private async plan(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0], p: UserPrincipal, id: string) {
    const [plan] = await tx.select().from(interventionPlans).where(eq(interventionPlans.id, id));
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.mentorUserId !== p.userId && !hasRole(p, MENTORING_ADMIN)) throw new ForbiddenException('Only the mentor of this plan can change it');
    return plan;
  }

  /** The support lined up for a plan and the change in risk so far. */
  @Get('plans/:id/progress')
  @Auth('user', [...MENTORING_ADMIN, 'teacher', 'counsellor'])
  progress(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [plan] = await tx.select().from(interventionPlans).where(eq(interventionPlans.id, id));
      if (!plan) throw new NotFoundException('Plan not found');
      if (plan.mentorUserId !== p.userId && !hasRole(p, [...MENTORING_ADMIN, 'counsellor'])) throw new ForbiddenException('This plan belongs to another mentor');
      const support = await tx.select().from(interventionSupport).where(eq(interventionSupport.planId, id)).orderBy(asc(interventionSupport.createdAt));
      const [re] = await tx.select().from(interventionReassessments).where(eq(interventionReassessments.planId, id));
      return { planId: id, support, reassessment: re ?? null };
    });
  }

  /** Adds support to the plan: a content pack, tutoring, a remedial class, a counselling session. */
  @Post('plans/:id/support')
  @Auth('user', ['teacher', 'hod', 'principal', 'tenant_admin'])
  addSupport(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SupportBody)) b: z.infer<typeof SupportBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const plan = await this.plan(tx, p, id);
      if (plan.status === 'closed') throw new ConflictException('This plan is closed');
      const [row] = await tx.insert(interventionSupport).values({ tenantId: p.tenantId, planId: id, kind: b.kind, title: b.title, ref: b.ref ?? null, dueOn: b.dueOn ?? null, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'mentoring.support_added', 'intervention_plan', id, { kind: b.kind });
      return row;
    });
  }

  @Post('support/:id/done')
  @HttpCode(200)
  @Auth('user', ['teacher', 'hod', 'principal', 'tenant_admin'])
  supportDone(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select().from(interventionSupport).where(eq(interventionSupport.id, id));
      if (!s) throw new NotFoundException('Support item not found');
      await this.plan(tx, p, s.planId);
      const [row] = await tx.update(interventionSupport).set({ done: true }).where(eq(interventionSupport.id, id)).returning();
      await auditUser(tx, p, 'mentoring.support_done', 'intervention_plan', s.planId);
      return row;
    });
  }

  /** Measures the student's risk again now and sets it against the risk when the plan opened. */
  @Post('plans/:id/reassess')
  @HttpCode(200)
  @Auth('user', ['teacher', 'hod', 'principal', 'tenant_admin'])
  reassess(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.plan(tx, p, id);
      const row = await this.svc.runReassessment(tx, id);
      if (!row) throw new ConflictException('This plan has no starting measurement');
      await auditUser(tx, p, 'mentoring.reassessed', 'intervention_plan', id, { outcome: row.outcome });
      return row;
    });
  }

  /** The signed-in student's open support items, so the app can show what they have been asked to do. */
  @Get('my-support')
  @Auth('user', ['student'])
  mySupport(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) =>
      tx
        .select({ id: interventionSupport.id, kind: interventionSupport.kind, title: interventionSupport.title, ref: interventionSupport.ref, dueOn: interventionSupport.dueOn, done: interventionSupport.done, mentor: users.fullName })
        .from(interventionSupport)
        .innerJoin(interventionPlans, eq(interventionPlans.id, interventionSupport.planId))
        .innerJoin(students, eq(students.id, interventionPlans.studentId))
        .innerJoin(users, eq(users.id, interventionPlans.mentorUserId))
        .where(and(eq(students.userId, p.userId), eq(interventionSupport.done, false)))
        .orderBy(desc(interventionSupport.createdAt)),
    );
  }
}
