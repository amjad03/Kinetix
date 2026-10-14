import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { documentType } from '../admissions/public-admissions.controller.js';
import { attendancePolicy, attendanceWindow, classStudents, eligibilityFor } from '../attendance-governance/policy.js';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit, auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { PdfWriter } from '../common/pdf.js';
import { writeXlsx } from '../common/xlsx.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { attendanceAlerts, attendanceLeaves } from '../db/schema-academic-ops.js';
import { attendanceRecords, departments, guardians, sections, students, subjects, timetableSlots } from '../db/schema.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { addDays, isSchoolAdmin } from '../teacher/teacher.service.js';
import { AttendanceDeskService } from './desk.service.js';

const CLASS_ROLES: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const Status = z.enum(['present', 'absent', 'late', 'excused']);
const Records = z.array(z.object({ studentId: z.uuid(), status: Status })).min(1).max(600);
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30');

const DayBody = z.object({ sectionId: z.uuid(), date: Day, session: z.enum(['fn', 'an']).nullable().default(null), records: Records });
const CopyBody = z.object({ fromSlotId: z.uuid(), date: Day, toSlotIds: z.array(z.uuid()).min(1).max(12) });
const SpecialBody = z.object({ records: Records });
const RemindBody = z.object({ items: z.array(z.object({ slotId: z.uuid(), date: Day })).min(1).max(500) });
const LeaveBody = z
  .object({
    studentId: z.uuid().optional(),
    kind: z.enum(['on_duty', 'medical', 'personal']),
    fromDate: Day,
    toDate: Day,
    fromTime: z.union([Time, z.literal('')]).optional(),
    toTime: z.union([Time, z.literal('')]).optional(),
    reason: z.string().trim().min(3).max(1000),
    activity: z.string().trim().max(200).optional(),
    /** Staff who may decide record and approve in one step ("true"). */
    approve: z.enum(['true', 'false']).optional(),
  })
  .refine((b) => b.fromDate <= b.toDate, { message: 'The leave cannot end before it starts', path: ['toDate'] })
  .refine((b) => !b.fromTime === !b.toTime && (!b.fromTime || b.fromTime < b.toTime!), { message: 'Give both times, the first before the second', path: ['toTime'] });
const BulkOdBody = z
  .object({ studentIds: z.array(z.uuid()).min(1).max(500), fromDate: Day, toDate: Day, fromTime: Time.optional(), toTime: Time.optional(), activity: z.string().trim().min(2).max(200), reason: z.string().trim().min(3).max(1000), approve: z.boolean().default(false) })
  .refine((b) => b.fromDate <= b.toDate, { message: 'The leave cannot end before it starts', path: ['toDate'] })
  .refine((b) => !b.fromTime === !b.toTime && (!b.fromTime || b.fromTime < b.toTime!), { message: 'Give both times, the first before the second', path: ['toTime'] });
const DecideBody = z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() });
const NoteBody = z.object({ note: z.string().trim().min(3).max(500) });
const AlertsBody = z.object({ sectionIds: z.array(z.uuid()).max(200).optional() });

const uuid = (v: string | undefined, name: string) => {
  if (v === undefined || v === '') return undefined;
  if (!z.uuid().safeParse(v).success) throw new BadRequestException(`Unknown ${name}`);
  return v;
};
const day = (v: string | undefined) => (v ? Day.parse(v) : undefined);

/**
 * The attendance desk (ERP Attendance): a class's day and its mark sheets, whole-day and session marking, copying marks
 * across periods, special classes, unmarked hours, leave and on duty, eligibility across a programme, shortage alerts,
 * the monthly register and one student's attendance.
 */
@Controller('v1/attendance-desk')
export class AttendanceDeskController {
  constructor(
    private readonly db: DbService,
    private readonly desk: AttendanceDeskService,
    private readonly scans: UploadScanService,
    private readonly storage: ObjectStorage,
  ) {}

  /** The attendance rules in force for a class (or the institution). */
  @Get('policy')
  @Auth('user', CLASS_ROLES)
  policy(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId') sectionId?: string) {
    return this.db.withTenant(p.tenantId, (tx) => attendancePolicy(tx, uuid(sectionId, 'class') ?? null));
  }

