import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { academicTerms, courseOfferings, courseRegistrations, OFFERING_CATEGORIES, registrationWindows, students, subjects, timetableSlots, users } from '../db/schema.js';
import { checkVersion, found, hasRole } from '../placements/placements.access.js';
import { CourseRegistrationService } from './course-registration.service.js';
import { refusal, REFUSAL_TEXT, totalCredits } from './registration-rules.js';

/** Who sets up offerings and windows, runs allocation and reads the registration lists. */
export const REGISTRATION_ADMIN: RoleName[] = ['tenant_admin', 'principal', 'hod'];
/** Who approves registrations. */
export const REGISTRATION_APPROVERS: RoleName[] = ['tenant_admin', 'principal', 'hod'];

const Uuids = z.array(z.uuid()).max(40);
const OfferingBody = z.object({
  termId: z.uuid(),
  subjectId: z.uuid(),
  category: z.enum(OFFERING_CATEGORIES),
  credits: z.number().min(0).max(30),
  seatCap: z.number().int().min(0).max(5000),
  facultyId: z.uuid().nullable().optional(),
  slotIds: Uuids.default([]),
  eligibleProgramIds: Uuids.nullable().optional(),
  eligibleSemesters: z.array(z.number().int().min(1).max(20)).max(20).nullable().optional(),
  prerequisiteSubjectId: z.uuid().nullable().optional(),
});
const OfferingPatch = OfferingBody.omit({ termId: true, subjectId: true }).partial().extend({ status: z.enum(['open', 'closed']).optional(), expectedVersion: z.number().int().optional() });
const WindowBody = z
  .object({
    termId: z.uuid(),
    programId: z.uuid().nullable().default(null),
    opensAt: z.coerce.date(),
    closesAt: z.coerce.date(),
    addDropUntil: z.coerce.date(),
    minCredits: z.number().min(0).max(100).default(0),
    maxCredits: z.number().min(0).max(100),
    allocationRule: z.enum(['cgpa', 'time']).default('cgpa'),
  })
  .refine((w) => w.opensAt < w.closesAt && w.closesAt <= w.addDropUntil, { message: 'Dates must run opens, closes, add/drop deadline' })
  .refine((w) => w.minCredits <= w.maxCredits, { message: 'The minimum credits cannot exceed the maximum' });
const AllocateBody = z.object({ termId: z.uuid(), programId: z.uuid().optional(), coursesPerStudent: z.number().int().min(1).max(10).default(1) });
const DecideBody = z.object({ registrationIds: z.array(z.uuid()).min(1).max(200), decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional() });
const PreferencesBody = z.object({ termId: z.uuid(), offeringIds: z.array(z.uuid()).max(10) });

/** Offering and window setup, allocation, approval and rosters for staff. */
@Controller('v1/course-registration')
export class CourseRegistrationController {
  constructor(
    private readonly db: DbService,
    private readonly svc: CourseRegistrationService,
  ) {}

