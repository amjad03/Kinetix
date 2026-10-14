import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
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
import { DbService, type Tx } from '../db/db.service.js';
import { attendanceLeaves } from '../db/schema-academic-ops.js';
import { attendanceCondonations, attendanceCorrections, attendanceRecords, sections, students, subjects, tenants, timetableSlots, users } from '../db/schema.js';
import { CampusLifeService } from '../campus-life/campus-life.service.js';
import { hasRole } from '../placements/placements.access.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { CalendarService } from '../timetable/calendar.service.js';
import { TeacherService } from '../teacher/teacher.service.js';
import { attendanceLocked, checkQrCode, makeQrCode, QR_TTL_SECONDS } from './attendance-rules.js';
import { CONDONATION_DECIDERS, CORRECTION_DECIDERS, decideCondonation, decideCorrection, recordCondonationFee } from './decisions.js';
import { attendanceSettings } from './eligibility.js';
import { attendancePolicy, attendanceWindow, canBeCondoned, classStudents, eligibilityFor } from './policy.js';

const CLASS_ROLES: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];
const MAX_DOC_BYTES = 5 * 1024 * 1024;

const CorrectionBody = z.object({ slotId: z.uuid(), date: Day, studentId: z.uuid(), toStatus: z.enum(['present', 'absent', 'late', 'excused']), reason: z.string().trim().min(5).max(500) });
const DecisionBody = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().min(3).max(500) });
const CondonationBody = z.object({ studentId: z.uuid().optional(), subjectId: z.uuid().optional(), kind: z.enum(['medical', 'other']), reason: z.string().trim().min(5).max(1000), leaveIds: z.string().trim().max(2000).optional() });
const CondonationDecision = z.object({ decision: z.enum(['approved', 'rejected']), points: z.number().int().min(0).max(30).default(0), note: z.string().trim().min(3).max(500), feePaise: z.number().int().min(0).max(10_000_000).optional() });
const FeeBody = z.object({ action: z.enum(['paid', 'waived']), receipt: z.string().trim().min(1).max(60).optional(), note: z.string().trim().max(500).optional() });
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
      await this.teacher.assertMeets(tx, slot, b.date);
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
    return this.db.withTenant(p.tenantId, (tx) => decideCorrection(tx, p, id, b.decision, b.note, this.clock.now()));
  }

  // ---- shortage and eligibility ---------------------------------------------------------

  /**
   * Students under the threshold, per subject, for one class over the current term (or `from`/`to`), condonation
   * applied. `all=true` lists everyone; `threshold` tries another threshold.
   */
  @Get('shortage')
  @Auth('user', CLASS_ROLES)
  shortage(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId', ParseUUIDPipe) sectionId: string, @Query() q: Record<string, string>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.teacher.assertCanSeeSection(tx, p, sectionId);
      const policy = await attendancePolicy(tx, sectionId);
      const limit = q.threshold ? Math.min(100, Math.max(1, Number(q.threshold) || policy.thresholdPct)) : policy.thresholdPct;
      const subjectId = q.subjectId ? z.uuid().parse(q.subjectId) : undefined;
      const window = await attendanceWindow(tx, sectionId, (await this.teacher.localNow(tx)).date, { from: q.from ? Day.parse(q.from) : undefined, to: q.to ? Day.parse(q.to) : undefined });
      const roster = await classStudents(tx, sectionId);
      const stats = await eligibilityFor(tx, roster.map((r) => r.id), { ...policy, thresholdPct: limit }, window);
      const who = new Map(roster.map((r) => [r.id, r]));
      const rows = stats
        .flatMap((s) => s.subjects.map((x) => ({ s, x })))
        .filter(({ x }) => (!subjectId || x.subjectId === subjectId) && (q.all === 'true' || x.short))
        .map(({ s, x }) => ({
          studentId: s.studentId,
          fullName: who.get(s.studentId)?.fullName ?? '',
          rollNo: who.get(s.studentId)?.rollNo ?? '',
          subjectId: x.subjectId,
          subject: x.subject,
          code: x.code,
          held: x.held,
          present: x.attended,
          late: 0,
          absent: x.held - x.attended,
          pct: x.pct,
          condonedPoints: x.condoned,
          effectivePct: x.effective,
          short: x.short,
          condonable: canBeCondoned({ ...policy, thresholdPct: limit }, x.pct),
        }));
      rows.sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }) || a.subject.localeCompare(b.subject));
      return { thresholdPct: limit, source: policy.source, basis: policy.basis, condonableToPct: policy.condonableToPct, window, rows };
    });
  }

  /**
   * Exam eligibility for a class under the policy in force (docs/architecture/university-profiles.md): per subject or
   * overall as the university counts it, condonation applied, and who is eligible, short but condonable, or detained.
   */
  @Get('eligibility')
  @Auth('user', CLASS_ROLES)
  eligibility(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId', ParseUUIDPipe) sectionId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.teacher.assertCanSeeSection(tx, p, sectionId);
      const policy = await attendancePolicy(tx, sectionId);
      const window = await attendanceWindow(tx, sectionId, (await this.teacher.localNow(tx)).date, { from: from ? Day.parse(from) : undefined, to: to ? Day.parse(to) : undefined });
      const roster = await classStudents(tx, sectionId);
      const list = new Map((await eligibilityFor(tx, roster.map((r) => r.id), policy, window)).map((e) => [e.studentId, e]));
      return {
        thresholdPct: policy.thresholdPct,
        source: policy.source,
        basis: policy.basis,
        condonableToPct: policy.condonableToPct,
        maxCondonationPoints: policy.maxCondonationPoints,
        profile: policy.profile,
        window,
        students: roster.map((r) => {
          const e = list.get(r.id)!;
          return {
            studentId: r.id,
            fullName: r.fullName,
            rollNo: r.rollNo,
            pct: e.overall.pct,
            condonedPoints: e.overall.condoned,
            effectivePct: e.overall.effective,
            held: e.overall.held,
            attended: e.overall.attended,
            eligible: e.status === 'eligible',
            status: e.status,
            warning: e.warning,
            shortIn: e.shortIn,
            subjects: e.subjects,
          };
        }),
      };
    });
  }

  // ---- condonation ----------------------------------------------------------------------

  /**
   * Staff, students or parents ask for condonation. Multipart: the fields plus an optional `document` (PDF, JPEG or
   * PNG) and `leaveIds` (comma-separated approved medical leave of the student the request rests on).
   */
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
        const leaveIds = b.leaveIds ? [...new Set(b.leaveIds.split(',').map((x) => x.trim()).filter(Boolean))] : [];
        if (leaveIds.some((x) => !z.uuid().safeParse(x).success)) throw new BadRequestException('Unknown leave');
        if (leaveIds.length) {
          const found = await tx.select({ id: attendanceLeaves.id }).from(attendanceLeaves).where(and(inArray(attendanceLeaves.id, leaveIds), eq(attendanceLeaves.studentId, studentId), eq(attendanceLeaves.status, 'approved')));
          if (found.length !== leaveIds.length) throw new BadRequestException("Only the student's own approved leave can be attached");
        }
        const [row] = await tx
          .insert(attendanceCondonations)
          .values({ tenantId: p.tenantId, studentId, subjectId: b.subjectId ?? null, kind: b.kind, reason: b.reason, documentKey: doc?.key, documentType: doc?.type, requestedBy: p.userId, leaveIds: leaveIds.length ? leaveIds : null })
          .returning();
        await auditUser(tx, p, 'attendance.condonation.requested', 'attendance_condonation', row.id, { studentId, kind: b.kind, hasDocument: !!doc, leave: leaveIds.length });
        return this.view(row);
      });
    } catch (e) {
      if (doc) await this.storage.delete(doc.key).catch(() => undefined);
      throw e;
    }
  }

  /**
   * Condonation requests (staff see all, families their own). For staff, a pending request carries the student's
   * attendance now and the points the attached medical leave would make up (its periods as a share of those held).
   */
  @Get('condonations')
  @Auth('user', ['student', 'guardian', ...CLASS_ROLES])
  listCondonations(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const staff = hasRole(p, CLASS_ROLES);
      const kids = staff ? [] : await this.family.familyStudents(tx, p);
      if (!staff && kids.length === 0) return [];
      const rows = await tx
        .select({ c: attendanceCondonations, fullName: students.fullName, rollNo: students.rollNo, sectionId: students.sectionId, section: sections.displayName, subject: subjects.name })
        .from(attendanceCondonations)
        .innerJoin(students, eq(students.id, attendanceCondonations.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .leftJoin(subjects, eq(subjects.id, attendanceCondonations.subjectId))
        .where(and(staff ? undefined : inArray(attendanceCondonations.studentId, kids), status ? eq(attendanceCondonations.status, status) : undefined))
        .orderBy(desc(attendanceCondonations.createdAt));
      const today = (await this.teacher.localNow(tx)).date;
      const out = [];
      for (const r of rows) {
        let attendance: { pct: number | null; effectivePct: number | null; suggestedPoints: number | null; condonable: boolean } | null = null;
        if (staff && r.c.status === 'pending') {
          const policy = await attendancePolicy(tx, r.sectionId);
          const window = await attendanceWindow(tx, r.sectionId, today);
          const [e] = await eligibilityFor(tx, [r.c.studentId], policy, window);
          const tally = r.c.subjectId ? e.subjects.find((x) => x.subjectId === r.c.subjectId) : e.overall;
          const leaveHours = r.c.leaveIds?.length ? await this.leaveHours(tx, r.c.studentId, r.c.leaveIds, r.c.subjectId) : 0;
          attendance = {
            pct: tally?.pct ?? null,
            effectivePct: tally?.effective ?? null,
            suggestedPoints: tally && tally.held > 0 && leaveHours > 0 ? Math.min(policy.maxCondonationPoints, Math.ceil((leaveHours / tally.held) * 100)) : null,
            condonable: canBeCondoned(policy, tally?.pct ?? null),
          };
        }
        out.push({ ...this.view(r.c), fullName: r.fullName, rollNo: r.rollNo, section: r.section, subject: r.subject, attendance });
      }
      return out;
    });
  }

  /**
   * The principal decides and sets the percentage points that count towards eligibility: no more than the office's
   * condonation limit, and not for a student below the university's condonation floor. With a condonation fee the
   * points count once the fee is paid or waived.
   */
  @Post('condonations/:id/decision')
  @HttpCode(200)
  @Auth('user', CONDONATION_DECIDERS)
  decideCondonation(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CondonationDecision)) b: z.infer<typeof CondonationDecision>) {
    return this.db.withTenant(p.tenantId, async (tx) => this.view(await decideCondonation(tx, p, id, b, this.clock.now(), (await this.teacher.localNow(tx)).date)));
  }

  /** Records the condonation fee as paid (with the receipt) or waives it; the points count from then on. */
  @Post('condonations/:id/fee')
  @HttpCode(200)
  @Auth('user', [...CONDONATION_DECIDERS, 'accountant'])
  condonationFee(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(FeeBody)) b: z.infer<typeof FeeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => this.view(await recordCondonationFee(tx, p, id, b, this.clock.now())));
  }

  /** The supporting document of a condonation request (staff, or the family that made it). */
  @Get('condonations/:id/document')
  @Auth('user', ['student', 'guardian', ...CLASS_ROLES])
  async condonationDocument(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const c = await this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select().from(attendanceCondonations).where(eq(attendanceCondonations.id, id));
      if (!row?.documentKey) throw new NotFoundException('No document');
      if (!hasRole(p, CLASS_ROLES) && !(await this.family.familyStudents(tx, p)).includes(row.studentId)) throw new NotFoundException('No document');
      return row;
    });
    const { stream } = await this.storage.get(c.documentKey!);
    res.setHeader('content-type', c.documentType ?? 'application/octet-stream');
    res.setHeader('content-disposition', 'inline');
    stream.pipe(res);
  }

  /** Marked periods inside the student's approved leave, for one subject or all. */
  private async leaveHours(tx: Tx, studentId: string, leaveIds: string[], subjectId: string | null): Promise<number> {
    const leave = await tx.select().from(attendanceLeaves).where(and(inArray(attendanceLeaves.id, leaveIds), eq(attendanceLeaves.studentId, studentId), eq(attendanceLeaves.status, 'approved')));
    let n = 0;
    for (const l of leave) {
      const [{ c }] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(attendanceRecords)
        .innerJoin(timetableSlots, eq(timetableSlots.id, attendanceRecords.timetableSlotId))
        .where(and(eq(attendanceRecords.studentId, studentId), gte(attendanceRecords.date, l.fromDate), lte(attendanceRecords.date, l.toDate), subjectId ? eq(timetableSlots.subjectId, subjectId) : undefined));
      n += c;
    }
    return n;
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
      await this.teacher.assertMeets(tx, slot, day);
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
    private readonly calendar: CalendarService,
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
      // The code identifies the period, so only the student's own class periods today are tried (a compensatory
      // working day follows another weekday's timetable).
      const [sec] = await tx.select({ programId: sections.programId }).from(sections).where(eq(sections.id, stu.sectionId));
      const weekday = (await this.calendar.dayOrders(tx, today.date, today.date)).weekday(today.date, sec?.programId);
      const slots = await tx.select().from(timetableSlots).where(and(eq(timetableSlots.sectionId, stu.sectionId), eq(timetableSlots.dayOfWeek, weekday)));
      const check = checkQrCode(this.env.JWT_SECRET, p.tenantId, b.code, slots.map((x) => ({ slotId: x.id, date: today.date })), now);
      if (!check.ok) throw new BadRequestException(check.reason === 'malformed' ? 'Enter the 8 digits shown on the screen' : 'That code is not valid or has expired. Use the one on the screen now.');
      const slot = slots.find((x) => x.id === check.slotId)!;
      const cfg = await attendanceSettings(tx, stu.sectionId);
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