  /** Classes this person may mark or watch (all for the principal; a teacher's own; a head's department's). */
  @Get('classes')
  @Auth('user', CLASS_ROLES)
  classes(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.execute<{ id: string; name: string; program: string }>(sql`
        select s.id, s.display_name as name, pr.name as program from sections s join programs pr on pr.id = s.program_id join academic_years y on y.id = s.academic_year_id
        where y.is_current and (${isSchoolAdmin(p)} or s.class_teacher_id = ${p.userId}::uuid
          or exists (select 1 from timetable_slots ts where ts.section_id = s.id and ts.teacher_id = ${p.userId}::uuid and ts.archived_at is null)
          or exists (select 1 from subjects sb join departments d on d.id = sb.department_id where sb.program_id = s.program_id and sb.term = s.term and d.head_user_id = ${p.userId}::uuid))
        order by pr.sort_order, pr.name, s.term, s.sort_order, s.display_name`);
      return rows.rows;
    });
  }

  /** The subjects a class is timetabled for (for register and report filters). */
  @Get('classes/:id/subjects')
  @Auth('user', [...CLASS_ROLES, 'exam_controller'])
  classSubjects(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .selectDistinct({ id: subjects.id, code: subjects.code, name: subjects.name })
        .from(timetableSlots)
        .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .where(sql`${timetableSlots.sectionId} = ${id}::uuid or ${id}::uuid = any(${timetableSlots.combinedSectionIds})`);
      return rows.sort((a, b) => a.code.localeCompare(b.code));
    });
  }

  @Get('day')
  @Auth('user', CLASS_ROLES)
  day(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId', ParseUUIDPipe) sectionId: string, @Query('date') date: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.desk.assertDayMarker(tx, p, sectionId);
      return this.desk.classDay(tx, sectionId, Day.parse(date));
    });
  }

  /** A mark sheet: `slotId` + `date` (a period), `sectionId` + `date` [+ `session`] (a day or session), or `specialId`. */
  @Get('sheet')
  @Auth('user', CLASS_ROLES)
  sheet(@CurrentPrincipal() p: UserPrincipal, @Query() q: Record<string, string>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const special = uuid(q.specialId, 'class');
      if (special) return this.desk.specialSheet(tx, p, special);
      const date = Day.parse(q.date);
      const slot = uuid(q.slotId, 'period');
      if (slot) return this.desk.periodSheet(tx, p, slot, date);
      const section = uuid(q.sectionId, 'class');
      if (!section) throw new BadRequestException('Choose a period or a class');
      return this.desk.daySheet(tx, p, section, date, q.session === 'fn' || q.session === 'an' ? q.session : null);
    });
  }

  @Post('day')
  @Auth('user', CLASS_ROLES)
  markDay(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DayBody)) b: z.infer<typeof DayBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.desk.markDay(tx, p, b));
  }

  @Post('copy')
  @HttpCode(200)
  @Auth('user', CLASS_ROLES)
  copy(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CopyBody)) b: z.infer<typeof CopyBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.desk.copyMarks(tx, p, b));
  }

  @Post('special/:id')
  @HttpCode(200)
  @Auth('user', CLASS_ROLES)
  markSpecial(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SpecialBody)) b: z.infer<typeof SpecialBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.desk.markSpecial(tx, p, id, b.records));
  }

  // ---- unmarked ----

  @Get('unmarked')
  @Auth('user', CLASS_ROLES)
  unmarked(@CurrentPrincipal() p: UserPrincipal, @Query() q: Record<string, string>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = (await this.desk.now(tx)).date;
      const to = day(q.to) ?? today;
      const from = day(q.from) ?? addDays(to, -6);
      const rows = await this.desk.unmarked(tx, p, { from, to, departmentId: uuid(q.departmentId, 'department'), teacherId: uuid(q.teacherId, 'teacher'), sectionId: uuid(q.sectionId, 'class') });
      const byTeacher = new Map<string, { teacherId: string; teacher: string; count: number }>();
      for (const r of rows) {
        const e = byTeacher.get(r.teacherId) ?? { teacherId: r.teacherId, teacher: r.teacher, count: 0 };
        e.count++;
        byTeacher.set(r.teacherId, e);
      }
      return { from, to, rows, byTeacher: [...byTeacher.values()].sort((a, b) => b.count - a.count) };
    });
  }

  @Post('unmarked/remind')
  @HttpCode(200)
  @Auth('user', ['principal', 'tenant_admin', 'hod'])
  remind(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RemindBody)) b: z.infer<typeof RemindBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.desk.remind(tx, p, b.items));
  }

  // ---- leave and on duty ----

  /**
   * A leave or on-duty request. Multipart: the fields plus an optional `document` (a medical certificate, an OD letter;
   * PDF, JPEG or PNG). Students and families apply for themselves; staff record it for a student, and those who may
   * decide can approve it at once (`approve=true`).
   */
  @Post('leaves')
  @Auth('user', ['student', 'guardian', ...CLASS_ROLES])
  @UseInterceptors(FileInterceptor('document', { limits: { fileSize: MAX_DOC_BYTES, files: 1 } }))
  async applyLeave(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(LeaveBody)) b: z.infer<typeof LeaveBody>, @UploadedFile() file?: { buffer: Buffer }) {
    let doc: { key: string; type: string } | undefined;
    if (file?.buffer?.length) {
      const type = documentType(file.buffer);
      if (!type) throw new BadRequestException('The document must be a PDF, JPEG or PNG');
      await this.scans.assertClean(file.buffer, 'The document');
      const key = `tenants/${p.tenantId}/attendance/leave/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await this.storage.put(key, Readable.from(file.buffer), MAX_DOC_BYTES, type);
      doc = { key, type };
    }
    try {
      return await this.db.withTenant(p.tenantId, async (tx) => {
        const staff = p.roles.some((r) => CLASS_ROLES.includes(r));
        const studentId = staff ? b.studentId : await this.familyStudent(tx, p, b.studentId);
        if (!studentId) throw new BadRequestException('Choose the student');
        await assertCanSeeStudent(tx, p, studentId, CLASS_ROLES);
        if (b.kind === 'medical' && !doc && !staff) throw new BadRequestException('Attach the medical certificate');
        const [overlap] = await tx
          .select({ id: attendanceLeaves.id })
          .from(attendanceLeaves)
          .where(and(eq(attendanceLeaves.studentId, studentId), inArray(attendanceLeaves.status, ['pending', 'approved']), lte(attendanceLeaves.fromDate, b.toDate), gte(attendanceLeaves.toDate, b.fromDate)));
        if (overlap) throw new ConflictException('The student already has leave for some of these days');
        const [row] = await tx
          .insert(attendanceLeaves)
          .values({ tenantId: p.tenantId, studentId, kind: b.kind, fromDate: b.fromDate, toDate: b.toDate, fromTime: b.fromTime || null, toTime: b.toTime || null, reason: b.reason, activity: b.activity ?? '', documentKey: doc?.key, documentType: doc?.type, requestedBy: p.userId })
          .returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'attendance_leave.created', subjectType: 'attendance_leave', subjectId: row.id, after: { kind: row.kind, fromDate: row.fromDate, toDate: row.toDate, reason: row.reason } });
        if (staff && b.approve === 'true') {
          // Recorded and approved in one step by someone who may decide; otherwise it waits for a decision.
          try {
            return this.view(await this.desk.decideLeave(tx, p, row.id, true, null));
          } catch (e) {
            if (!(e instanceof ForbiddenException)) throw e;
          }
        }
        return this.view(row);
      });
    } catch (e) {
      if (doc) await this.storage.delete(doc.key).catch(() => undefined);
      throw e;
    }
  }

  /** On duty for a group (a team at a fest, an NSS camp): one request per student; deciders can approve them at once. */
  @Post('leaves/on-duty')
  @Auth('user', CLASS_ROLES)
  bulkOnDuty(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(BulkOdBody)) b: z.infer<typeof BulkOdBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const found = await tx.select({ id: students.id }).from(students).where(inArray(students.id, b.studentIds));
      if (found.length !== new Set(b.studentIds).size) throw new BadRequestException('Some students were not found');
      const results: { studentId: string; ok: boolean; message?: string; leaveId?: string }[] = [];
      for (const studentId of [...new Set(b.studentIds)]) {
        await tx.execute(sql`savepoint od`);
        try {
          const [overlap] = await tx.select({ id: attendanceLeaves.id }).from(attendanceLeaves).where(and(eq(attendanceLeaves.studentId, studentId), inArray(attendanceLeaves.status, ['pending', 'approved']), lte(attendanceLeaves.fromDate, b.toDate), gte(attendanceLeaves.toDate, b.fromDate)));
          if (overlap) throw new ConflictException('Already has leave on these days');
          const [row] = await tx
            .insert(attendanceLeaves)
            .values({ tenantId: p.tenantId, studentId, kind: 'on_duty', fromDate: b.fromDate, toDate: b.toDate, fromTime: b.fromTime ?? null, toTime: b.toTime ?? null, reason: b.reason, activity: b.activity, requestedBy: p.userId })
            .returning();
          await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'attendance_leave.created', subjectType: 'attendance_leave', subjectId: row.id, after: { kind: 'on_duty', fromDate: b.fromDate, toDate: b.toDate, activity: b.activity } });
          if (b.approve) await this.desk.decideLeave(tx, p, row.id, true, null);
          await tx.execute(sql`release savepoint od`);
          results.push({ studentId, ok: true, leaveId: row.id });
        } catch (e) {
          await tx.execute(sql`rollback to savepoint od`);
          results.push({ studentId, ok: false, message: e instanceof Error ? e.message : 'Failed' });
        }
      }
      return { created: results.filter((r) => r.ok).length, results };
    });
  }

  @Post('leaves/:id/decision')
  @HttpCode(200)
  @Auth('user', CLASS_ROLES)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => this.view(await this.desk.decideLeave(tx, p, id, b.approve, b.note || null)));
  }

  @Post('leaves/:id/revoke')
  @HttpCode(200)
  @Auth('user', CLASS_ROLES)
  revoke(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(NoteBody)) b: z.infer<typeof NoteBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => this.view(await this.desk.revokeLeave(tx, p, id, b.note)));
  }

  /** Withdraws a pending request (whoever made it). */
  @Post('leaves/:id/cancel')
  @HttpCode(200)
  @Auth('user', ['student', 'guardian', ...CLASS_ROLES])
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [l] = await tx.select().from(attendanceLeaves).where(eq(attendanceLeaves.id, id));
      if (!l) throw new NotFoundException('Leave not found');
      await assertCanSeeStudent(tx, p, l.studentId, CLASS_ROLES);
      if (l.requestedBy !== p.userId) throw new ForbiddenException('Only the person who applied can withdraw it');
      if (l.status !== 'pending') throw new ConflictException(`This leave is already ${l.status}`);
      const [row] = await tx.update(attendanceLeaves).set({ status: 'cancelled' }).where(eq(attendanceLeaves.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'attendance_leave.cancelled', subjectType: 'attendance_leave', subjectId: id, changes: { status: { before: 'pending', after: 'cancelled' } } });
      return this.view(row);
    });
  }

  /** A family's own requests (`studentId` for one child). */
  @Get('leaves/mine')
  @Auth('user', ['student', 'guardian'])
  mine(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const kids = await this.familyIds(tx, p);
      const ids = studentId ? kids.filter((k) => k === studentId) : kids;
      if (!ids.length) return [];
      const rows = await tx.select({ l: attendanceLeaves, fullName: students.fullName }).from(attendanceLeaves).innerJoin(students, eq(students.id, attendanceLeaves.studentId)).where(inArray(attendanceLeaves.studentId, ids)).orderBy(desc(attendanceLeaves.createdAt)).limit(200);
      return rows.map((r) => ({ ...this.view(r.l), fullName: r.fullName }));
    });
  }

  @Get('leaves/:id/document')
  @Auth('user', ['student', 'guardian', ...CLASS_ROLES])
  async leaveDocument(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const l = await this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select().from(attendanceLeaves).where(eq(attendanceLeaves.id, id));
      if (!row?.documentKey) throw new NotFoundException('No document');
      await assertCanSeeStudent(tx, p, row.studentId, CLASS_ROLES);
      return row;
    });
    const { stream } = await this.storage.get(l.documentKey!);
    res.setHeader('content-type', l.documentType ?? 'application/octet-stream');
    res.setHeader('content-disposition', 'inline');
    stream.pipe(res);
  }

  // ---- eligibility across a programme, alerts ----

  /**
   * Students short of attendance across the classes of a programme (and term), or every class: condonable ones and
   * those detained under the policy, for the examination's eligibility list.
   */
  @Get('detention')
  @Auth('user', [...CLASS_ROLES, 'exam_controller'])
  detention(@CurrentPrincipal() p: UserPrincipal, @Query() q: Record<string, string>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const programId = uuid(q.programId, 'programme');
      const term = q.term && /^\d{1,2}$/.test(q.term) ? Number(q.term) : undefined;
      const secs = await tx.execute<{ id: string; name: string }>(sql`
        select s.id, s.display_name as name from sections s join academic_years y on y.id = s.academic_year_id
        where y.is_current and (${programId ?? null}::uuid is null or s.program_id = ${programId ?? null}::uuid) and (${term ?? null}::int is null or s.term = ${term ?? null}::int)
        order by s.display_name`);
      const today = (await this.desk.now(tx)).date;
      const out = [];
      let eligible = 0;
      for (const s of secs.rows) {
        const policy = await attendancePolicy(tx, s.id);
        const window = await attendanceWindow(tx, s.id, today);
        const roster = await classStudents(tx, s.id);
        const who = new Map(roster.map((r) => [r.id, r]));
        for (const e of await eligibilityFor(tx, roster.map((r) => r.id), policy, window)) {
          if (e.status === 'eligible') {
            eligible++;
            continue;
          }
          out.push({
            studentId: e.studentId,
            rollNo: who.get(e.studentId)!.rollNo,
            fullName: who.get(e.studentId)!.fullName,
            sectionId: s.id,
            section: s.name,
            status: e.status,
            pct: e.overall.pct,
            effectivePct: e.overall.effective,
            thresholdPct: policy.thresholdPct,
            basis: policy.basis,
            shortIn: e.subjects.filter((x) => e.shortIn.includes(x.subjectId)).map((x) => ({ code: x.code, subject: x.subject, pct: x.pct, effective: x.effective })),
          });
        }
      }
      return { classes: secs.rows.length, eligible, rows: out };
    });
  }

  /** Sends shortage alerts now (otherwise the evening job does), for some classes or all. */
  @Post('alerts/run')
  @HttpCode(200)
  @Auth('user', STAFF_ADMIN_ROLES)
  runAlerts(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AlertsBody)) b: z.infer<typeof AlertsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.desk.sendShortageAlerts(tx, b.sectionIds?.length ? b.sectionIds : null);
      await auditUser(tx, p, 'attendance.alerts_sent', 'tenant', p.tenantId, r);
      return r;
    });
  }

  /** Shortage alerts sent, newest first. */
  @Get('alerts')
  @Auth('user', ['principal', 'tenant_admin', 'hod'])
  alerts(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId') sectionId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sec = uuid(sectionId, 'class');
      const rows = await tx
        .select({ a: attendanceAlerts, fullName: students.fullName, rollNo: students.rollNo, section: sections.displayName, subject: subjects.name })
        .from(attendanceAlerts)
        .innerJoin(students, eq(students.id, attendanceAlerts.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .leftJoin(subjects, sql`${subjects.id}::text = ${attendanceAlerts.scope}`)
        .where(sec ? eq(students.sectionId, sec) : undefined)
        .orderBy(desc(attendanceAlerts.sentAt))
        .limit(500);
      return rows.map((r) => ({ ...r.a, fullName: r.fullName, rollNo: r.rollNo, section: r.section, subject: r.subject }));
    });
  }

  // ---- registers, one student, the day's dashboard ----

  /** The monthly register of a class; `format=xlsx|pdf` downloads it. */
  @Get('register')
  @Auth('user', [...CLASS_ROLES, 'exam_controller'])
  async register(@CurrentPrincipal() p: UserPrincipal, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const sectionId = uuid(q.sectionId, 'class');
    if (!sectionId) throw new BadRequestException('Choose a class');
    const month = /^\d{4}-\d{2}$/.test(q.month ?? '') ? q.month : undefined;
    const r = await this.db.withTenant(p.tenantId, async (tx) => {
      if (!p.roles.includes('exam_controller')) await this.desk.assertDayMarker(tx, p, sectionId);
      const out = await this.desk.register(tx, sectionId, month ?? (await this.desk.now(tx)).date.slice(0, 7), uuid(q.subjectId, 'subject'));
      if (q.format) await auditUser(tx, p, 'attendance.register_exported', 'section', sectionId, { month: out.month, format: q.format });
      return out;
    });
    if (q.format !== 'xlsx' && q.format !== 'pdf') return r;
    const head = ['Roll', 'Student', ...r.days.map((d) => d.slice(8)), 'Held', 'Attended', '%'];
    const grid: (string | number | null)[][] = [head, ...r.students.map((s) => [s.rollNo, s.fullName, ...r.days.map((d) => s.cells[d] ?? ''), s.held, s.attended, s.pct])];
    const name = `attendance-register-${r.section.replace(/[^\w-]+/g, '-')}-${r.month}`;
    if (q.format === 'xlsx') {
      res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('content-disposition', `attachment; filename="${name}.xlsx"`);
      res.end(writeXlsx(r.month, grid.map((line) => line.map((c) => (c === '' ? null : c)))));
      return;
    }
    const pdf = new PdfWriter();
    pdf.text(`Attendance register: ${r.section}, ${r.month}`, { size: 13, bold: true });
    pdf.gap(4);
    const fixed = [0, 30];
    const step = (515 - 150) / Math.max(1, r.days.length + 3);
    const xs = [...fixed, ...Array.from({ length: r.days.length + 3 }, (_, i) => Math.round(150 + i * step))];
    grid.forEach((line, i) => pdf.row(line.map((c) => String(c ?? '')), xs, { bold: i === 0, size: 6 }));
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="${name}.pdf"`);
    res.end(pdf.build());
  }

  /** One student's attendance by subject and by day: staff, the student, or their family. */
  @Get('students/:id')
  @Auth('user')
  student(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, id, [...CLASS_ROLES, 'exam_controller', 'admissions_officer']);
      return this.desk.studentView(tx, id, { from: day(from), to: day(to) });
    });
  }

  /**
   * The day across departments: periods that met, how many were marked, attendance among the marks, and the unmarked
   * ones; heads of department see their own department.
   */
  @Get('dashboard')
  @Auth('user', ['principal', 'tenant_admin', 'hod'])
  dashboard(@CurrentPrincipal() p: UserPrincipal, @Query('date') date?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = day(date) ?? (await this.desk.now(tx)).date;
      const unmarked = await this.desk.unmarked(tx, p, { from: d, to: d });
      const marks = await tx
        .select({ departmentId: subjects.departmentId, status: attendanceRecords.status, n: sql<number>`count(*)::int` })
        .from(attendanceRecords)
        .innerJoin(timetableSlots, eq(timetableSlots.id, attendanceRecords.timetableSlotId))
        .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .where(eq(attendanceRecords.date, d))
        .groupBy(subjects.departmentId, attendanceRecords.status);
      const periods = await tx
        .select({ departmentId: subjects.departmentId, n: sql<number>`count(distinct ${attendanceRecords.timetableSlotId})::int` })
        .from(attendanceRecords)
        .innerJoin(timetableSlots, eq(timetableSlots.id, attendanceRecords.timetableSlotId))
        .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .where(eq(attendanceRecords.date, d))
        .groupBy(subjects.departmentId);
      const deptOf = new Map((await tx.select({ id: subjects.id, departmentId: subjects.departmentId }).from(subjects)).map((s) => [s.id, s.departmentId]));
      const headed = isSchoolAdmin(p) ? null : new Set((await tx.select({ id: departments.id }).from(departments).where(eq(departments.headUserId, p.userId))).map((x) => x.id));
      const depts = await tx.select({ id: departments.id, name: departments.name }).from(departments).orderBy(departments.sortOrder, departments.name);
      const row = (id: string | null, name: string) => {
        const m = marks.filter((x) => x.departmentId === id);
        const count = (s: string) => m.filter((x) => x.status === s).reduce((a, x) => a + x.n, 0);
        const present = count('present') + count('late');
        const absent = count('absent');
        return {
          departmentId: id,
          department: name,
          periodsMarked: periods.find((x) => x.departmentId === id)?.n ?? 0,
          unmarked: unmarked.filter((u) => (deptOf.get(u.subjectId) ?? null) === id).length,
          present,
          absent,
          excused: count('excused'),
          rate: present + absent ? Math.round((present / (present + absent)) * 1000) / 10 : null,
        };
      };
      const list = [...depts.filter((x) => !headed || headed.has(x.id)).map((x) => row(x.id, x.name)), ...(headed ? [] : [row(null, '')])];
      return { date: d, departments: list.filter((x) => x.departmentId !== null || x.periodsMarked + x.unmarked > 0), unmarked: unmarked.length };
    });
  }

  // ---- helpers ----

  private async familyIds(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0], p: UserPrincipal) {
    const own = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
    const kids = await tx.select({ id: guardians.studentId }).from(guardians).where(eq(guardians.userId, p.userId));
    return [...own, ...kids].map((r) => r.id);
  }

  private async familyStudent(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0], p: UserPrincipal, studentId?: string) {
    const mine = await this.familyIds(tx, p);
    const id = studentId ?? (mine.length === 1 ? mine[0] : undefined);
    if (!id || !mine.includes(id)) throw new NotFoundException('Student not found');
    return id;
  }

  private view(r: typeof attendanceLeaves.$inferSelect) {
    const { documentKey, applied: _applied, ...rest } = r;
    return { ...rest, hasDocument: !!documentKey };
  }
}