  @Get('terms')
  @Auth('user', ['tenant_admin', 'principal', 'hod', 'student'])
  terms(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(academicTerms).orderBy(asc(academicTerms.startsOn)));
  }

  /** The offerings a teacher teaches, every term, newest term first (Teacher App rosters). */
  @Get('me/teaching')
  @Auth('user', TEACHING_ROLES)
  teaching(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: courseOfferings.id, termId: courseOfferings.termId, term: academicTerms.name, facultyId: courseOfferings.facultyId, code: subjects.code, name: subjects.name, category: courseOfferings.category, credits: courseOfferings.credits, seatCap: courseOfferings.seatCap })
        .from(courseOfferings)
        .innerJoin(subjects, eq(subjects.id, courseOfferings.subjectId))
        .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.termId))
        .where(eq(courseOfferings.facultyId, p.userId))
        .orderBy(desc(academicTerms.startsOn), asc(subjects.code)),
    );
  }

  @Get('offerings')
  @Auth('user', REGISTRATION_ADMIN)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('termId', ParseUUIDPipe) termId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ o: courseOfferings, code: subjects.code, name: subjects.name, faculty: users.fullName })
        .from(courseOfferings)
        .innerJoin(subjects, eq(subjects.id, courseOfferings.subjectId))
        .leftJoin(users, eq(users.id, courseOfferings.facultyId))
        .where(eq(courseOfferings.termId, termId))
        .orderBy(asc(subjects.code));
      const counts = await tx
        .select({ offeringId: courseRegistrations.offeringId, status: courseRegistrations.status, n: sql<number>`count(*)::int` })
        .from(courseRegistrations)
        .where(eq(courseRegistrations.termId, termId))
        .groupBy(courseRegistrations.offeringId, courseRegistrations.status);
      const n = (id: string, st: string) => counts.find((c) => c.offeringId === id && c.status === st)?.n ?? 0;
      return rows.map((r) => ({ ...r.o, subjectCode: r.code, subjectName: r.name, facultyName: r.faculty, registered: n(r.o.id, 'registered'), waitlisted: n(r.o.id, 'waitlisted'), preferences: n(r.o.id, 'preference') }));
    });
  }

  private async checkRefs(tx: Tx, b: Partial<z.infer<typeof OfferingBody>>) {
    if (b.slotIds?.length) {
      const have = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(inArray(timetableSlots.id, b.slotIds));
      if (have.length !== new Set(b.slotIds).size) throw new ConflictException('One of the timetable slots does not exist');
    }
    for (const sid of [b.subjectId, b.prerequisiteSubjectId]) {
      if (!sid) continue;
      found((await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, sid)))[0], 'Subject');
    }
    if (b.prerequisiteSubjectId && b.prerequisiteSubjectId === b.subjectId) throw new ConflictException('A course cannot be its own prerequisite');
  }

  @Post('offerings')
  @Auth('user', REGISTRATION_ADMIN)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(OfferingBody)) b: z.infer<typeof OfferingBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: academicTerms.id }).from(academicTerms).where(eq(academicTerms.id, b.termId)))[0], 'Term');
      await this.checkRefs(tx, b);
      await this.svc.checkDepartment(tx, p, [b.subjectId]);
      const dup = await tx.select({ id: courseOfferings.id }).from(courseOfferings).where(and(eq(courseOfferings.termId, b.termId), eq(courseOfferings.subjectId, b.subjectId)));
      if (dup.length) throw new ConflictException('This subject is already offered in the term');
      const [row] = await tx.insert(courseOfferings).values({ tenantId: p.tenantId, ...b, facultyId: b.facultyId ?? null, eligibleProgramIds: b.eligibleProgramIds ?? null, eligibleSemesters: b.eligibleSemesters ?? null, prerequisiteSubjectId: b.prerequisiteSubjectId ?? null }).returning();
      await auditUser(tx, p, 'course_offering.created', 'course_offering', row.id, { subjectId: b.subjectId, termId: b.termId });
      return row;
    });
  }

  @Patch('offerings/:id')
  @Auth('user', REGISTRATION_ADMIN)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(OfferingPatch)) b: z.infer<typeof OfferingPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [cur] = await tx.select().from(courseOfferings).where(eq(courseOfferings.id, id)).for('update');
      const o = found(cur, 'Offering');
      checkVersion(o.version, b.expectedVersion);
      await this.svc.checkDepartment(tx, p, [o.subjectId]);
      await this.checkRefs(tx, { ...b, subjectId: o.subjectId });
      const { expectedVersion: _v, ...patch } = b;
      if (patch.seatCap !== undefined && patch.seatCap < (await this.svc.seatsTaken(tx, id))) throw new ConflictException('The seat limit is below the seats already filled');
      const [row] = await tx.update(courseOfferings).set({ ...patch, version: o.version + 1 }).where(eq(courseOfferings.id, id)).returning();
      if (patch.seatCap !== undefined && patch.seatCap > o.seatCap) await this.svc.promote(tx, row);
      await auditUser(tx, p, 'course_offering.updated', 'course_offering', id, patch);
      return row;
    });
  }

  @Get('offerings/:id/roster')
  @Auth('user', [...REGISTRATION_ADMIN, 'teacher'])
  roster(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const o = found((await tx.select().from(courseOfferings).where(eq(courseOfferings.id, id)))[0], 'Offering');
      if (!hasRole(p, REGISTRATION_ADMIN) && o.facultyId !== p.userId) throw new ForbiddenException('Only the faculty of this course can see its roster');
      const rows = await tx
        .select({ r: courseRegistrations, fullName: students.fullName, rollNo: students.rollNo })
        .from(courseRegistrations)
        .innerJoin(students, eq(students.id, courseRegistrations.studentId))
        .where(and(eq(courseRegistrations.offeringId, id), inArray(courseRegistrations.status, ['registered', 'waitlisted'])))
        .orderBy(asc(courseRegistrations.status), asc(courseRegistrations.waitlistPos), asc(students.rollNo));
      return { offering: o, students: rows.map((x) => ({ registrationId: x.r.id, studentId: x.r.studentId, fullName: x.fullName, rollNo: x.rollNo, status: x.r.status, approval: x.r.approval, waitlistPos: x.r.waitlistPos, autoCore: x.r.autoCore })) };
    });
  }

  @Get('windows')
  @Auth('user', REGISTRATION_ADMIN)
  windows(@CurrentPrincipal() p: UserPrincipal, @Query('termId', ParseUUIDPipe) termId: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(registrationWindows).where(eq(registrationWindows.termId, termId)));
  }

  /** Creates or replaces the window of a term for one program (or all programs). */
  @Put('windows')
  @Auth('user', ['tenant_admin', 'principal'])
  putWindow(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(WindowBody)) b: z.infer<typeof WindowBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: academicTerms.id }).from(academicTerms).where(eq(academicTerms.id, b.termId)))[0], 'Term');
      const same = await tx.select().from(registrationWindows).where(eq(registrationWindows.termId, b.termId));
      const cur = same.find((w) => w.programId === b.programId);
      const [row] = cur ? await tx.update(registrationWindows).set(b).where(eq(registrationWindows.id, cur.id)).returning() : await tx.insert(registrationWindows).values({ tenantId: p.tenantId, ...b }).returning();
      await auditUser(tx, p, 'registration_window.saved', 'registration_window', row.id, { termId: b.termId, programId: b.programId });
      return row;
    });
  }

  /** Runs the preference allocation for a term. Safe to run again: only ranked preferences are processed. */
  @Post('allocate')
  @Auth('user', REGISTRATION_ADMIN)
  @HttpCode(200)
  allocate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AllocateBody)) b: z.infer<typeof AllocateBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.allocate(tx, p, b.termId, { programId: b.programId, perStudent: b.coursesPerStudent }));
  }

  @Get('approvals')
  @Auth('user', REGISTRATION_APPROVERS)
  approvals(@CurrentPrincipal() p: UserPrincipal, @Query('termId', ParseUUIDPipe) termId: string, @Query('status') status = 'pending') {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ r: courseRegistrations, fullName: students.fullName, rollNo: students.rollNo, code: subjects.code, name: subjects.name, credits: courseOfferings.credits, category: courseOfferings.category, departmentId: subjects.departmentId })
        .from(courseRegistrations)
        .innerJoin(students, eq(students.id, courseRegistrations.studentId))
        .innerJoin(courseOfferings, eq(courseOfferings.id, courseRegistrations.offeringId))
        .innerJoin(subjects, eq(subjects.id, courseOfferings.subjectId))
        .where(and(eq(courseRegistrations.termId, termId), eq(courseRegistrations.status, 'registered'), status === 'all' ? undefined : eq(courseRegistrations.approval, status as 'pending')))
        .orderBy(asc(students.rollNo), asc(subjects.code));
      return rows.map((x) => ({ ...x.r, studentName: x.fullName, rollNo: x.rollNo, subjectCode: x.code, subjectName: x.name, credits: x.credits, category: x.category }));
    });
  }

  @Post('approvals/decide')
  @Auth('user', REGISTRATION_APPROVERS)
  @HttpCode(200)
  decide(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.decide(tx, p, b.registrationIds, b.decision, b.note));
  }
}

