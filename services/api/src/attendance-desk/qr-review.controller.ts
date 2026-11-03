import { Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { attendanceLocked } from '../attendance-governance/attendance-rules.js';
import { attendanceSettings } from '../attendance-governance/eligibility.js';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { attendanceDeviceBindings, attendanceQrScans } from '../db/schema-academic-ops.js';
import { attendanceRecords, departments, sections, students, subjects, timetableSlots, users } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { isSchoolAdmin } from '../teacher/teacher.service.js';
import { AttendanceDeskService } from './desk.service.js';

const CLASS_ROLES: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];
const DecisionBody = z.object({ decision: z.enum(['accepted', 'rejected']), note: z.string().trim().max(500).optional() });
const BulkBody = z.object({ ids: z.array(z.uuid()).min(1).max(300), decision: z.enum(['accepted', 'rejected']), note: z.string().trim().max(500).optional() });
const ReleaseBody = z.object({ reason: z.string().trim().min(3).max(300) });
const ListQuery = z.object({
  from: Day.optional(),
  to: Day.optional(),
  slotId: z.uuid().optional(),
  /** flagged (waiting for a decision, the default), decided, refused or all. */
  status: z.enum(['flagged', 'decided', 'refused', 'all']).default('flagged'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * QR self-marks held for review: the teacher of the period (or the day's substitute), the subject's head of
 * department or the principal accepts (marks present) or rejects each one; staff release a student's bound phone.
 */
@Controller('v1/attendance-desk')
export class QrReviewController {
  constructor(
    private readonly db: DbService,
    private readonly desk: AttendanceDeskService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Scans in the dates (default today), newest first, limited to the periods this person may mark. */
  @Get('qr-scans')
  @Auth('user', CLASS_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query(new ZodBody(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = (await this.desk.now(tx)).date;
      const from = q.from ?? today;
      const to = q.to ?? from;
      if (q.slotId) await this.desk.slotToMark(tx, p, q.slotId, from);
      const headed = !isSchoolAdmin(p) && p.roles.includes('hod') ? (await tx.select({ id: departments.id }).from(departments).where(eq(departments.headUserId, p.userId))).map((d) => d.id) : [];
      // Scope: everything for the principal; otherwise own periods, periods covered as a substitute, a head's department's subjects.
      const scope = isSchoolAdmin(p)
        ? undefined
        : or(
            eq(timetableSlots.teacherId, p.userId),
            sql`exists (select 1 from teacher_substitutions ts where ts.slot_id = ${attendanceQrScans.timetableSlotId} and ts.date = ${attendanceQrScans.date} and ts.substitute_teacher_id = ${p.userId}::uuid and ts.status = 'assigned')`,
            headed.length ? inArray(subjects.departmentId, headed) : sql`false`,
          );
      const status =
        q.status === 'flagged'
          ? and(eq(attendanceQrScans.outcome, 'flagged'), isNull(attendanceQrScans.decision))
          : q.status === 'decided'
            ? sql`${attendanceQrScans.decision} is not null`
            : q.status === 'refused'
              ? eq(attendanceQrScans.outcome, 'refused')
              : undefined;
      const where = and(gte(attendanceQrScans.date, from), lte(attendanceQrScans.date, to), q.slotId ? eq(attendanceQrScans.timetableSlotId, q.slotId) : undefined, status, scope);
      const base = tx
        .select({
          id: attendanceQrScans.id,
          date: attendanceQrScans.date,
          slotId: attendanceQrScans.timetableSlotId,
          studentId: attendanceQrScans.studentId,
          student: students.fullName,
          rollNo: students.rollNo,
          section: sections.displayName,
          subject: subjects.name,
          startsAt: timetableSlots.startsAt,
          outcome: attendanceQrScans.outcome,
          reasons: attendanceQrScans.reasons,
          distanceM: attendanceQrScans.distanceM,
          accuracyM: attendanceQrScans.accuracyM,
          decision: attendanceQrScans.decision,
          decidedBy: users.fullName,
          decidedAt: attendanceQrScans.decidedAt,
          decisionNote: attendanceQrScans.decisionNote,
          scannedAt: attendanceQrScans.createdAt,
        })
        .from(attendanceQrScans)
        .innerJoin(students, eq(students.id, attendanceQrScans.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .innerJoin(timetableSlots, eq(timetableSlots.id, attendanceQrScans.timetableSlotId))
        .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .leftJoin(users, eq(users.id, attendanceQrScans.decidedBy));
      const [{ total }] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(attendanceQrScans)
        .innerJoin(timetableSlots, eq(timetableSlots.id, attendanceQrScans.timetableSlotId))
        .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .where(where);
      const rows = await base.where(where).orderBy(desc(attendanceQrScans.createdAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
      return { from, to, total, page: q.page, pageSize: q.pageSize, rows: rows.map((r) => ({ ...r, startsAt: r.startsAt.slice(0, 5) })) };
    });
  }

  /** Accepting marks the student present for the period (unless the teacher already marked them); rejecting leaves the mark alone. */
  @Post('qr-scans/:id/decision')
  @HttpCode(200)
  @Auth('user', CLASS_ROLES)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecisionBody)) b: z.infer<typeof DecisionBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.decideOne(tx, p, id, b.decision, b.note ?? null));
  }

  /** The same decision for many held scans at once (each one checked on its own). */
  @Post('qr-scans/decide')
  @HttpCode(200)
  @Auth('user', CLASS_ROLES)
  decideMany(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(BulkBody)) b: z.infer<typeof BulkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const report: { id: string; ok: boolean; error?: string }[] = [];
      for (const id of b.ids) {
        try {
          await tx.transaction((sp) => this.decideOne(sp as Tx, p, id, b.decision, b.note ?? null));
          report.push({ id, ok: true });
        } catch (e) {
          report.push({ id, ok: false, error: (e as Error).message });
        }
      }
      return { done: report.filter((r) => r.ok).length, failed: report.filter((r) => !r.ok).length, report };
    });
  }

  private async decideOne(tx: Tx, p: UserPrincipal, id: string, decision: 'accepted' | 'rejected', note: string | null) {
    const [scan] = await tx.select().from(attendanceQrScans).where(eq(attendanceQrScans.id, id));
    if (!scan) throw new NotFoundException('Scan not found');
    const slot = await this.desk.slotToMark(tx, p, scan.timetableSlotId, scan.date);
    if (scan.outcome !== 'flagged') throw new ConflictException('Only scans held for review can be decided');
    if (scan.decision) throw new ConflictException('This scan has already been decided');
    const now = await this.desk.now(tx);
    const { lockHours } = await attendanceSettings(tx, slot.sectionId);
    if (attendanceLocked(scan.date, new Date(), now.tz, lockHours)) throw new ConflictException('Attendance for this day is locked. Ask for a correction instead.');
    let marked = false;
    if (decision === 'accepted') {
      const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, scan.studentId));
      const done = await tx
        .insert(attendanceRecords)
        .values({ tenantId: p.tenantId, studentId: scan.studentId, sectionId: st.sectionId, date: scan.date, timetableSlotId: scan.timetableSlotId, status: 'present', markedBy: p.userId, occurredAt: scan.createdAt })
        .onConflictDoNothing()
        .returning({ id: attendanceRecords.id });
      marked = done.length > 0;
      if (marked) await this.notifications.attendanceChanged(tx, scan.timetableSlotId, scan.date, [scan.studentId]);
    }
    const [row] = await tx.update(attendanceQrScans).set({ decision, decidedBy: p.userId, decidedAt: new Date(), decisionNote: note }).where(eq(attendanceQrScans.id, id)).returning();
    await auditUser(tx, p, `attendance.qr_scan.${decision}`, 'attendance_qr_scan', id, { before: { decision: null }, after: { decision, marked }, studentId: scan.studentId, slotId: scan.timetableSlotId, date: scan.date, reasons: scan.reasons });
    return { ...row, marked };
  }

  /** The phone a student is bound to (whether one is), for the student's teachers. */
  @Get('device-bindings/:studentId')
  @Auth('user', CLASS_ROLES)
  binding(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.desk.assertLeaveDecider(tx, p, studentId);
      const [b] = await tx.select({ boundAt: attendanceDeviceBindings.boundAt }).from(attendanceDeviceBindings).where(and(eq(attendanceDeviceBindings.studentId, studentId), isNull(attendanceDeviceBindings.releasedAt)));
      return { bound: !!b, boundAt: b?.boundAt ?? null };
    });
  }

  /** Releases a student's bound phone (a new or lost phone); their next scan binds the phone they use then. */
  @Post('device-bindings/:studentId/release')
  @HttpCode(200)
  @Auth('user', CLASS_ROLES)
  release(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodBody(ReleaseBody)) b: z.infer<typeof ReleaseBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.desk.assertLeaveDecider(tx, p, studentId);
      const rows = await tx.update(attendanceDeviceBindings).set({ releasedAt: new Date(), releasedBy: p.userId, releaseReason: b.reason }).where(and(eq(attendanceDeviceBindings.studentId, studentId), isNull(attendanceDeviceBindings.releasedAt))).returning({ id: attendanceDeviceBindings.id });
      if (!rows.length) throw new NotFoundException('This student has no bound phone');
      await auditUser(tx, p, 'attendance.device_binding.released', 'student', studentId, { reason: b.reason });
      return { released: true };
    });
  }
}

