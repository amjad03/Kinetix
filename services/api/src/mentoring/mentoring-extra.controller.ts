import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit, auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { assessments, attendanceRecords, guardians, interventionPlans, marks, mentorAssignments, mentoringSessions, sections, students, users } from '../db/schema.js';
import { learnerRules, mentorMessages } from '../db/schema-life.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ParentVisibilityService } from '../parent/parent-visibility.js';
import { hasRole } from '../placements/placements.access.js';
import { TeacherService } from '../teacher/teacher.service.js';
import { MENTORING_ADMIN } from './mentoring-rules.js';
import { MentoringService } from './mentoring.service.js';

const MessageBody = z.object({ body: z.string().trim().min(1).max(2000) });
const RulesBody = z.object({ slowBelowPct: z.number().int().min(1).max(99), advancedFromPct: z.number().int().min(2).max(100), minAssessments: z.number().int().min(1).max(50), attendanceBelowPct: z.number().int().min(0).max(100) }).refine((b) => b.slowBelowPct < b.advancedFromPct, { message: 'The slow-learner mark must be below the advanced-learner mark', path: ['advancedFromPct'] });
const PlansBody = z.object({ studentIds: z.array(z.uuid()).min(1).max(500), goal: z.string().trim().min(3).max(1000), actions: z.array(z.string().trim().min(1).max(500)).min(1).max(20), reviewOn: z.iso.date() });

export type LearnerLevel = 'slow' | 'average' | 'advanced' | 'not_enough';

/** A student's level under the institution's rules: by average mark, and slow too when attendance is below the bar. */
export function learnerLevel(r: { slowBelowPct: number; advancedFromPct: number; minAssessments: number; attendanceBelowPct: number }, s: { avgPct: number | null; assessments: number; attendancePct: number | null }): LearnerLevel {
  if (r.attendanceBelowPct > 0 && s.attendancePct !== null && s.attendancePct < r.attendanceBelowPct) return 'slow';
  if (s.avgPct === null || s.assessments < r.minAssessments) return 'not_enough';
  if (s.avgPct < r.slowBelowPct) return 'slow';
  if (s.avgPct >= r.advancedFromPct) return 'advanced';
  return 'average';
}

/**
 * Mentoring depth: the private channel between a mentor and their mentee; mentor remarks for parents when the
 * institution allows it; slow and advanced learners found by the institution's rules, with plans opened in bulk;
 * and the mentoring and slow-learner reports.
 */
