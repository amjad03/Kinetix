import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { STUDENT_STATUSES, type LifecycleEvent, type StudentStatus } from '@kinetix/shared';
import { alias } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { Day, Phone } from '../common/zod-fields.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { admissionCycles, applications, guardians, programs, promotionBatches, sections, studentLifecycleEvents, students, users } from '../db/schema.js';
import { LifecycleService } from './lifecycle.service.js';

/** Who may change a student's status, class or promotion. */
export const LIFECYCLE_ROLES: RoleName[] = ['tenant_admin', 'principal'];
/** Who may open a student's profile and lifecycle record. */
export const PROFILE_ROLES: RoleName[] = ['tenant_admin', 'principal', 'admissions_officer', 'hod', 'accountant'];
/** Who may manage guardian links. */
export const GUARDIAN_ROLES: RoleName[] = ['tenant_admin', 'principal', 'admissions_officer'];

const Reason = z.string().trim().max(500);

const StatusBody = z.object({ status: z.enum(STUDENT_STATUSES), reason: Reason.optional(), effectiveOn: Day.optional() });
const SectionBody = z.object({ sectionId: z.uuid(), reason: Reason.min(3, 'Give a reason') });
const PromoteBody = z.object({
  label: z.string().trim().min(3).max(120),
  mappings: z.array(z.object({ fromSectionId: z.uuid(), toSectionId: z.uuid().nullable() })).min(1).max(100),
  detain: z.array(z.object({ studentId: z.uuid(), reason: Reason.min(3) })).max(2000).default([]),
  dryRun: z.boolean().default(false),
});
const GuardianBody = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: Phone,
  email: z.email().max(200).optional(),
  relation: z.string().trim().min(2).max(40).default('parent'),
  isPrimary: z.boolean().optional(),
  isEmergencyContact: z.boolean().optional(),
});
const GuardianPatch = z.object({ relation: z.string().trim().min(2).max(40).optional(), isPrimary: z.boolean().optional(), isEmergencyContact: z.boolean().optional() });

/** Students: the profile with its lifecycle timeline, status changes, bulk promotion and guardians. */
@Controller('v1/students')
export class StudentsController {
  constructor(
    private readonly db: DbService,
    private readonly lifecycle: LifecycleService,
  ) {}

