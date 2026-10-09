import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { documentType } from '../admissions/public-admissions.controller.js';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { ENV, type Env } from '../config/env.js';
import { DbService } from '../db/db.service.js';
import { attendanceCondonations, attendanceCorrections, attendanceRecords, students, subjects, tenants, timetableSlots, users } from '../db/schema.js';
import { CampusLifeService } from '../campus-life/campus-life.service.js';
import { hasRole } from '../placements/placements.access.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { isoWeekday, TeacherService } from '../teacher/teacher.service.js';
import { attendanceLocked, checkQrCode, makeQrCode, QR_TTL_SECONDS } from './attendance-rules.js';
import { attendanceSettings, overallAttendance, subjectAttendance } from './eligibility.js';

const CLASS_ROLES: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];
/** Decide corrections: heads of department and the principal. */
const CORRECTION_DECIDERS: RoleName[] = ['hod', 'principal', 'tenant_admin'];
const CONDONATION_DECIDERS: RoleName[] = ['principal', 'tenant_admin'];
const MAX_DOC_BYTES = 5 * 1024 * 1024;

const CorrectionBody = z.object({ slotId: z.uuid(), date: Day, studentId: z.uuid(), toStatus: z.enum(['present', 'absent', 'late', 'excused']), reason: z.string().trim().min(5).max(500) });
const DecisionBody = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().min(3).max(500) });
const CondonationBody = z.object({ studentId: z.uuid().optional(), subjectId: z.uuid().optional(), kind: z.enum(['medical', 'other']), reason: z.string().trim().min(5).max(1000) });
const CondonationDecision = z.object({ decision: z.enum(['approved', 'rejected']), points: z.number().int().min(0).max(25).default(0), note: z.string().trim().min(3).max(500) });
const QrBody = z.object({ slotId: z.uuid(), date: Day.optional() });
const ScanBody = z.object({ code: z.string().trim().min(8).max(20) });

