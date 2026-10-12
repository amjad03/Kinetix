import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, desc, eq, inArray, notExists, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { academicRequests, guardians, sections, students, users } from '../db/schema.js';
import { canDecideStep, REQUEST_KINDS, SETTINGS_KINDS, type RequestKind, type SettingsKind } from './academics-rules.js';
import { AcademicsService } from './academics.service.js';

export const ACAD_STAFF: RoleName[] = ['tenant_admin', 'principal', 'hod', 'teacher', 'admissions_officer', 'accountant', 'librarian'];
export const ACAD_ADMIN: RoleName[] = ['tenant_admin', 'principal'];

const RaiseBody = z.object({ kind: z.enum(REQUEST_KINDS), studentId: z.uuid().optional(), reason: z.string().trim().max(2000).default(''), payload: z.record(z.string(), z.unknown()).default({}) });
const DecideBody = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(1000).optional(), sectionId: z.uuid().optional() });

/** Academic approval requests (handover, section change, TC, timetable change, substitution) and the module settings. */
@Controller('v1/academics')
export class AcademicRequestsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: AcademicsService,
  ) {}

  @Get('requests')
  @Auth('user', [...ACAD_STAFF, 'guardian'])
  list(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string, @Query('kind') kind?: string, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const staff = p.roles.some((r) => ACAD_STAFF.includes(r));
      const mine: SQL | undefined = staff ? undefined : inArray(academicRequests.studentId, await this.familyStudents(p, tx));
      const requester = alias(users, 'requester');
      const rows = await tx
        .select({ r: academicRequests, student: students.fullName, rollNo: students.rollNo, section: sections.displayName, requester: requester.fullName })
        .from(academicRequests)
        .leftJoin(students, eq(students.id, academicRequests.studentId))
        .leftJoin(sections, eq(sections.id, students.sectionId))
        .innerJoin(requester, eq(requester.id, academicRequests.requestedBy))
        .where(and(mine, status ? eq(academicRequests.status, status) : undefined, kind ? eq(academicRequests.kind, kind) : undefined, studentId ? eq(academicRequests.studentId, studentId) : undefined))
        .orderBy(desc(academicRequests.createdAt))
        .limit(500);
      return rows.map((x) => ({ ...x.r, student: x.student, rollNo: x.rollNo, section: x.section, requester: x.requester, canDecide: x.r.status === 'pending' && canDecideStep(x.r.kind as RequestKind, x.r.steps, p.roles) }));
    });
  }

  /** A guardian's children (a placeholder id when none, so `inArray` matches nothing). */
  private async familyStudents(p: UserPrincipal, tx: Tx) {
    const rows = await tx.select({ id: guardians.studentId }).from(guardians).where(eq(guardians.userId, p.userId));
    return rows.length ? rows.map((r) => r.id) : ['00000000-0000-0000-0000-000000000000'];
  }

  @Get('requests/:id')
  @Auth('user', [...ACAD_STAFF, 'guardian'])
  get(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(academicRequests).where(eq(academicRequests.id, id));
      if (!r) throw new NotFoundException('Request not found');
      const staff = p.roles.some((x) => ACAD_STAFF.includes(x));
      if (!staff && (!r.studentId || !(await this.familyStudents(p, tx)).includes(r.studentId))) throw new NotFoundException('Request not found');
      const [student] = r.studentId
        ? await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, status: students.status, section: sections.displayName, sectionId: sections.id }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, r.studentId))
        : [];
      const [requester] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, r.requestedBy));
      return { ...r, student: student ?? null, requester: requester?.fullName ?? '', canDecide: r.status === 'pending' && canDecideStep(r.kind as RequestKind, r.steps, p.roles), canCancel: r.status === 'pending' && r.requestedBy === p.userId, activity: await this.svc.activity(tx, [id]) };
    });
  }

  @Post('requests')
  @Auth('user', [...ACAD_STAFF, 'guardian'])
  raise(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RaiseBody)) b: z.infer<typeof RaiseBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.raise(tx, p, b.kind, { studentId: b.studentId, reason: b.reason, payload: b.payload }));
  }

  @Post('requests/:id/decide')
  @HttpCode(200)
  @Auth('user', ACAD_STAFF)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.decide(tx, p, id, b.decision, b.note, b.sectionId ? { sectionId: b.sectionId } : {}));
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  @Auth('user', [...ACAD_STAFF, 'guardian'])
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(academicRequests).where(eq(academicRequests.id, id)).for('update');
      if (!r) throw new NotFoundException('Request not found');
      if (r.requestedBy !== p.userId) throw new ForbiddenException('Only the person who raised it can cancel it');
      if (r.status !== 'pending') throw new ConflictException('This request is already closed');
      const [row] = await tx.update(academicRequests).set({ status: 'cancelled', decidedAt: this.svc.now(), version: r.version + 1 }).where(eq(academicRequests.id, id)).returning();
      await auditUser(tx, p, 'academics.request_cancelled', 'academic_request', id);
      return row;
    });
  }

  /** Enrolled students that admissions has not yet handed over to the academic office. */
  @Get('handover/pending')
  @Auth('user', ACAD_STAFF)
  pendingHandover(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, section: sections.displayName, sectionId: sections.id, enrolledOn: students.enrolledOn })
        .from(students)
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(and(eq(students.status, 'enrolled'), notExists(tx.select({ id: academicRequests.id }).from(academicRequests).where(and(eq(academicRequests.studentId, students.id), eq(academicRequests.kind, 'admission_handover'), eq(academicRequests.status, 'pending'))))))
        .orderBy(students.fullName),
    );
  }

  @Get('settings')
  @Auth('user', ACAD_STAFF)
  settings(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => Object.fromEntries(await Promise.all(SETTINGS_KINDS.map(async (k) => [k, await this.svc.settings(tx, k)] as const))));
  }

  @Put('settings/:kind')
  @Auth('user', ACAD_ADMIN)
  save(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string, @Body() body: unknown) {
    if (!SETTINGS_KINDS.includes(kind as SettingsKind)) throw new NotFoundException('Unknown settings');
    return this.db.withTenant(p.tenantId, (tx) => this.svc.saveSettings(tx, p, kind as SettingsKind, body));
  }
}