@Controller('v1/mentoring')
export class MentoringExtraController {
  constructor(
    private readonly db: DbService,
    private readonly svc: MentoringService,
    private readonly teacher: TeacherService,
    private readonly visibility: ParentVisibilityService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- the mentor-mentee channel -----------------------------------------------------------------

  /** Only the mentor and the mentee (the student's own login) are in the channel; nobody else reads it. */
  private async channel(tx: Tx, p: UserPrincipal, assignmentId: string) {
    const [a] = await tx.select({ a: mentorAssignments, studentUserId: students.userId }).from(mentorAssignments).innerJoin(students, eq(students.id, mentorAssignments.studentId)).where(eq(mentorAssignments.id, assignmentId));
    if (!a) throw new NotFoundException('Not found');
    const side = a.a.mentorUserId === p.userId ? 'mentor' : a.studentUserId === p.userId ? 'mentee' : null;
    if (!side) throw new NotFoundException('Not found');
    return { ...a, side };
  }

  /** The mentee's own current mentor and channel (Student App). */
  @Get('my-mentor')
  @Auth('user', ['student'])
  myMentor(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx
        .select({ assignmentId: mentorAssignments.id, mentorName: users.fullName, startedOn: mentorAssignments.startedOn, unread: sql<number>`(select count(*)::int from mentor_messages m where m.assignment_id = ${mentorAssignments.id} and m.sender_user_id <> ${p.userId} and m.read_at is null)` })
        .from(mentorAssignments)
        .innerJoin(students, eq(students.id, mentorAssignments.studentId))
        .innerJoin(users, eq(users.id, mentorAssignments.mentorUserId))
        .where(and(eq(students.userId, p.userId), isNull(mentorAssignments.endedOn)));
      return row ?? null;
    });
  }

  /** The mentor's channels with unread counts. */
  @Get('channels')
  @Auth('user', ['teacher', 'hod', 'principal'])
  channels(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ assignmentId: mentorAssignments.id, studentId: students.id, studentName: students.fullName, rollNo: students.rollNo, className: sections.displayName, hasLogin: sql<boolean>`${students.userId} is not null`, unread: sql<number>`(select count(*)::int from mentor_messages m where m.assignment_id = ${mentorAssignments.id} and m.sender_user_id <> ${p.userId} and m.read_at is null)`, lastAt: sql<string | null>`(select max(m.created_at) from mentor_messages m where m.assignment_id = ${mentorAssignments.id})` })
        .from(mentorAssignments)
        .innerJoin(students, eq(students.id, mentorAssignments.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(and(eq(mentorAssignments.mentorUserId, p.userId), isNull(mentorAssignments.endedOn)))
        .orderBy(sql`(select max(m.created_at) from mentor_messages m where m.assignment_id = ${mentorAssignments.id}) desc nulls last`, asc(students.fullName)),
    );
  }

  @Get('assignments/:id/messages')
  @Auth('user', ['teacher', 'hod', 'principal', 'student'])
  messages(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.channel(tx, p, id);
      await tx.update(mentorMessages).set({ readAt: this.svc.now() }).where(and(eq(mentorMessages.assignmentId, id), sql`${mentorMessages.senderUserId} <> ${p.userId}`, isNull(mentorMessages.readAt)));
      return tx.select({ id: mentorMessages.id, senderUserId: mentorMessages.senderUserId, senderName: users.fullName, body: mentorMessages.body, readAt: mentorMessages.readAt, createdAt: mentorMessages.createdAt }).from(mentorMessages).innerJoin(users, eq(users.id, mentorMessages.senderUserId)).where(eq(mentorMessages.assignmentId, id)).orderBy(asc(mentorMessages.createdAt)).limit(500);
    });
  }

  @Post('assignments/:id/messages')
  @Auth('user', ['teacher', 'hod', 'principal', 'student'])
  send(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MessageBody)) b: z.infer<typeof MessageBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.channel(tx, p, id);
      if (c.a.endedOn) throw new ConflictException('This mentoring has ended');
      const [m] = await tx.insert(mentorMessages).values({ tenantId: p.tenantId, assignmentId: id, senderUserId: p.userId, body: b.body, createdAt: this.svc.now() }).returning();
      const to = c.side === 'mentor' ? c.studentUserId : c.a.mentorUserId;
      // The message text never goes into the notification: it is a private channel.
      if (to) await this.notifications.notifyUsers(tx, [to], { kind: 'message', text: { title: c.side === 'mentor' ? 'A message from your mentor' : 'A message from your mentee', body: 'Open the app to read it.' }, data: { mentorAssignmentId: id }, dedupeKey: `mentor-msg:${m.id}` });
      // Audited without the text.
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'mentor_assignment.message_sent', subjectType: 'mentor_assignment', subjectId: id });
      return m;
    });
  }

  // ---- parents --------------------------------------------------------------------------------------

  /** A parent's (or the student's) view of the mentor and the session summaries; private notes never leave the mentor. */
  @Get('family/:studentId')
  @Auth('user', ['guardian', 'student'])
  family(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [own] = await tx.select({ id: students.id }).from(students).where(and(eq(students.id, studentId), eq(students.userId, p.userId)));
      const [kid] = own ? [own] : await tx.select({ id: guardians.studentId }).from(guardians).where(and(eq(guardians.studentId, studentId), eq(guardians.userId, p.userId)));
      if (!kid) throw new NotFoundException('Student not found');
      await this.visibility.assert(tx, p, 'mentoring');
      const [a] = await tx.select({ mentorName: users.fullName, startedOn: mentorAssignments.startedOn }).from(mentorAssignments).innerJoin(users, eq(users.id, mentorAssignments.mentorUserId)).where(and(eq(mentorAssignments.studentId, studentId), isNull(mentorAssignments.endedOn)));
      const sessions = await tx.select({ heldOn: mentoringSessions.heldOn, mode: mentoringSessions.mode, summary: mentoringSessions.summary, followUpOn: mentoringSessions.followUpOn }).from(mentoringSessions).where(eq(mentoringSessions.studentId, studentId)).orderBy(desc(mentoringSessions.heldOn)).limit(50);
      return { mentor: a ?? null, sessions };
    });
  }

  // ---- slow and advanced learners ----------------------------------------------------------------

  private async rules(tx: Tx) {
    const [r] = await tx.select().from(learnerRules);
    return r ?? { slowBelowPct: 40, advancedFromPct: 75, minAssessments: 2, attendanceBelowPct: 0 };
  }

  @Get('learner-rules')
  @Auth('user', [...MENTORING_ADMIN, 'teacher', 'counsellor'])
  getRules(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.rules(tx);
      return { slowBelowPct: r.slowBelowPct, advancedFromPct: r.advancedFromPct, minAssessments: r.minAssessments, attendanceBelowPct: r.attendanceBelowPct };
    });
  }

  @Put('learner-rules')
  @Auth('user', ['tenant_admin', 'principal'])
  setRules(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RulesBody)) b: z.infer<typeof RulesBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await this.rules(tx);
      await tx.insert(learnerRules).values({ tenantId: p.tenantId, ...b, updatedBy: p.userId }).onConflictDoUpdate({ target: learnerRules.tenantId, set: { ...b, updatedBy: p.userId, updatedAt: this.svc.now() } });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'mentoring.learner_rules_changed', subjectType: 'tenant', subjectId: p.tenantId, before: { slowBelowPct: before.slowBelowPct, advancedFromPct: before.advancedFromPct, minAssessments: before.minAssessments, attendanceBelowPct: before.attendanceBelowPct }, after: b });
      return b;
    });
  }

  /** Every student of a class with their average mark, attendance and level under the rules (NAAC 2.2.1). */
  @Get('learners')
  @Auth('user', [...MENTORING_ADMIN, 'teacher', 'counsellor'])
  learners(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!hasRole(p, ['counsellor', 'tenant_admin', 'principal'])) await this.teacher.assertCanSeeSection(tx, p, sectionId);
      return this.levels(tx, sectionId);
    });
  }

  private async levels(tx: Tx, sectionId: string) {
    const r = await this.rules(tx);
    const roster = await tx.select({ studentId: students.id, fullName: students.fullName, rollNo: students.rollNo }).from(students).where(and(eq(students.sectionId, sectionId), eq(students.status, 'active'))).orderBy(asc(students.rollNo));
    const ids = roster.map((s) => s.studentId);
    if (!ids.length) return { rules: r, students: [] };
    const avg = await tx
      .select({ studentId: marks.studentId, pct: sql<number | null>`avg(coalesce(${marks.moderatedMarks}, ${marks.marks}) * 100.0 / nullif(${assessments.maxMarks}, 0))::float8`, n: sql<number>`count(*)::int` })
      .from(marks)
      .innerJoin(assessments, eq(assessments.id, marks.assessmentId))
      .where(and(inArray(marks.studentId, ids), eq(marks.absent, false), sql`${assessments.publishedAt} is not null`, sql`coalesce(${marks.moderatedMarks}, ${marks.marks}) is not null`))
      .groupBy(marks.studentId);
    const att = await tx
      .select({ studentId: attendanceRecords.studentId, pct: sql<number | null>`(count(*) filter (where ${attendanceRecords.status} in ('present', 'late')) * 100.0 / nullif(count(*) filter (where ${attendanceRecords.status} <> 'excused'), 0))::float8` })
      .from(attendanceRecords)
      .where(inArray(attendanceRecords.studentId, ids))
      .groupBy(attendanceRecords.studentId);
    const plans = await tx.select({ studentId: interventionPlans.studentId, status: interventionPlans.status }).from(interventionPlans).where(and(inArray(interventionPlans.studentId, ids), sql`${interventionPlans.status} <> 'closed'`));
    return {
      rules: r,
      students: roster.map((s) => {
        const a = avg.find((x) => x.studentId === s.studentId);
        const at = att.find((x) => x.studentId === s.studentId);
        const facts = { avgPct: a?.pct === null || a?.pct === undefined ? null : Math.round(a.pct), assessments: a?.n ?? 0, attendancePct: at?.pct === null || at?.pct === undefined ? null : Math.round(at.pct) };
        return { ...s, ...facts, level: learnerLevel(r, facts), openPlan: plans.some((x) => x.studentId === s.studentId) };
      }),
    };
  }

  /** Opens the same intervention plan for several slow learners; each goes to the student's mentor (or the caller when none). */
  @Post('learners/plans')
  @Auth('user', [...MENTORING_ADMIN, 'teacher'])
  @HttpCode(200)
  bulkPlans(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PlansBody)) b: z.infer<typeof PlansBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const created: string[] = [];
      const skipped: { studentId: string; reason: string }[] = [];
      for (const sid of [...new Set(b.studentIds)]) {
        const [st] = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(eq(students.id, sid));
        if (!st) throw new NotFoundException('Student not found');
        const open = await this.svc.openAssignment(tx, sid);
        if (!hasRole(p, MENTORING_ADMIN) && open?.mentorUserId !== p.userId) {
          skipped.push({ studentId: sid, reason: 'Not your mentee' });
          continue;
        }
        const [existing] = await tx.select({ id: interventionPlans.id }).from(interventionPlans).where(and(eq(interventionPlans.studentId, sid), sql`${interventionPlans.status} <> 'closed'`));
        if (existing) {
          skipped.push({ studentId: sid, reason: 'Already has an open plan' });
          continue;
        }
        const [row] = await tx.insert(interventionPlans).values({ tenantId: p.tenantId, studentId: sid, mentorUserId: open?.mentorUserId ?? p.userId, goal: b.goal, actions: b.actions.map((text) => ({ text, done: false })), reviewOn: b.reviewOn }).returning({ id: interventionPlans.id });
        await auditUser(tx, p, 'mentoring.plan_created', 'intervention_plan', row.id, { studentId: sid, bulk: true });
        created.push(row.id);
      }
      if (!created.length && !skipped.length) throw new BadRequestException('Choose students');
      return { created: created.length, skipped };
    });
  }

  // ---- reports --------------------------------------------------------------------------------------

  /** Per mentor: mentees, sessions in the last 90 days, open and closed plans and how the closed ones turned out. */
  @Get('reports/mentors')
  @Auth('user', [...MENTORING_ADMIN, 'counsellor'])
  mentorStats(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const since = new Date(this.svc.now().getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
      const rows = await tx
        .select({
          mentorUserId: users.id,
          mentorName: users.fullName,
          mentees: sql<number>`count(distinct ${mentorAssignments.studentId})::int`,
          sessions90: sql<number>`(select count(*)::int from mentoring_sessions s where s.mentor_user_id = ${users.id} and s.held_on >= ${since}::date)`,
          openPlans: sql<number>`(select count(*)::int from intervention_plans i where i.mentor_user_id = ${users.id} and i.status <> 'closed')`,
          closedPlans: sql<number>`(select count(*)::int from intervention_plans i where i.mentor_user_id = ${users.id} and i.status = 'closed')`,
          improved: sql<number>`(select count(*)::int from intervention_plans i where i.mentor_user_id = ${users.id} and i.status = 'closed' and (i.outcome_rating = 'improved' or i.remeasure->>'verdict' = 'improved'))`,
        })
        .from(mentorAssignments)
        .innerJoin(users, eq(users.id, mentorAssignments.mentorUserId))
        .where(isNull(mentorAssignments.endedOn))
        .groupBy(users.id, users.fullName)
        .orderBy(asc(users.fullName));
      return rows.map((r) => ({ ...r, sessionsPerMentee: r.mentees ? Math.round((r.sessions90 / r.mentees) * 10) / 10 : 0 }));
    });
  }

  /** Slow-learner outcomes: plans opened in the window, closed, improved, unchanged and declined. */
  @Get('reports/outcomes')
  @Auth('user', [...MENTORING_ADMIN, 'counsellor'])
  outcomes(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const since = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00Z`) : new Date(this.svc.now().getTime() - 365 * 86_400_000);
      const [r] = await tx
        .select({
          opened: sql<number>`count(*)::int`,
          closed: sql<number>`count(*) filter (where ${interventionPlans.status} = 'closed')::int`,
          improved: sql<number>`count(*) filter (where ${interventionPlans.outcomeRating} = 'improved' or ${interventionPlans.remeasure}->>'verdict' = 'improved')::int`,
          unchanged: sql<number>`count(*) filter (where ${interventionPlans.outcomeRating} = 'no_change' or ${interventionPlans.remeasure}->>'verdict' = 'unchanged')::int`,
          declined: sql<number>`count(*) filter (where ${interventionPlans.outcomeRating} = 'worsened' or ${interventionPlans.remeasure}->>'verdict' = 'declined')::int`,
          avgGain: sql<number | null>`round(avg((${interventionPlans.remeasure}->>'deltaPct')::numeric), 1)::float8`,
        })
        .from(interventionPlans)
        .where(gte(interventionPlans.createdAt, since));
      return { from: since.toISOString().slice(0, 10), ...r };
    });
  }
}