/** Attendance corrections, shortage and condonation, and QR attendance. */
@Controller('v1/attendance')
export class AttendanceGovernanceController {
  constructor(
    private readonly db: DbService,
    private readonly teacher: TeacherService,
    private readonly clock: Clock,
    private readonly family: CampusLifeService,
    private readonly scans: UploadScanService,
    private readonly storage: ObjectStorage,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---- corrections ----------------------------------------------------------------------

  /** A teacher asks for a mark to be changed, with a reason. */
  @Post('corrections')
  @Auth('user', CLASS_ROLES)
  requestCorrection(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CorrectionBody)) b: z.infer<typeof CorrectionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const slot = await this.teacher.slotFor(tx, p, b.slotId, b.date);
      if (isoWeekday(b.date) !== slot.dayOfWeek) throw new BadRequestException('This period is not on that day');
      const valid = await this.teacher.studentsInSection(tx, slot.sectionId, [b.studentId]);
      if (!valid.has(b.studentId)) throw new BadRequestException('That student is not in this class');
      const [cur] = await tx.select({ status: attendanceRecords.status }).from(attendanceRecords).where(and(eq(attendanceRecords.studentId, b.studentId), eq(attendanceRecords.date, b.date), eq(attendanceRecords.timetableSlotId, slot.id)));
      if (cur?.status === b.toStatus) throw new BadRequestException('The mark is already that');
      const [dup] = await tx.select({ id: attendanceCorrections.id }).from(attendanceCorrections).where(and(eq(attendanceCorrections.studentId, b.studentId), eq(attendanceCorrections.date, b.date), eq(attendanceCorrections.timetableSlotId, slot.id), eq(attendanceCorrections.status, 'pending')));
      if (dup) throw new ConflictException('A correction for this mark is already waiting for a decision');
      const [row] = await tx
        .insert(attendanceCorrections)
        .values({ tenantId: p.tenantId, studentId: b.studentId, sectionId: slot.sectionId, timetableSlotId: slot.id, date: b.date, fromStatus: cur?.status ?? null, toStatus: b.toStatus, reason: b.reason, requestedBy: p.userId })
        .returning();
      await auditUser(tx, p, 'attendance.correction.requested', 'attendance_correction', row.id, { studentId: b.studentId, date: b.date, from: cur?.status ?? null, to: b.toStatus });
      return row;
    });
  }

  /** Deciders see every request; teachers see their own. */
  @Get('corrections')
  @Auth('user', CLASS_ROLES)
  listCorrections(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const decider = hasRole(p, CORRECTION_DECIDERS);
      const rows = await tx
        .select({ c: attendanceCorrections, student: students.fullName, rollNo: students.rollNo, requester: users.fullName, subject: subjects.name })
        .from(attendanceCorrections)
        .innerJoin(students, eq(students.id, attendanceCorrections.studentId))
        .innerJoin(users, eq(users.id, attendanceCorrections.requestedBy))
        .innerJoin(timetableSlots, eq(timetableSlots.id, attendanceCorrections.timetableSlotId))
        .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .where(and(decider ? undefined : eq(attendanceCorrections.requestedBy, p.userId), status ? eq(attendanceCorrections.status, status) : undefined))
        .orderBy(desc(attendanceCorrections.createdAt));
      return rows.map((r) => ({ ...r.c, student: r.student, rollNo: r.rollNo, requester: r.requester, subject: r.subject }));
    });
  }

  /** Approving applies the change to the register and is audited with the before and after. */
  @Post('corrections/:id/decision')
  @HttpCode(200)
  @Auth('user', CORRECTION_DECIDERS)
  decideCorrection(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecisionBody)) b: z.infer<typeof DecisionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select().from(attendanceCorrections).where(eq(attendanceCorrections.id, id)).for('update');
      if (!c) throw new NotFoundException('Correction not found');
      if (c.status !== 'pending') throw new ConflictException('This correction was already decided');
      if (c.requestedBy === p.userId) throw new ForbiddenException('Someone else must decide your own request');
      if (b.decision === 'approved') {
        const now = this.clock.now();
        await tx
          .insert(attendanceRecords)
          .values({ tenantId: p.tenantId, studentId: c.studentId, sectionId: c.sectionId, date: c.date, timetableSlotId: c.timetableSlotId, status: c.toStatus, markedBy: p.userId, occurredAt: now })
          .onConflictDoUpdate({ target: [attendanceRecords.studentId, attendanceRecords.date, attendanceRecords.timetableSlotId], set: { status: c.toStatus, markedBy: p.userId, occurredAt: now, updatedAt: now } });
      }
      const [row] = await tx.update(attendanceCorrections).set({ status: b.decision, decidedBy: p.userId, decidedAt: this.clock.now(), decisionNote: b.note }).where(eq(attendanceCorrections.id, id)).returning();
      await auditUser(tx, p, `attendance.correction.${b.decision}`, 'attendance_correction', id, { studentId: c.studentId, date: c.date, from: c.fromStatus, to: c.toStatus, requestedBy: c.requestedBy, note: b.note });
      return row;
    });
  }

  // ---- shortage and eligibility ---------------------------------------------------------

  /** Students under the threshold, per subject, for one class. `all=true` lists everyone. */
  @Get('shortage')
  @Auth('user', CLASS_ROLES)
  shortage(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId', ParseUUIDPipe) sectionId: string, @Query('subjectId') subjectId?: string, @Query('threshold') threshold?: string, @Query('all') all?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.teacher.assertCanSeeSection(tx, p, sectionId);
      const cfg = await attendanceSettings(tx);
      const limit = threshold ? Math.min(100, Math.max(1, Number(threshold) || cfg.thresholdPct)) : cfg.thresholdPct;
      const roster = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo }).from(students).where(and(eq(students.sectionId, sectionId), eq(students.status, 'active')));
      const stats = await subjectAttendance(tx, roster.map((r) => r.id), limit, subjectId ? z.uuid().parse(subjectId) : undefined);
      const who = new Map(roster.map((r) => [r.id, r]));
      const rows = stats.filter((s) => all === 'true' || s.short).map((s) => ({ ...s, fullName: who.get(s.studentId)?.fullName ?? '', rollNo: who.get(s.studentId)?.rollNo ?? '' }));
      rows.sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }) || a.subject.localeCompare(b.subject));
      return { thresholdPct: limit, rows };
    });
  }

  /** Exam eligibility for a class: overall attendance after condonation against the threshold. */
  @Get('eligibility')
  @Auth('user', CLASS_ROLES)
  eligibility(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.teacher.assertCanSeeSection(tx, p, sectionId);
      const cfg = await attendanceSettings(tx);
      const roster = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo }).from(students).where(and(eq(students.sectionId, sectionId), eq(students.status, 'active')));
      const all = await overallAttendance(tx, roster.map((r) => r.id), cfg.thresholdPct);
      return { thresholdPct: cfg.thresholdPct, students: roster.map((r) => ({ studentId: r.id, fullName: r.fullName, rollNo: r.rollNo, ...all.get(r.id)! })) };
    });
  }

  // ---- condonation ----------------------------------------------------------------------

  /** Staff, students or parents ask for condonation. Multipart: the fields plus an optional `document` (PDF, JPEG or PNG). */
  @Post('condonations')
  @Auth('user', ['student', 'guardian', ...CLASS_ROLES])
  @UseInterceptors(FileInterceptor('document', { limits: { fileSize: MAX_DOC_BYTES, files: 1 } }))
  async requestCondonation(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CondonationBody)) b: z.infer<typeof CondonationBody>, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    let doc: { key: string; type: string } | undefined;
    if (file?.buffer?.length) {
      const type = documentType(file.buffer);
      if (!type) throw new BadRequestException('The document must be a PDF, JPEG or PNG');
      await this.scans.assertClean(file.buffer, 'The document');
      const key = `tenants/${p.tenantId}/attendance/condonations/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await this.storage.put(key, Readable.from(file.buffer), MAX_DOC_BYTES, type);
      doc = { key, type };
    }
    try {
      return await this.db.withTenant(p.tenantId, async (tx) => {
        const studentId = hasRole(p, ['student', 'guardian']) ? await this.family.actingStudent(tx, p, b.studentId) : b.studentId;
        if (!studentId) throw new BadRequestException('Choose the student');
        const [stu] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId));
        if (!stu) throw new NotFoundException('Student not found');
        const [row] = await tx
          .insert(attendanceCondonations)
          .values({ tenantId: p.tenantId, studentId, subjectId: b.subjectId ?? null, kind: b.kind, reason: b.reason, documentKey: doc?.key, documentType: doc?.type, requestedBy: p.userId })
          .returning();
        await auditUser(tx, p, 'attendance.condonation.requested', 'attendance_condonation', row.id, { studentId, kind: b.kind, hasDocument: !!doc });
        return this.view(row);
      });
    } catch (e) {
      if (doc) await this.storage.delete(doc.key).catch(() => undefined);
      throw e;
    }
  }

  @Get('condonations')
  @Auth('user', ['student', 'guardian', ...CLASS_ROLES])
  listCondonations(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const staff = hasRole(p, CLASS_ROLES);
      const kids = staff ? [] : await this.family.familyStudents(tx, p);
      if (!staff && kids.length === 0) return [];
      const rows = await tx
        .select({ c: attendanceCondonations, fullName: students.fullName, rollNo: students.rollNo })
        .from(attendanceCondonations)
        .innerJoin(students, eq(students.id, attendanceCondonations.studentId))
        .where(and(staff ? undefined : inArray(attendanceCondonations.studentId, kids), status ? eq(attendanceCondonations.status, status) : undefined))
        .orderBy(desc(attendanceCondonations.createdAt));
      return rows.map((r) => ({ ...this.view(r.c), fullName: r.fullName, rollNo: r.rollNo }));
    });
  }

  /** The principal decides and sets the percentage points that count towards eligibility. */
  @Post('condonations/:id/decision')
  @HttpCode(200)
  @Auth('user', CONDONATION_DECIDERS)
  decideCondonation(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CondonationDecision)) b: z.infer<typeof CondonationDecision>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select().from(attendanceCondonations).where(eq(attendanceCondonations.id, id)).for('update');
      if (!c) throw new NotFoundException('Condonation request not found');
      if (c.status !== 'pending') throw new ConflictException('This request was already decided');
      if (b.decision === 'approved' && b.points < 1) throw new BadRequestException('Give the percentage points to add');
      const [row] = await tx
        .update(attendanceCondonations)
        .set({ status: b.decision, approvedPoints: b.decision === 'approved' ? b.points : 0, decidedBy: p.userId, decidedAt: this.clock.now(), decisionNote: b.note })
        .where(eq(attendanceCondonations.id, id))
        .returning();
      await auditUser(tx, p, `attendance.condonation.${b.decision}`, 'attendance_condonation', id, { studentId: c.studentId, points: row.approvedPoints, note: b.note });
      return this.view(row);
    });
  }

  private view(r: typeof attendanceCondonations.$inferSelect) {
    const { documentKey, ...rest } = r;
    return { ...rest, hasDocument: !!documentKey };
  }

  // ---- QR attendance --------------------------------------------------------------------

  /** The teacher's screen asks for a fresh code every few seconds; each is valid for 30 seconds. */
  @Post('qr')
  @HttpCode(200)
  @Auth('user', CLASS_ROLES)
  qr(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(QrBody)) b: z.infer<typeof QrBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const day = b.date ?? (await this.teacher.localNow(tx)).date;
      const slot = await this.teacher.slotFor(tx, p, b.slotId, day);
      if (isoWeekday(day) !== slot.dayOfWeek) throw new BadRequestException('This period is not on that day');
      return { ...makeQrCode(this.env.JWT_SECRET, p.tenantId, slot.id, day, this.clock.now()), ttlSeconds: QR_TTL_SECONDS };
    });
  }
}

/** Student App: mark yourself present by scanning (or typing) the code on the teacher's screen. */
@Controller('v1/student/attendance')
export class StudentQrController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('scan')
  @HttpCode(200)
  @Auth('user', ['student'])
  scan(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ScanBody)) b: z.infer<typeof ScanBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const now = this.clock.now();
      const [stu] = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
      if (!stu) throw new NotFoundException('Student not found');
      const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
      const tz = t?.tz ?? 'Asia/Kolkata';
      const today = localParts(now, tz);
      // The code identifies the period, so only the student's own class periods today are tried.
      const slots = await tx.select().from(timetableSlots).where(and(eq(timetableSlots.sectionId, stu.sectionId), eq(timetableSlots.dayOfWeek, today.isoWeekday)));
      const check = checkQrCode(this.env.JWT_SECRET, p.tenantId, b.code, slots.map((x) => ({ slotId: x.id, date: today.date })), now);
      if (!check.ok) throw new BadRequestException(check.reason === 'malformed' ? 'Enter the 8 digits shown on the screen' : 'That code is not valid or has expired. Use the one on the screen now.');
      const slot = slots.find((x) => x.id === check.slotId)!;
      const cfg = await attendanceSettings(tx);
      const date = today.date;
      if (attendanceLocked(date, now, tz, cfg.lockHours)) throw new ConflictException('Attendance for this day is locked');
      const [cur] = await tx.select({ status: attendanceRecords.status }).from(attendanceRecords).where(and(eq(attendanceRecords.studentId, stu.id), eq(attendanceRecords.date, date), eq(attendanceRecords.timetableSlotId, slot.id)));
      // A mark the teacher already made stands: scanning never overrides it.
      if (cur) return { status: cur.status, alreadyMarked: true };
      await tx.insert(attendanceRecords).values({ tenantId: p.tenantId, studentId: stu.id, sectionId: stu.sectionId, date, timetableSlotId: slot.id, status: 'present', markedBy: p.userId, occurredAt: now });
      await auditUser(tx, p, 'attendance.qr_scan', 'timetable_slot', slot.id, { date, studentId: stu.id });
      return { status: 'present' as const, alreadyMarked: false };
    });
  }
}