  @Get()
  @Auth('user', PROFILE_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('q') q?: string, @Query('status') status?: string, @Query('sectionId') sectionId?: string) {
    const s = q?.trim();
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, status: students.status, sectionId: students.sectionId, className: sections.displayName })
        .from(students)
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(
          and(
            s ? or(ilike(students.fullName, `%${s.replace(/[%_]/g, '')}%`), eq(students.rollNo, s)) : undefined,
            status && (STUDENT_STATUSES as readonly string[]).includes(status) ? eq(students.status, status) : undefined,
            sectionId && z.uuid().safeParse(sectionId).success ? eq(students.sectionId, sectionId) : undefined,
          ),
        )
        .orderBy(asc(sections.displayName), asc(students.rollNo))
        .limit(200),
    );
  }

  /** The student, their class, guardians, admission and the full lifecycle timeline (newest first). */
  @Get(':id/profile')
  @Auth('user', PROFILE_ROLES)
  profile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ctx = await this.lifecycle.load(tx, id);
      const from = alias(sections, 'from_section');
      const to = alias(sections, 'to_section');
      const events = await tx
        .select({ e: studentLifecycleEvents, actorName: users.fullName, fromName: from.displayName, toName: to.displayName })
        .from(studentLifecycleEvents)
        .leftJoin(users, eq(users.id, studentLifecycleEvents.actorId))
        .leftJoin(from, eq(from.id, studentLifecycleEvents.fromSectionId))
        .leftJoin(to, eq(to.id, studentLifecycleEvents.toSectionId))
        .where(eq(studentLifecycleEvents.studentId, id))
        .orderBy(desc(studentLifecycleEvents.createdAt), desc(studentLifecycleEvents.id));
      const timeline: LifecycleEvent[] = events.map(({ e, actorName, fromName, toName }) => ({
        id: e.id,
        kind: e.kind,
        fromStatus: e.fromStatus as StudentStatus | null,
        toStatus: e.toStatus as StudentStatus | null,
        fromSection: fromName,
        toSection: toName,
        reason: e.reason,
        effectiveOn: e.effectiveOn,
        batchId: e.batchId,
        data: e.data,
        actorName,
        at: e.createdAt.toISOString(),
      }));
      const guardianRows = await tx
        .select({ id: guardians.id, userId: guardians.userId, fullName: users.fullName, phone: users.phone, email: users.email, relation: guardians.relation, isPrimary: guardians.isPrimary, isEmergencyContact: guardians.isEmergencyContact })
        .from(guardians)
        .innerJoin(users, eq(users.id, guardians.userId))
        .where(eq(guardians.studentId, id))
        .orderBy(desc(guardians.isPrimary), asc(guardians.createdAt));
      const [app] = ctx.student.applicationId
        ? await tx
            .select({ id: applications.id, applicationNo: applications.applicationNo, cycleName: admissionCycles.name, submittedAt: applications.submittedAt })
            .from(applications)
            .innerJoin(admissionCycles, eq(admissionCycles.id, applications.cycleId))
            .where(eq(applications.id, ctx.student.applicationId))
        : [];
      const [prog] = await tx.select({ level: programs.level }).from(programs).where(eq(programs.id, ctx.programId));
      return {
        id: ctx.student.id,
        fullName: ctx.student.fullName,
        rollNo: ctx.student.rollNo,
        status: ctx.student.status as StudentStatus,
        statusChangedAt: ctx.student.statusChangedAt,
        enrolledOn: ctx.student.enrolledOn,
        section: { id: ctx.section.id, displayName: ctx.section.displayName, term: ctx.section.term },
        program: { id: ctx.programId, name: ctx.programName, level: prog?.level, termCount: ctx.termCount },
        finalTerm: ctx.finalTerm,
        allowedStatuses: this.lifecycle.allowedStatuses(ctx.student.status, ctx.finalTerm),
        guardians: guardianRows,
        application: app ?? null,
        timeline,
      };
    });
  }

  @Post(':id/status')
  @HttpCode(200)
  @Auth('user', LIFECYCLE_ROLES)
  status(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(StatusBody)) body: z.infer<typeof StatusBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.lifecycle.changeStatus(tx, p, id, body.status, { reason: body.reason, effectiveOn: body.effectiveOn }));
  }

  @Post(':id/section')
  @HttpCode(200)
  @Auth('user', LIFECYCLE_ROLES)
  section(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SectionBody)) body: z.infer<typeof SectionBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.lifecycle.changeSection(tx, p, id, body.sectionId, body.reason));
  }

  /** Bulk promotion to the next class (or graduation). `dryRun: true` only reports what would happen. */
  @Post('promotions')
  @HttpCode(200)
  @Auth('user', LIFECYCLE_ROLES)
  promote(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PromoteBody)) body: z.infer<typeof PromoteBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.lifecycle.promote(tx, p, body));
  }

  @Get('promotions/history')
  @Auth('user', LIFECYCLE_ROLES)
  async promotionHistory(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      return tx.select({ id: promotionBatches.id, label: promotionBatches.label, summary: promotionBatches.summary, createdAt: promotionBatches.createdAt, runBy: users.fullName }).from(promotionBatches).leftJoin(users, eq(users.id, promotionBatches.runBy)).orderBy(desc(promotionBatches.createdAt)).limit(50);
    });
  }

  @Post(':id/guardians')
  @Auth('user', GUARDIAN_ROLES)
  addGuardian(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(GuardianBody)) body: z.infer<typeof GuardianBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.lifecycle.linkGuardian(tx, p, id, body));
  }

  @Patch(':id/guardians/:guardianId')
  @Auth('user', GUARDIAN_ROLES)
  patchGuardian(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('guardianId', ParseUUIDPipe) gid: string, @Body(new ZodBody(GuardianPatch)) body: z.infer<typeof GuardianPatch>) {
    return this.db.withTenant(p.tenantId, (tx) => this.lifecycle.updateGuardian(tx, p, id, gid, body));
  }

  @Delete(':id/guardians/:guardianId')
  @HttpCode(204)
  @Auth('user', GUARDIAN_ROLES)
  async removeGuardian(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('guardianId', ParseUUIDPipe) gid: string) {
    await this.db.withTenant(p.tenantId, (tx) => this.lifecycle.unlinkGuardian(tx, p, id, gid));
  }
}
