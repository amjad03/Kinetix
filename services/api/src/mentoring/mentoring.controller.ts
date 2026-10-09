import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { learningFacts, type LearningFacts } from '../ai/learning-facts.js';
import { auditUser } from '../common/audit.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { TasksService } from '../tasks/tasks.service.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { interventionPlans, mentorAssignments, mentoringSessions, sections, students, userRoles, users } from '../db/schema.js';
import { TeacherService } from '../teacher/teacher.service.js';
import { found, hasRole } from '../placements/placements.access.js';
import { MENTORING_ADMIN, MENTOR_CANDIDATE_ROLES, NOTES_ROLES } from './mentoring-rules.js';
import { MentoringService } from './mentoring.service.js';

const READERS: RoleName[] = [...MENTORING_ADMIN, 'teacher', 'counsellor'];
const day = z.iso.date();
type Session = typeof mentoringSessions.$inferSelect;

/** Mentor-mentee assignment, sessions with private notes, risk signals and intervention plans (spec section 41). */
@Controller('v1/mentoring')
export class MentoringController {
  constructor(
    private readonly db: DbService,
    private readonly svc: MentoringService,
    private readonly teacher: TeacherService,
    private readonly events: EventBus,
    private readonly tasks: TasksService,
  ) {}

  private isAdmin(p: UserPrincipal) {
    return hasRole(p, MENTORING_ADMIN);
  }

  /** The student may be read by admins and counsellors, or by their current mentor. */
  private async canRead(tx: Tx, p: UserPrincipal, studentId: string) {
    if (this.isAdmin(p) || hasRole(p, ['counsellor'])) return true;
    return (await this.svc.openAssignment(tx, studentId))?.mentorUserId === p.userId;
  }

