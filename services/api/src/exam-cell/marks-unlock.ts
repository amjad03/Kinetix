import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { marksUnlockRequests } from '../db/schema-exam-flagship.js';
import { assessments, marks, timetableSlots } from '../db/schema.js';
import { headsSubject } from '../departments/departments.controller.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { auditCell, CELL, rowsOf } from './common.js';

const RequestBody = z.object({ reason: z.string().trim().min(5).max(500) });
const DecideBody = z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() });
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

/**
 * Unlocking marks with approval: once marks are submitted, verified or locked the teacher can no longer change them.
 * The teacher asks with a reason; the head of the subject's department, the controller of examinations or the
 * principal decides (never the person who asked). Approval reopens the marks for editing; published marks stay locked.
 */
@Controller('v1')
export class MarksUnlockController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly notes: NotificationsService,
  ) {}

  @Post('assessments/:id/unlock-requests')
  @Auth('user', ['teacher', 'hod', ...CELL])
  ask(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RequestBody)) b: z.infer<typeof RequestBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.assessment(tx, id);
      if (a.createdBy !== p.userId && !(await teaches(tx, p.userId, a.sectionId, a.subjectId))) throw new ForbiddenException('Only a teacher of this class can ask to unlock its marks');
      if (a.publishedAt) throw new ConflictException('Published marks stay locked; corrections go through the results desk');
      if (a.markStatus === 'draft' && !a.lockedAt) throw new ConflictException('The marks are open for editing already');
      const [open] = await tx.select({ id: marksUnlockRequests.id }).from(marksUnlockRequests).where(and(eq(marksUnlockRequests.assessmentId, id), eq(marksUnlockRequests.status, 'pending')));
      if (open) throw new ConflictException('A request to unlock these marks is already waiting');
      const [row] = await tx.insert(marksUnlockRequests).values({ tenantId: p.tenantId, assessmentId: id, requestedBy: p.userId, reason: b.reason }).returning();
      await auditCell(tx, p, 'marks.unlock_requested', 'assessment', id, { data: { requestId: row.id, reason: b.reason, markStatus: a.markStatus, locked: !!a.lockedAt } });
      const heads = await rowsOf<{ id: string }>(tx, sql`select d.head_user_id as id from subjects s join departments d on d.id = s.department_id where s.id = ${a.subjectId}::uuid and d.head_user_id is not null`);
      const to = heads.length ? heads.map((h) => h.id) : (await rowsOf<{ id: string }>(tx, sql`select ur.user_id as id from user_roles ur join users u on u.id = ur.user_id where ur.role = 'exam_controller' and u.status = 'active'`)).map((x) => x.id);
      const others = to.filter((x) => x !== p.userId);
      if (others.length) await this.notes.notifyUsers(tx, others, { kind: 'task', text: { title: 'Marks unlock request', body: `${a.title}: ${b.reason}` }, data: { assessmentId: id, requestId: row.id }, dedupeKey: `marks-unlock:${row.id}` });
      return row;
    });
  }

  /** The requests of one assessment, newest first. */
  @Get('assessments/:id/unlock-requests')
  @Auth('user', ['teacher', 'hod', ...CELL])
  forAssessment(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.assessment(tx, id);
      return this.list(tx, p, { assessmentId: id });
    });
  }

  /** Requests to decide (heads of department see their subjects', the controller and principal see all). */
  @Get('marks-unlock-requests')
  @Auth('user', ['teacher', 'hod', ...CELL])
  all(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    if (status && !(STATUSES as readonly string[]).includes(status)) throw new BadRequestException('Unknown status');
    return this.db.withTenant(p.tenantId, (tx) => this.list(tx, p, { status }));
  }

  @Post('marks-unlock-requests/:id/decide')
  @HttpCode(200)
  @Auth('user', ['hod', ...CELL])
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(marksUnlockRequests).where(eq(marksUnlockRequests.id, id)).for('update');
      if (!r) throw new NotFoundException('Request not found');
      if (r.status !== 'pending') throw new ConflictException(`The request is already ${r.status}`);
      if (r.requestedBy === p.userId) throw new ForbiddenException('Someone other than the person who asked must decide');
      const a = await this.assessment(tx, r.assessmentId);
      if (!p.roles.some((x) => CELL.includes(x)) && !(await headsSubject(tx, p, a.subjectId))) throw new ForbiddenException('Only the head of this subject\'s department, the controller of examinations or the principal can decide');
      if (!b.approve && !b.note) throw new BadRequestException('Say why the request is turned down');
      const status = b.approve ? 'approved' : 'rejected';
      if (b.approve) {
        if (a.publishedAt) throw new ConflictException('The marks were published meanwhile; they stay locked');
        // Reopen exactly as the head of department's reopen does: moderation cleared, back to draft, unlocked.
        await tx.update(marks).set({ moderatedMarks: null, moderationNote: null }).where(eq(marks.assessmentId, a.id));
        await tx.update(assessments).set({ markStatus: 'draft', submittedAt: null, verifiedBy: null, verifiedAt: null, moderatedBy: null, moderatedAt: null, lockedAt: null, lockedBy: null }).where(eq(assessments.id, a.id));
        await auditCell(tx, p, 'marks.unlocked', 'assessment', a.id, { before: { markStatus: a.markStatus, lockedAt: a.lockedAt?.toISOString() ?? null }, after: { markStatus: 'draft', lockedAt: null }, data: { requestId: id } });
      }
      const [row] = await tx.update(marksUnlockRequests).set({ status, decidedBy: p.userId, decidedAt: this.clock.now(), decisionNote: b.note ?? null }).where(eq(marksUnlockRequests.id, id)).returning();
      await auditCell(tx, p, `marks.unlock_${status}`, 'marks_unlock_request', id, { data: { assessmentId: a.id, note: b.note ?? null } });
      await this.notes.notifyUsers(tx, [r.requestedBy], { kind: 'task', text: { title: b.approve ? 'Marks unlocked' : 'Unlock request turned down', body: b.approve ? `${a.title}: you can edit the marks again` : `${a.title}: ${b.note}` }, data: { assessmentId: a.id, requestId: id }, dedupeKey: `marks-unlock:${id}:${status}` });
      return row;
    });
  }

  @Post('marks-unlock-requests/:id/cancel')
  @HttpCode(200)
  @Auth('user', ['teacher', 'hod', ...CELL])
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(marksUnlockRequests).where(eq(marksUnlockRequests.id, id));
      if (!r) throw new NotFoundException('Request not found');
      if (r.requestedBy !== p.userId) throw new ForbiddenException('Only the person who asked can withdraw the request');
      if (r.status !== 'pending') throw new ConflictException(`The request is already ${r.status}`);
      const [row] = await tx.update(marksUnlockRequests).set({ status: 'cancelled', decidedAt: this.clock.now() }).where(eq(marksUnlockRequests.id, id)).returning();
      await auditCell(tx, p, 'marks.unlock_cancelled', 'marks_unlock_request', id, { data: { assessmentId: r.assessmentId } });
      return row;
    });
  }

  private async assessment(tx: Tx, id: string) {
    const [a] = await tx.select().from(assessments).where(eq(assessments.id, id));
    if (!a) throw new NotFoundException('Assessment not found');
    return a;
  }

  /** Requests with the assessment, class, subject and people; a teacher sees only their own, a head of department their subjects'. */
  private async list(tx: Tx, p: UserPrincipal, f: { assessmentId?: string; status?: string }) {
    const office = p.roles.some((r) => CELL.includes(r));
    const hod = p.roles.includes('hod');
    return rowsOf(
      tx,
      sql`select r.id, r.assessment_id as "assessmentId", a.title as assessment, a.mark_status as "markStatus", a.locked_at is not null as locked, sec.display_name as section, sub.code, sub.name as subject,
            r.reason, r.status, r.decision_note as "decisionNote", ru.full_name as "requestedBy", r.requested_by = ${p.userId}::uuid as mine, du.full_name as "decidedBy",
            to_char(r.created_at, 'YYYY-MM-DD HH24:MI') as "createdAt", to_char(r.decided_at, 'YYYY-MM-DD HH24:MI') as "decidedAt",
            (r.status = 'pending' and r.requested_by <> ${p.userId}::uuid and (${office} or d.head_user_id = ${p.userId}::uuid)) as "canDecide"
          from marks_unlock_requests r join assessments a on a.id = r.assessment_id join sections sec on sec.id = a.section_id join subjects sub on sub.id = a.subject_id
          left join departments d on d.id = sub.department_id join users ru on ru.id = r.requested_by left join users du on du.id = r.decided_by
          where (${f.assessmentId ?? null}::uuid is null or r.assessment_id = ${f.assessmentId ?? null}::uuid) and (${f.status ?? null}::text is null or r.status = ${f.status ?? null})
            and (${office} or r.requested_by = ${p.userId}::uuid or (${hod} and d.head_user_id = ${p.userId}::uuid))
          order by (r.status = 'pending') desc, r.created_at desc limit 300`,
    );
  }
}

/** Whether the user teaches the subject in the class (a timetable slot), the way marks entry checks it. */
async function teaches(tx: Tx, userId: string, sectionId: string, subjectId: string): Promise<boolean> {
  const [slot] = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(and(eq(timetableSlots.teacherId, userId), eq(timetableSlots.sectionId, sectionId), eq(timetableSlots.subjectId, subjectId))).limit(1);
  return !!slot;
}
