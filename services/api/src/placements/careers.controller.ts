import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day, orConflict } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { alumniEventRsvps, alumniEvents, alumniProfiles, internshipDiary, internships, mentoringRequests, userRoles, students } from '../db/schema.js';
import { canMoveInternship } from './eligibility.js';
import { MENTOR_ROLES, PLACEMENT_ROLES, PLACEMENT_VIEW_ROLES, checkVersion, found, hasRole } from './placements.access.js';
import { PlacementsService } from './placements.service.js';

const Opt = (n: number) => z.string().trim().max(n).optional();
const InternBody = z.object({
  studentId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  orgName: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(160),
  startsOn: Day,
  endsOn: Day,
  stipendMonthly: z.number().int().min(0).max(1_000_000).optional(),
  industryMentor: Opt(120),
});
const EvalBody = z.object({ score: z.number().min(0).max(100), remarks: z.string().trim().max(2000).default(''), employerFeedback: Opt(2000), expectedVersion: z.number().int().optional() });
const DiaryBody = z.object({ entryDate: Day, entry: z.string().trim().min(1).max(4000), evidenceRef: Opt(300) });
const AlumniBody = z.object({
  studentId: z.uuid().optional(),
  fullName: z.string().trim().min(1).max(120),
  graduationYear: z.number().int().min(1950).max(2100),
  program: z.string().trim().max(120).default(''),
  email: z.email().optional(),
  phone: Opt(30),
  employer: Opt(120),
  designation: Opt(120),
  city: Opt(80),
  bio: z.string().trim().max(1500).default(''),
  directoryVisible: z.boolean().default(false),
  mentorAvailable: z.boolean().default(false),
});
const EventBody = z.object({ title: z.string().trim().min(1).max(160), startsOn: Day, venue: z.string().trim().max(160).default(''), description: z.string().trim().max(2000).default('') });

/** Internship register (mentor, diary, evaluation) and the alumni directory, events and mentoring. */
@Controller('v1/placements')
export class CareersController {
  constructor(
    private readonly db: DbService,
    private readonly svc: PlacementsService,
  ) {}

  // ---- internships --------------------------------------------------------------------------

  private async canSee(tx: Tx, p: UserPrincipal, i: typeof internships.$inferSelect, write = false) {
    if (hasRole(p, write ? PLACEMENT_ROLES : PLACEMENT_VIEW_ROLES) || i.mentorUserId === p.userId) return;
    if (!write && (await this.svc.visibleStudents(tx, p)).includes(i.studentId)) return;
    throw new NotFoundException('Internship not found');
  }