  private async mustMentor(tx: Tx, p: UserPrincipal, studentId: string) {
    found((await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId)))[0], 'Student');
    const a = await this.svc.openAssignment(tx, studentId);
    if (a?.mentorUserId !== p.userId) throw new ForbiddenException('Only the mentor of this student can do this');
    return a;
  }

  private async mustBeMentorCandidate(tx: Tx, userId: string) {
    const r = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
    if (!r.some((x) => MENTOR_CANDIDATE_ROLES.includes(x.role))) throw new ConflictException('That person cannot be a mentor');
  }

  private async assign(tx: Tx, p: UserPrincipal, studentId: string, mentorUserId: string, today: string) {
    const open = await this.svc.openAssignment(tx, studentId);
    if (open?.mentorUserId === mentorUserId) return open;
    if (open) await tx.update(mentorAssignments).set({ endedOn: today }).where(eq(mentorAssignments.id, open.id));
    const [row] = await tx.insert(mentorAssignments).values({ tenantId: p.tenantId, studentId, mentorUserId, startedOn: today, assignedBy: p.userId }).returning();
    await auditUser(tx, p, 'mentoring.assigned', 'mentor_assignment', row.id, { studentId, mentorUserId });
    return row;
  }

  // ----- assignments --------------------------------------------------------------------------

  /** Faculty who can be given mentees, for the assignment pickers. */
  @Get('mentors')
  @Auth('user', MENTORING_ADMIN)
  async mentors(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.selectDistinct({ id: users.id, fullName: users.fullName }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId)).where(inArray(userRoles.role, MENTOR_CANDIDATE_ROLES)).orderBy(asc(users.fullName));
      return rows;
    });
  }

  @Post('assignments')
  @Auth('user', MENTORING_ADMIN)
  assignOne(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ studentId: z.uuid(), mentorUserId: z.uuid() }))) b: { studentId: string; mentorUserId: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: students.id }).from(students).where(eq(students.id, b.studentId)))[0], 'Student');
      await this.mustBeMentorCandidate(tx, b.mentorUserId);
      return this.assign(tx, p, b.studentId, b.mentorUserId, await this.svc.today(tx));
    });
  }

  /** Every active student of a section who has no mentor is shared among the given mentors in roll order. */
  @Post('assignments/bulk')
  @Auth('user', MENTORING_ADMIN)
  @HttpCode(200)
  bulk(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ sectionId: z.uuid(), mentorUserIds: z.array(z.uuid()).min(1).max(50), reassign: z.boolean().default(false) }))) b: { sectionId: string; mentorUserIds: string[]; reassign: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: sections.id }).from(sections).where(eq(sections.id, b.sectionId)))[0], 'Section');
      for (const m of b.mentorUserIds) await this.mustBeMentorCandidate(tx, m);
      const today = await this.svc.today(tx);
      const list = await tx.select({ id: students.id }).from(students).where(and(eq(students.sectionId, b.sectionId), eq(students.status, 'active'))).orderBy(asc(students.rollNo));
      let assigned = 0;
      let skipped = 0;
      for (const s of list) {
        if (!b.reassign && (await this.svc.openAssignment(tx, s.id))) {
          skipped++;
          continue;
        }
        await this.assign(tx, p, s.id, b.mentorUserIds[assigned % b.mentorUserIds.length], today);
        assigned++;
      }
      await auditUser(tx, p, 'mentoring.bulk_assigned', 'section', b.sectionId, { assigned, skipped });
      return { assigned, skipped };
    });
  }

  /** Admins see all (filter by section or mentor); a mentor sees their own mentees. */
  @Get('assignments')
  @Auth('user', READERS)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId') sectionId?: string, @Query('mentorUserId') mentorUserId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const all = this.isAdmin(p) || hasRole(p, ['counsellor']);
      const mentor = all ? mentorUserId : p.userId;
      return tx
        .select({ id: mentorAssignments.id, studentId: students.id, studentName: students.fullName, rollNo: students.rollNo, sectionId: students.sectionId, section: sections.displayName, mentorUserId: mentorAssignments.mentorUserId, mentorName: users.fullName, startedOn: mentorAssignments.startedOn })
        .from(mentorAssignments)
        .innerJoin(students, eq(students.id, mentorAssignments.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .innerJoin(users, eq(users.id, mentorAssignments.mentorUserId))
        .where(and(isNull(mentorAssignments.endedOn), mentor ? eq(mentorAssignments.mentorUserId, mentor) : undefined, sectionId ? eq(students.sectionId, sectionId) : undefined))
        .orderBy(asc(sections.displayName), asc(students.rollNo));
    });
  }

  @Post('assignments/:id/end')
  @Auth('user', MENTORING_ADMIN)
  @HttpCode(200)
  end(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = found((await tx.select().from(mentorAssignments).where(eq(mentorAssignments.id, id)))[0], 'Assignment');
      if (a.endedOn) throw new ConflictException('This assignment has already ended');
      const [row] = await tx.update(mentorAssignments).set({ endedOn: await this.svc.today(tx) }).where(eq(mentorAssignments.id, id)).returning();
      await auditUser(tx, p, 'mentoring.assignment_ended', 'mentor_assignment', id);
      return row;
    });
  }

  // ----- risk ---------------------------------------------------------------------------------

  /** Students who need attention, computed now from attendance, marks, fees and open welfare cases. */
  @Get('risk')
  @Auth('user', READERS)
  risk(@CurrentPrincipal() p: UserPrincipal, @Query('mentorUserId') mentorUserId?: string, @Query('attendanceBelow') below?: string, @Query('all') all?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const wide = this.isAdmin(p) || hasRole(p, ['counsellor']);
      const threshold = Math.min(100, Math.max(1, Number(below) || 75));
      return this.svc.riskList(tx, { mentorUserId: wide ? mentorUserId : p.userId, attendanceThreshold: threshold, includeNone: all === 'true' });
    });
  }

  /** A class at a glance for its teachers: attendance %, average mark % and risk flag per student. */
  @Get('sections/:id/insights')
  @Auth('user', ['teacher', 'hod', 'principal', 'tenant_admin', 'counsellor'])
  sectionInsights(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('attendanceBelow') below?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!hasRole(p, ['counsellor'])) await this.teacher.assertCanSeeSection(tx, p, id);
      return this.svc.sectionInsights(tx, id, Math.min(100, Math.max(1, Number(below) || 75)));
    });
  }

  // ----- sessions -----------------------------------------------------------------------------

  /** Private notes go only to the mentor who wrote them, the head of department and the counsellor. */
  private present(s: Session, p: UserPrincipal) {
    const { privateNotes, ...rest } = s;
    const sees = s.mentorUserId === p.userId || hasRole(p, NOTES_ROLES);
    return { ...rest, hasNotes: privateNotes !== null, ...(sees ? { privateNotes } : {}) };
  }

  @Post('sessions')
  @Auth('user', ['teacher', 'hod', 'principal'])
  logSession(
    @CurrentPrincipal() p: UserPrincipal,
    @Body(new ZodBody(z.object({ studentId: z.uuid(), heldOn: day, mode: z.enum(['in_person', 'phone', 'online']).default('in_person'), summary: z.string().trim().min(1).max(4000), privateNotes: z.string().trim().max(20000).optional(), followUpOn: day.optional() })))
    b: { studentId: string; heldOn: string; mode: string; summary: string; privateNotes?: string; followUpOn?: string },
  ) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.mustMentor(tx, p, b.studentId);
      const [row] = await tx.insert(mentoringSessions).values({ tenantId: p.tenantId, studentId: b.studentId, mentorUserId: p.userId, heldOn: b.heldOn, mode: b.mode, summary: b.summary, privateNotes: b.privateNotes ?? null, followUpOn: b.followUpOn ?? null }).returning();
      // The audit entry records that a session happened, never what was said.
      await auditUser(tx, p, 'mentoring.session_logged', 'mentoring_session', row.id, { studentId: b.studentId });
      return this.present(row, p);
    });
  }

  @Get('sessions')
  @Auth('user', READERS)
  sessions(@CurrentPrincipal() p: UserPrincipal, @Query('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!(await this.canRead(tx, p, studentId))) throw new NotFoundException('Student not found');
      const rows = await tx.select().from(mentoringSessions).where(eq(mentoringSessions.studentId, studentId)).orderBy(desc(mentoringSessions.heldOn), desc(mentoringSessions.createdAt));
      const seen = rows.filter((r) => r.privateNotes !== null && r.mentorUserId !== p.userId && hasRole(p, NOTES_ROLES));
      if (seen.length) await auditUser(tx, p, 'mentoring.notes_viewed', 'student', studentId, { sessions: seen.length });
      return rows.map((r) => this.present(r, p));
    });
  }

  // ----- intervention plans -------------------------------------------------------------------

  @Post('plans')
  @Auth('user', ['teacher', 'hod', 'principal'])
  createPlan(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ studentId: z.uuid(), goal: z.string().trim().min(3).max(1000), actions: z.array(z.string().trim().min(1).max(500)).min(1).max(20), reviewOn: day }))) b: { studentId: string; goal: string; actions: string[]; reviewOn: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.mustMentor(tx, p, b.studentId);
      const baseline = await this.measure(tx, b.studentId);
      const [row] = await tx.insert(interventionPlans).values({ tenantId: p.tenantId, studentId: b.studentId, mentorUserId: p.userId, goal: b.goal, actions: b.actions.map((text) => ({ text, done: false })), reviewOn: b.reviewOn, baseline }).returning();
      await auditUser(tx, p, 'mentoring.plan_created', 'intervention_plan', row.id, { studentId: b.studentId });
      await this.events.emit(tx, p.tenantId, { type: DomainEvents.InterventionCreated, aggregateType: 'intervention_plan', aggregateId: row.id, actorId: p.userId, payload: { studentId: b.studentId, reviewOn: b.reviewOn } });
      await this.tasks.create(tx, { tenantId: p.tenantId, ownerId: p.userId, assigneeId: p.userId, title: 'Re-measure intervention plan', description: b.goal, dueAt: new Date(`${b.reviewOn}T09:00:00+05:30`), sourceModule: 'mentoring', sourceId: row.id, priority: 'normal', reminderHours: 24 });
      return row;
    });
  }

  @Get('plans')
  @Auth('user', READERS)
  plans(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const wide = this.isAdmin(p) || hasRole(p, ['counsellor']);
      if (studentId && !(await this.canRead(tx, p, studentId))) throw new NotFoundException('Student not found');
      return tx
        .select({ plan: interventionPlans, studentName: students.fullName, rollNo: students.rollNo })
        .from(interventionPlans)
        .innerJoin(students, eq(students.id, interventionPlans.studentId))
        .where(and(wide ? undefined : eq(interventionPlans.mentorUserId, p.userId), studentId ? eq(interventionPlans.studentId, studentId) : undefined, status ? inArray(interventionPlans.status, status.split(',')) : undefined))
        .orderBy(asc(interventionPlans.reviewOn));
    });
  }

  private async ownPlan(tx: Tx, p: UserPrincipal, id: string) {
    const plan = found((await tx.select().from(interventionPlans).where(eq(interventionPlans.id, id)).for('update'))[0], 'Plan');
    if (plan.mentorUserId !== p.userId) throw new ForbiddenException('Only the mentor who made this plan can change it');
    if (plan.status === 'closed') throw new ConflictException('This plan is closed');
    return plan;
  }

  /** Ticks actions off, adds new ones or moves the review date. */
  @Put('plans/:id')
  @Auth('user', ['teacher', 'hod', 'principal'])
  updatePlan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ actions: z.array(z.object({ text: z.string().trim().min(1).max(500), done: z.boolean() })).min(1).max(20).optional(), reviewOn: day.optional() }))) b: { actions?: { text: string; done: boolean }[]; reviewOn?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const plan = await this.ownPlan(tx, p, id);
      const actions = b.actions ?? plan.actions;
      const [row] = await tx.update(interventionPlans).set({ actions, reviewOn: b.reviewOn ?? plan.reviewOn, status: actions.some((a) => a.done) ? 'in_progress' : plan.status }).where(eq(interventionPlans.id, id)).returning();
      await auditUser(tx, p, 'mentoring.plan_updated', 'intervention_plan', id);
      return row;
    });
  }

  /** Marks and attendance as they stand today: the figures a plan is judged by. */
  private async measure(tx: Tx, studentId: string): Promise<{ takenOn: string; avgPct: number | null; attendancePct: number | null }> {
    const f: LearningFacts = await learningFacts(tx, studentId, this.svc.now().toISOString().slice(0, 10));
    const avg = f.subjects.length ? Math.round((f.subjects.reduce((n, s) => n + s.averagePercent, 0) / f.subjects.length) * 10) / 10 : null;
    return { takenOn: this.svc.now().toISOString().slice(0, 10), avgPct: avg, attendancePct: f.attendancePercent };
  }

  /** Adds remedial content (a topic to re-teach, a practice set, a note) to the plan and starts it. */
  @Post('plans/:id/remedial')
  @Auth('user', ['teacher', 'hod', 'principal'])
  @HttpCode(200)
  addRemedial(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ kind: z.enum(['topic', 'practice', 'note', 'session']), title: z.string().trim().min(2).max(200), topicId: z.uuid().optional(), note: z.string().trim().max(1000).optional() }))) b: { kind: string; title: string; topicId?: string; note?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const plan = await this.ownPlan(tx, p, id);
      const remedial = [...plan.remedial, { ...b, assignedOn: this.svc.now().toISOString().slice(0, 10) }];
      const [row] = await tx.update(interventionPlans).set({ remedial, status: 'in_progress', baseline: plan.baseline ?? (await this.measure(tx, plan.studentId)) }).where(eq(interventionPlans.id, id)).returning();
      await auditUser(tx, p, 'mentoring.remedial_added', 'intervention_plan', id, { kind: b.kind, title: b.title });
      return row;
    });
  }

  /** Measures again and compares with the baseline: improved, unchanged or declined (3 percentage points either way). */
  @Post('plans/:id/remeasure')
  @Auth('user', ['teacher', 'hod', 'principal'])
  @HttpCode(200)
  remeasure(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const plan = await this.ownPlan(tx, p, id);
      const now = await this.measure(tx, plan.studentId);
      const delta = plan.baseline?.avgPct != null && now.avgPct != null ? Math.round((now.avgPct - plan.baseline.avgPct) * 10) / 10 : null;
      const verdict = delta === null ? 'no_data' : delta >= 3 ? 'improved' : delta <= -3 ? 'declined' : 'unchanged';
      const [row] = await tx.update(interventionPlans).set({ remeasure: { ...now, deltaPct: delta, verdict } }).where(eq(interventionPlans.id, id)).returning();
      await auditUser(tx, p, 'mentoring.plan_remeasured', 'intervention_plan', id, { deltaPct: delta, verdict });
      await this.events.emit(tx, p.tenantId, { type: DomainEvents.InterventionRemeasured, aggregateType: 'intervention_plan', aggregateId: id, actorId: p.userId, payload: { studentId: plan.studentId, verdict, deltaPct: delta } });
      return row;
    });
  }

  @Post('plans/:id/close')
  @Auth('user', ['teacher', 'hod', 'principal'])
  @HttpCode(200)
  closePlan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ outcome: z.string().trim().min(3).max(2000), outcomeRating: z.enum(['improved', 'no_change', 'worsened']) }))) b: { outcome: string; outcomeRating: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.ownPlan(tx, p, id);
      const [row] = await tx.update(interventionPlans).set({ status: 'closed', outcome: b.outcome, outcomeRating: b.outcomeRating, closedAt: this.svc.now() }).where(eq(interventionPlans.id, id)).returning();
      await auditUser(tx, p, 'mentoring.plan_closed', 'intervention_plan', id, { outcomeRating: b.outcomeRating });
      return row;
    });
  }
}