/** The Student App side: browse offerings, register, rank preferences, drop. */
@Controller('v1/course-registration/me')
export class MyCourseRegistrationController {
  constructor(
    private readonly db: DbService,
    private readonly svc: CourseRegistrationService,
  ) {}

  /** Offerings of a term with seats left, whether this student may take each, and their own status in it. */
  @Get('offerings')
  @Auth('user', ['student'])
  offerings(@CurrentPrincipal() p: UserPrincipal, @Query('termId', ParseUUIDPipe) termId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.svc.ownStudent(tx, p);
      const me = await this.svc.profile(tx, sid);
      const w = await this.svc.windowFor(tx, termId, me.programId);
      const rows = await tx
        .select({ o: courseOfferings, code: subjects.code, name: subjects.name, faculty: users.fullName })
        .from(courseOfferings)
        .innerJoin(subjects, eq(subjects.id, courseOfferings.subjectId))
        .leftJoin(users, eq(users.id, courseOfferings.facultyId))
        .where(eq(courseOfferings.termId, termId))
        .orderBy(asc(subjects.code));
      const facts = await this.svc.facts(tx, rows.map((r) => r.o));
      const held = await this.svc.held(tx, sid, termId);
      const mine = new Map((await tx.select().from(courseRegistrations).where(and(eq(courseRegistrations.studentId, sid), eq(courseRegistrations.termId, termId)))).map((r) => [r.offeringId, r]));
      const out = [];
      for (const r of rows) {
        const taken = await this.svc.seatsTaken(tx, r.o.id);
        const mineRow = mine.get(r.o.id);
        const why = mineRow?.status === 'registered' ? null : refusal(facts.get(r.o.id)!, me, held.facts, taken, w?.maxCredits ?? 0);
        const base = refusal(facts.get(r.o.id)!, me, [], 0, Number.MAX_SAFE_INTEGER, { ignoreSeats: true, ignoreCredits: true });
        out.push({
          offeringId: r.o.id,
          subjectCode: r.code,
          subjectName: r.name,
          category: r.o.category,
          credits: r.o.credits,
          facultyName: r.faculty,
          seatCap: r.o.seatCap,
          seatsLeft: Math.max(0, r.o.seatCap - taken),
          eligible: base === null,
          blockedBy: why,
          blockedText: why ? REFUSAL_TEXT[why] : null,
          myStatus: mineRow?.status ?? null,
          myRank: mineRow?.preferenceRank ?? null,
          myApproval: mineRow?.approval ?? null,
        });
      }
      return { window: w, offerings: out };
    });
  }

  @Get('registrations')
  @Auth('user', ['student'])
  registrations(@CurrentPrincipal() p: UserPrincipal, @Query('termId', ParseUUIDPipe) termId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.svc.ownStudent(tx, p);
      const me = await this.svc.profile(tx, sid);
      const rows = await tx
        .select({ r: courseRegistrations, code: subjects.code, name: subjects.name, credits: courseOfferings.credits, category: courseOfferings.category })
        .from(courseRegistrations)
        .innerJoin(courseOfferings, eq(courseOfferings.id, courseRegistrations.offeringId))
        .innerJoin(subjects, eq(subjects.id, courseOfferings.subjectId))
        .where(and(eq(courseRegistrations.studentId, sid), eq(courseRegistrations.termId, termId), sql`${courseRegistrations.status} <> 'dropped'`))
        .orderBy(asc(subjects.code));
      const w = await this.svc.windowFor(tx, termId, me.programId);
      const regs = rows.filter((x) => x.r.status === 'registered');
      return {
        window: w,
        registeredCredits: totalCredits(regs.map((x) => ({ credits: x.credits }))),
        approvedCredits: totalCredits(regs.filter((x) => x.r.approval === 'approved').map((x) => ({ credits: x.credits }))),
        minCredits: w?.minCredits ?? 0,
        maxCredits: w?.maxCredits ?? 0,
        registrations: rows.map((x) => ({ ...x.r, subjectCode: x.code, subjectName: x.name, credits: x.credits, category: x.category })),
      };
    });
  }

  /** Adds the mandatory core courses, then registers for the offering. */
  @Post('register')
  @Auth('user', ['student'])
  @HttpCode(200)
  register(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ offeringId: z.uuid() }))) b: { offeringId: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => this.svc.register(tx, p.tenantId, await this.svc.ownStudent(tx, p), b.offeringId, { actor: p }));
  }

  @Post('core')
  @Auth('user', ['student'])
  @HttpCode(200)
  core(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ termId: z.uuid() }))) b: { termId: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => this.svc.enrollCore(tx, p.tenantId, await this.svc.ownStudent(tx, p), b.termId));
  }

  @Post('drop')
  @Auth('user', ['student'])
  @HttpCode(200)
  drop(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ offeringId: z.uuid() }))) b: { offeringId: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => this.svc.drop(tx, p, await this.svc.ownStudent(tx, p), b.offeringId));
  }

  /** Ranks electives for oversubscribed courses; the first id is the most wanted. */
  @Put('preferences')
  @Auth('user', ['student'])
  preferences(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PreferencesBody)) b: z.infer<typeof PreferencesBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => this.svc.setPreferences(tx, p, await this.svc.ownStudent(tx, p), b.termId, [...new Set(b.offeringIds)]));
  }
}