  @Get('internships')
  @Auth('user', MENTOR_ROLES)
  listInternships(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const all = hasRole(p, PLACEMENT_VIEW_ROLES);
      const rows = await tx
        .select({ i: internships, fullName: students.fullName, rollNo: students.rollNo })
        .from(internships)
        .innerJoin(students, eq(students.id, internships.studentId))
        .where(and(all ? undefined : eq(internships.mentorUserId, p.userId), status ? eq(internships.status, status) : undefined))
        .orderBy(desc(internships.startsOn));
      return rows.map((r) => ({ ...r.i, fullName: r.fullName, rollNo: r.rollNo }));
    });
  }

  /** The placement cell registers an internship; a student proposes their own (it then needs approval). */
  @Post('internships')
  @Auth('user', [...PLACEMENT_ROLES, 'student'])
  createInternship(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(InternBody)) b: z.infer<typeof InternBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      let studentId = b.studentId;
      if (!hasRole(p, PLACEMENT_ROLES)) {
        const me = await this.svc.ownStudent(tx, p);
        if (!me || (studentId && studentId !== me.id)) throw new ForbiddenException('Students propose their own internship');
        studentId = me.id;
      }
      if (!studentId) throw new ConflictException('studentId is required');
      if (b.endsOn < b.startsOn) throw new ConflictException('The end date is before the start date');
      found((await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId)))[0], 'Student');
      const { studentId: _s, ...rest } = b;
      const [row] = await tx.insert(internships).values({ tenantId: p.tenantId, studentId, ...rest }).returning();
      await auditUser(tx, p, 'internship.created', 'internship', row.id, { studentId, orgName: b.orgName });
      return row;
    });
  }

  @Post('internships/:id/status')
  @Auth('user', PLACEMENT_ROLES)
  @HttpCode(200)
  moveInternship(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ status: z.enum(['approved', 'ongoing', 'completed', 'cancelled']) }))) b: { status: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const i = found((await tx.select().from(internships).where(eq(internships.id, id)).for('update'))[0], 'Internship');
      if (!canMoveInternship(i.status, b.status)) throw new ConflictException(`A ${i.status} internship cannot become ${b.status}`);
      if (b.status === 'approved' && !i.mentorUserId) throw new ConflictException('Assign a faculty mentor before approving');
      if (b.status === 'completed' && i.evaluationScore === null) throw new ConflictException('Record the evaluation before completing');
      const [row] = await tx.update(internships).set({ status: b.status, version: i.version + 1 }).where(eq(internships.id, id)).returning();
      await auditUser(tx, p, `internship.${b.status}`, 'internship', id, { from: i.status });
      await this.svc.notifyStudent(tx, i.studentId, i.title, `Internship ${b.status}`, `internship:${id}:${b.status}`);
      return row;
    });
  }

  @Put('internships/:id/mentor')
  @Auth('user', PLACEMENT_ROLES)
  assignMentor(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ mentorUserId: z.uuid() }))) b: { mentorUserId: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [m] = await tx.select({ role: userRoles.role }).from(userRoles).where(and(eq(userRoles.userId, b.mentorUserId), sql`${userRoles.role} in ('teacher', 'hod', 'principal')`));
      if (!m) throw new ConflictException('The mentor must be a faculty member');
      const [row] = await tx.update(internships).set({ mentorUserId: b.mentorUserId }).where(eq(internships.id, id)).returning();
      await auditUser(tx, p, 'internship.mentor_assigned', 'internship', id, b);
      return found(row, 'Internship');
    });
  }

  @Post('internships/:id/evaluation')
  @Auth('user', MENTOR_ROLES)
  @HttpCode(200)
  evaluate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(EvalBody)) b: z.infer<typeof EvalBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const i = found((await tx.select().from(internships).where(eq(internships.id, id)).for('update'))[0], 'Internship');
      if (!hasRole(p, PLACEMENT_ROLES) && i.mentorUserId !== p.userId) throw new NotFoundException('Internship not found');
      checkVersion(i.version, b.expectedVersion);
      if (!['ongoing', 'completed'].includes(i.status)) throw new ConflictException('Only a running or finished internship can be evaluated');
      const [row] = await tx.update(internships).set({ evaluationScore: b.score, evaluationRemarks: b.remarks, employerFeedback: b.employerFeedback ?? i.employerFeedback, evaluatedBy: p.userId, version: i.version + 1 }).where(eq(internships.id, id)).returning();
      await auditUser(tx, p, 'internship.evaluated', 'internship', id, { score: b.score });
      return row;
    });
  }

  @Get('internships/:id/diary')
  @Auth('user')
  diary(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.canSee(tx, p, found((await tx.select().from(internships).where(eq(internships.id, id)))[0], 'Internship'));
      return tx.select().from(internshipDiary).where(eq(internshipDiary.internshipId, id)).orderBy(asc(internshipDiary.entryDate));
    });
  }

  /** The intern writes a daily diary entry (one per day; writing again replaces it) while the internship runs. */
  @Post('internships/:id/diary')
  @Auth('user', ['student'])
  @HttpCode(200)
  addDiary(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DiaryBody)) b: z.infer<typeof DiaryBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const i = found((await tx.select().from(internships).where(eq(internships.id, id)))[0], 'Internship');
      const me = await this.svc.ownStudent(tx, p);
      if (!me || me.id !== i.studentId) throw new NotFoundException('Internship not found');
      if (i.status !== 'ongoing') throw new ConflictException('The diary is open while the internship is ongoing');
      if (b.entryDate < i.startsOn || b.entryDate > i.endsOn) throw new ConflictException('That day is outside the internship');
      const [row] = await tx.insert(internshipDiary).values({ tenantId: p.tenantId, internshipId: id, ...b }).onConflictDoUpdate({ target: [internshipDiary.internshipId, internshipDiary.entryDate], set: { entry: b.entry, evidenceRef: b.evidenceRef ?? null } }).returning();
      return row;
    });
  }

  // ---- alumni -------------------------------------------------------------------------------

  /** Staff see every profile with contact details; students and parents see only consenting, mentor-ready or visible profiles, without contacts. */
  @Get('alumni')
  @Auth('user')
  alumni(@CurrentPrincipal() p: UserPrincipal, @Query('year') year?: string, @Query('mentors') mentors?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const staff = hasRole(p, PLACEMENT_VIEW_ROLES);
      const rows = await tx
        .select()
        .from(alumniProfiles)
        .where(and(staff ? undefined : eq(alumniProfiles.directoryVisible, true), year ? eq(alumniProfiles.graduationYear, Number(year)) : undefined, mentors === 'true' ? eq(alumniProfiles.mentorAvailable, true) : undefined))
        .orderBy(desc(alumniProfiles.graduationYear), asc(alumniProfiles.fullName));
      return staff ? rows : rows.map(({ email: _e, phone: _p, studentId: _s, ...r }) => r);
    });
  }

  @Post('alumni')
  @Auth('user', PLACEMENT_ROLES)
  createAlumni(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AlumniBody)) b: z.infer<typeof AlumniBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await orConflict('That student already has an alumni profile', () => tx.insert(alumniProfiles).values({ tenantId: p.tenantId, ...b }).returning());
      await auditUser(tx, p, 'alumni.created', 'alumni', row.id, { fullName: b.fullName });
      return row;
    });
  }

  @Put('alumni/:id')
  @Auth('user', PLACEMENT_ROLES)
  updateAlumni(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AlumniBody)) b: z.infer<typeof AlumniBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(alumniProfiles).set(b).where(eq(alumniProfiles.id, id)).returning();
      await auditUser(tx, p, 'alumni.updated', 'alumni', id, { directoryVisible: b.directoryVisible });
      return found(row, 'Alumni profile');
    });
  }

  @Get('alumni-events')
  @Auth('user')
  events(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select({ e: alumniEvents, rsvps: sql<number>`(select count(*)::int from alumni_event_rsvps r where r.event_id = ${alumniEvents.id})` }).from(alumniEvents).orderBy(desc(alumniEvents.startsOn)).then((rows) => rows.map((r) => ({ ...r.e, rsvps: r.rsvps }))),
    );
  }

  @Post('alumni-events')
  @Auth('user', PLACEMENT_ROLES)
  createEvent(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(EventBody)) b: z.infer<typeof EventBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(alumniEvents).values({ tenantId: p.tenantId, createdBy: p.userId, ...b }).returning();
      await auditUser(tx, p, 'alumni.event_created', 'alumni_event', row.id, { title: b.title });
      return row;
    });
  }

  @Post('alumni-events/:id/rsvps')
  @Auth('user', PLACEMENT_ROLES)
  @HttpCode(200)
  rsvp(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ alumniId: z.uuid() }))) b: { alumniId: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = found((await tx.select().from(alumniEvents).where(eq(alumniEvents.id, id)))[0], 'Event');
      if (e.status !== 'scheduled') throw new ConflictException('This event is not open for RSVPs');
      found((await tx.select({ id: alumniProfiles.id }).from(alumniProfiles).where(eq(alumniProfiles.id, b.alumniId)))[0], 'Alumni profile');
      await tx.insert(alumniEventRsvps).values({ tenantId: p.tenantId, eventId: id, alumniId: b.alumniId }).onConflictDoNothing();
      await auditUser(tx, p, 'alumni.rsvp', 'alumni_event', id, b);
      return { eventId: id, alumniId: b.alumniId };
    });
  }

  // ---- mentoring ----------------------------------------------------------------------------

  @Post('mentoring-requests')
  @Auth('user', ['student'])
  requestMentor(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ alumniId: z.uuid(), topic: z.string().trim().min(1).max(160), message: z.string().trim().max(1000).default('') }))) b: { alumniId: string; topic: string; message: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.svc.ownStudent(tx, p);
      if (!me) throw new ForbiddenException('Only students can request a mentor');
      const a = found((await tx.select().from(alumniProfiles).where(eq(alumniProfiles.id, b.alumniId)))[0], 'Alumni profile');
      if (!a.directoryVisible || !a.mentorAvailable) throw new ConflictException('This alumnus is not taking mentees');
      const [open] = await tx.select({ id: mentoringRequests.id }).from(mentoringRequests).where(and(eq(mentoringRequests.studentId, me.id), eq(mentoringRequests.alumniId, b.alumniId), eq(mentoringRequests.status, 'pending')));
      if (open) throw new ConflictException('You already have a pending request with this alumnus');
      const [row] = await tx.insert(mentoringRequests).values({ tenantId: p.tenantId, studentId: me.id, ...b }).returning();
      await auditUser(tx, p, 'mentoring.requested', 'mentoring_request', row.id, { alumniId: b.alumniId });
      return row;
    });
  }

  @Get('mentoring-requests')
  @Auth('user', [...PLACEMENT_VIEW_ROLES, 'student'])
  mentoring(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const mine = hasRole(p, PLACEMENT_VIEW_ROLES) ? null : (await this.svc.ownStudent(tx, p))?.id;
      if (mine === undefined) return [];
      const rows = await tx
        .select({ m: mentoringRequests, alumnus: alumniProfiles.fullName, student: students.fullName })
        .from(mentoringRequests)
        .innerJoin(alumniProfiles, eq(alumniProfiles.id, mentoringRequests.alumniId))
        .innerJoin(students, eq(students.id, mentoringRequests.studentId))
        .where(mine ? eq(mentoringRequests.studentId, mine) : undefined)
        .orderBy(desc(mentoringRequests.createdAt));
      return rows.map((r) => ({ ...r.m, alumnus: r.alumnus, student: r.student }));
    });
  }

  /** The placement cell records the alumnus's answer (alumni do not sign in yet). */
  @Post('mentoring-requests/:id/respond')
  @Auth('user', PLACEMENT_ROLES)
  @HttpCode(200)
  respondMentoring(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ status: z.enum(['accepted', 'declined', 'completed']) }))) b: { status: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const m = found((await tx.select().from(mentoringRequests).where(eq(mentoringRequests.id, id)).for('update'))[0], 'Request');
      const ok = (m.status === 'pending' && b.status !== 'completed') || (m.status === 'accepted' && b.status === 'completed');
      if (!ok) throw new ConflictException(`A ${m.status} request cannot become ${b.status}`);
      const [row] = await tx.update(mentoringRequests).set({ status: b.status, respondedAt: new Date() }).where(eq(mentoringRequests.id, id)).returning();
      await auditUser(tx, p, `mentoring.${b.status}`, 'mentoring_request', id);
      await this.svc.notifyStudent(tx, m.studentId, 'Mentoring request', `Your request was ${b.status}`, `mentoring:${id}:${b.status}`);
      return row;
    });
  }
}
