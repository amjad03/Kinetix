import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { SETTINGS_DEFAULTS, SETTINGS_SCHEMAS } from '../academics/academics-rules.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit, auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { electiveBaskets, electiveBasketSubjects, facultyAllocations, periodStructures, studentBatches } from '../db/schema-academic-ops.js';
import { academicSettings, departments, programs, sections, students, subjects, timetableSlots } from '../db/schema.js';
import { addDays } from '../teacher/teacher.service.js';
import { CalendarService } from '../timetable/calendar.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { loadStatus, workingDays } from './planning-rules.js';

const ADMIN: RoleName[] = ['tenant_admin', 'principal'];
const HEADS: RoleName[] = [...ADMIN, 'hod'];
const READ: RoleName[] = [...HEADS, 'teacher', 'exam_controller', 'admissions_officer'];

const MembersBody = z.object({ subjectIds: z.array(z.uuid()).max(60) });
const BatchesBody = z.object({ sectionId: z.uuid(), assignments: z.array(z.object({ studentId: z.uuid(), batch: z.string().trim().max(20).nullable() })).min(1).max(600) });
const SplitBody = z.object({ sectionId: z.uuid(), count: z.number().int().min(2).max(8), prefix: z.string().trim().min(1).max(10).default('B') });

const hours = (start: string, end: string) => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return (m(end) - m(start)) / 60;
};

/**
 * Academic planning beyond the kit lists: an elective basket's courses, lab batches of a class, the teaching load
 * against the norms, working days by month and the bell schedule a class follows.
 */
@Controller('v1/academic-planning')
export class AcademicPlanningController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly timetable: TimetableService,
    private readonly calendar: CalendarService,
  ) {}

  // ---- elective basket members ----

  /** The basket's courses and the courses that could go in it (its programme's term first, then every other course). */
  @Get('baskets/:id/subjects')
  @Auth('user', READ)
  members(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [b] = await tx.select().from(electiveBaskets).where(eq(electiveBaskets.id, id));
      if (!b) throw new NotFoundException('Basket not found');
      const chosen = new Set((await tx.select({ id: electiveBasketSubjects.subjectId }).from(electiveBasketSubjects).where(eq(electiveBasketSubjects.basketId, id))).map((r) => r.id));
      const all = await tx
        .select({ id: subjects.id, code: subjects.code, name: subjects.name, credits: subjects.credits, courseType: subjects.courseType, programId: subjects.programId, program: programs.name, term: subjects.term })
        .from(subjects)
        .innerJoin(programs, eq(programs.id, subjects.programId))
        .orderBy(asc(programs.name), asc(subjects.term), asc(subjects.code));
      const own = (s: (typeof all)[number]) => s.programId === b.programId && s.term === b.term;
      return { basket: b, subjects: [...all.filter(own), ...all.filter((s) => !own(s))].map((s) => ({ ...s, chosen: chosen.has(s.id), sameTerm: own(s) })) };
    });
  }

  @Put('baskets/:id/subjects')
  @Auth('user', HEADS)
  setMembers(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MembersBody)) b: z.infer<typeof MembersBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [basket] = await tx.select().from(electiveBaskets).where(eq(electiveBaskets.id, id));
      if (!basket) throw new NotFoundException('Basket not found');
      const ids = [...new Set(b.subjectIds)];
      if (ids.length) {
        const found = await tx.select({ id: subjects.id }).from(subjects).where(inArray(subjects.id, ids));
        if (found.length !== ids.length) throw new BadRequestException('Some courses were not found');
      }
      if (ids.length && ids.length < basket.minChoose) throw new BadRequestException(`The basket needs at least ${basket.minChoose} courses to choose from`);
      const before = (await tx.select({ id: electiveBasketSubjects.subjectId, code: subjects.code }).from(electiveBasketSubjects).innerJoin(subjects, eq(subjects.id, electiveBasketSubjects.subjectId)).where(eq(electiveBasketSubjects.basketId, id))).map((r) => r.code).sort();
      await tx.delete(electiveBasketSubjects).where(eq(electiveBasketSubjects.basketId, id));
      if (ids.length) await tx.insert(electiveBasketSubjects).values(ids.map((subjectId) => ({ tenantId: p.tenantId, basketId: id, subjectId })));
      const after = ids.length ? (await tx.select({ code: subjects.code }).from(subjects).where(inArray(subjects.id, ids))).map((r) => r.code).sort() : [];
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'elective_basket.courses_set', subjectType: 'elective_basket', subjectId: id, changes: { courses: { before: before.join(', '), after: after.join(', ') } } });
      return { count: ids.length };
    });
  }

  // ---- lab and tutorial batches ----

  @Get('batches')
  @Auth('user', READ)
  batches(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [sec] = await tx.select({ id: sections.id, name: sections.displayName }).from(sections).where(eq(sections.id, sectionId));
      if (!sec) throw new NotFoundException('Class not found');
      const rows = await tx
        .select({ id: students.id, rollNo: students.rollNo, fullName: students.fullName, batch: studentBatches.batch })
        .from(students)
        .leftJoin(studentBatches, and(eq(studentBatches.studentId, students.id), eq(studentBatches.sectionId, sectionId)))
        .where(and(eq(students.sectionId, sectionId), inArray(students.status, ['active', 'on_leave', 'detained'])));
      rows.sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));
      const periods = await tx.select({ batch: timetableSlots.batch, n: sql<number>`count(*)::int` }).from(timetableSlots).where(and(eq(timetableSlots.sectionId, sectionId), isNull(timetableSlots.archivedAt), sql`${timetableSlots.batch} is not null`)).groupBy(timetableSlots.batch);
      const names = [...new Set([...rows.map((r) => r.batch), ...periods.map((x) => x.batch)].filter((x): x is string => !!x))].sort();
      return { section: sec, batches: names.map((name) => ({ name, students: rows.filter((r) => r.batch === name).length, periods: periods.find((x) => x.batch === name)?.n ?? 0 })), students: rows };
    });
  }

  @Put('batches')
  @Auth('user', HEADS)
  saveBatches(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(BatchesBody)) b: z.infer<typeof BatchesBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ids = b.assignments.map((a) => a.studentId);
      const found = await tx.select({ id: students.id }).from(students).where(and(eq(students.sectionId, b.sectionId), inArray(students.id, ids)));
      if (found.length !== new Set(ids).size) throw new BadRequestException('Some students are not in this class');
      for (const a of b.assignments) {
        if (!a.batch) await tx.delete(studentBatches).where(and(eq(studentBatches.sectionId, b.sectionId), eq(studentBatches.studentId, a.studentId)));
        else await tx.insert(studentBatches).values({ tenantId: p.tenantId, sectionId: b.sectionId, studentId: a.studentId, batch: a.batch }).onConflictDoUpdate({ target: [studentBatches.sectionId, studentBatches.studentId], set: { batch: a.batch } });
      }
      await auditUser(tx, p, 'section.batches_saved', 'section', b.sectionId, { count: b.assignments.length });
      return { saved: b.assignments.length };
    });
  }

  /** Splits a class into equal batches in roll-number order ("B1", "B2", ...). */
  @Post('batches/split')
  @HttpCode(200)
  @Auth('user', HEADS)
  split(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SplitBody)) b: z.infer<typeof SplitBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ id: students.id, rollNo: students.rollNo }).from(students).where(and(eq(students.sectionId, b.sectionId), inArray(students.status, ['active', 'on_leave', 'detained'])));
      if (rows.length < b.count) throw new BadRequestException('The class has fewer students than batches');
      rows.sort((a, c) => a.rollNo.localeCompare(c.rollNo, undefined, { numeric: true }));
      const size = Math.ceil(rows.length / b.count);
      for (const [i, r] of rows.entries()) {
        const batch = `${b.prefix}${Math.floor(i / size) + 1}`;
        await tx.insert(studentBatches).values({ tenantId: p.tenantId, sectionId: b.sectionId, studentId: r.id, batch }).onConflictDoUpdate({ target: [studentBatches.sectionId, studentBatches.studentId], set: { batch } });
      }
      await auditUser(tx, p, 'section.batches_split', 'section', b.sectionId, { count: b.count, students: rows.length });
      return { batches: b.count, students: rows.length };
    });
  }

  // ---- teaching load ----

  /**
   * Each teacher's load: hours allocated (current faculty allocations) and hours timetabled a week, against the norm
   * for their designation (Academics settings, UGC norms by default). Heads of department see their department.
   */
  @Get('workload')
  @Auth('user', [...HEADS, 'teacher'])
  workload(@CurrentPrincipal() p: UserPrincipal, @Query('departmentId') departmentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (departmentId && !z.uuid().safeParse(departmentId).success) throw new BadRequestException('Unknown department');
      const settings = await this.workloadSettings(tx);
      const norm = (designation: string | null) => settings.norms.find((n) => designation && n.designation.toLowerCase() === designation.toLowerCase())?.hoursPerWeek ?? settings.defaultHoursPerWeek;
      const teachers = await tx.execute<{ id: string; name: string; designation: string | null; department: string | null; department_id: string | null }>(sql`
        select distinct u.id, u.full_name as name, d.name as designation, dep.name as department, dep.id as department_id
        from users u join user_roles ur on ur.user_id = u.id and ur.role in ('teacher','hod')
        left join staff_profiles sp on sp.user_id = u.id left join designations d on d.id = sp.designation_id left join departments dep on dep.id = sp.department_id
        where u.status = 'active' and (${departmentId ?? null}::uuid is null or sp.department_id = ${departmentId ?? null}::uuid)
        order by u.full_name`);
      const isAdmin = p.roles.some((r) => ADMIN.includes(r));
      const headed = p.roles.includes('hod') && !isAdmin ? new Set((await tx.select({ id: departments.id }).from(departments).where(eq(departments.headUserId, p.userId))).map((d) => d.id)) : null;
      const visible = teachers.rows.filter((t) => isAdmin || t.id === p.userId || (headed && t.department_id && headed.has(t.department_id)));
      const ids = visible.map((t) => t.id);
      const allocs = ids.length
        ? await tx
            .select({ teacherId: facultyAllocations.teacherId, hours: facultyAllocations.hoursPerWeek, role: facultyAllocations.role, section: sections.displayName, code: subjects.code, subject: subjects.name, batch: facultyAllocations.batch })
            .from(facultyAllocations)
            .innerJoin(sections, eq(sections.id, facultyAllocations.sectionId))
            .innerJoin(subjects, eq(subjects.id, facultyAllocations.subjectId))
            .where(and(inArray(facultyAllocations.teacherId, ids), sql`(${facultyAllocations.toDate} is null or ${facultyAllocations.toDate} >= current_date)`, sql`(${facultyAllocations.fromDate} is null or ${facultyAllocations.fromDate} <= current_date)`))
        : [];
      const slots = ids.length ? await tx.select({ teacherId: timetableSlots.teacherId, startsAt: timetableSlots.startsAt, endsAt: timetableSlots.endsAt, sectionId: timetableSlots.sectionId, subjectId: timetableSlots.subjectId }).from(timetableSlots).where(and(inArray(timetableSlots.teacherId, ids), isNull(timetableSlots.archivedAt))) : [];
      const rows = visible.map((t) => {
        const mine = allocs.filter((a) => a.teacherId === t.id);
        const periods = slots.filter((s) => s.teacherId === t.id);
        const allocated = mine.reduce((n, a) => n + a.hours, 0);
        const timetabled = Math.round(periods.reduce((n, s) => n + hours(s.startsAt, s.endsAt), 0) * 10) / 10;
        const target = norm(t.designation);
        return {
          teacherId: t.id,
          teacher: t.name,
          designation: t.designation,
          department: t.department,
          norm: target,
          allocated,
          timetabled,
          periods: periods.length,
          classes: new Set(periods.map((s) => s.sectionId)).size,
          status: loadStatus(Math.max(allocated, timetabled), target),
          allocations: mine.map(({ teacherId: _t, ...a }) => a),
        };
      });
      return { defaultHoursPerWeek: settings.defaultHoursPerWeek, norms: settings.norms, rows };
    });
  }

  private async workloadSettings(tx: Tx) {
    const [row] = await tx.select({ value: academicSettings.value }).from(academicSettings).where(eq(academicSettings.kind, 'workload'));
    const parsed = SETTINGS_SCHEMAS.workload.safeParse({ ...SETTINGS_DEFAULTS.workload, ...(row?.value ?? {}) });
    return parsed.success ? parsed.data : SETTINGS_DEFAULTS.workload;
  }

  // ---- working days and the bell schedule ----

  /**
   * Working days by month between two dates for a programme: the weekdays of its period structure (Monday to Saturday
   * without one), less holidays, plus compensatory working days.
   */
  @Get('working-days')
  @Auth('user', READ)
  workingDays(@CurrentPrincipal() p: UserPrincipal, @Query('from') fromQ?: string, @Query('to') toQ?: string, @Query('programId') programId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (programId && !z.uuid().safeParse(programId).success) throw new BadRequestException('Unknown programme');
      const today = localParts(this.clock.now(), await this.timetable.tenantTimezone(tx)).date;
      const from = fromQ ? Day.parse(fromQ) : `${today.slice(0, 7)}-01`;
      const to = toQ ? Day.parse(toQ) : addDays(from, 180);
      if (from > to) throw new BadRequestException('from must be on or before to');
      if (addDays(from, 400) < to) throw new BadRequestException('Choose at most 400 days');
      const structure = await this.structureFor(tx, programId ?? null);
      const weekly = structure?.days ?? [1, 2, 3, 4, 5, 6];
      const holidays = await this.calendar.holidays(tx, from, to);
      const orders = await this.calendar.dayOrders(tx, from, to);
      const swapDates = new Set(orders.list.filter((x) => x.programIds === null || (programId && x.programIds.includes(programId))).map((x) => x.date));
      const months = workingDays(from, to, weekly, (d) => !!holidays.on(d, programId ?? null) || (!programId && !!holidays.forAll(d)), (d) => swapDates.has(d));
      return { from, to, weekly, structure: structure ? { id: structure.id, name: structure.name } : null, months, total: months.reduce((n, m) => n + m.days, 0) };
    });
  }

  /** The bell schedule a programme follows (its own, else the default one). */
  @Get('period-structure')
  @Auth('user', READ)
  async periodStructure(@CurrentPrincipal() p: UserPrincipal, @Query('programId') programId?: string, @Query('sectionId') sectionId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      let prog = programId && z.uuid().safeParse(programId).success ? programId : null;
      if (!prog && sectionId && z.uuid().safeParse(sectionId).success) prog = (await tx.select({ id: sections.programId }).from(sections).where(eq(sections.id, sectionId)))[0]?.id ?? null;
      return (await this.structureFor(tx, prog)) ?? null;
    });
  }

  private async structureFor(tx: Tx, programId: string | null) {
    const rows = await tx
      .select()
      .from(periodStructures)
      .where(programId ? or(eq(periodStructures.programId, programId), isNull(periodStructures.programId)) : isNull(periodStructures.programId))
      .orderBy(asc(periodStructures.sortOrder), asc(periodStructures.name));
    return rows.find((r) => r.programId === programId && programId) ?? rows.find((r) => r.isDefault) ?? rows[0] ?? null;
  }
}

